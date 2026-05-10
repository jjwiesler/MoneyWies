import uuid
import json
from contextlib import asynccontextmanager


def _norm_label(s: str) -> str:
    s = s.strip()
    return (s[0].upper() + s[1:]) if s else s


def _norm_labels(label_str: str) -> str:
    if not label_str:
        return label_str
    parts = [_norm_label(l) for l in label_str.split(",") if l.strip()]
    seen, deduped = set(), []
    for p in parts:
        if p.lower() not in seen:
            seen.add(p.lower()); deduped.append(p)
    return ",".join(deduped) or None

from fastapi import FastAPI, UploadFile, File, Query, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from typing import Optional, List
from pydantic import BaseModel

from db import init_db, db, set_workspace_db
from importer import parse_rocketmoney, preview_rocketmoney, EXCLUDED_CATEGORIES
from workspaces import (
    ensure_default_workspace, get_workspace_by_token, create_workspace,
    list_workspaces_public, get_workspace_db_path,
)
from rules import apply_rules, preview_rule, create_rule, update_rule, delete_rule, reorder_rules
from income import get_summary, get_monthly, get_by_source, get_yoy, get_tax_exposure, INCOME_CATEGORIES
from expenses import get_summary as get_expense_summary, get_monthly as get_expense_monthly, get_yoy as get_expense_yoy
import ai as ai_module
from reconcile import parse_venmo_csv, parse_paypal_csv, detect_format, match_statements
from properties import (
    list_properties, get_property, create_property, update_property, delete_property,
    create_unit, update_unit, delete_unit,
    list_allocation_rules, create_allocation_rule, update_allocation_rule, delete_allocation_rule,
    apply_allocation, apply_auto_allocation_rules, get_property_expenses, get_expense_analysis,
    get_schedule_e, SCHEDULE_E_CATEGORIES,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_default_workspace()
    yield


app = FastAPI(title="MoneyWies API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


@app.middleware("http")
async def workspace_middleware(request: Request, call_next):
    token = request.cookies.get("ws_token") or request.headers.get("X-Workspace-Token")
    if token:
        ws = get_workspace_by_token(token)
        if ws:
            set_workspace_db(get_workspace_db_path(ws))
    return await call_next(request)


# ---------------------------------------------------------------------------
# Workspace
# ---------------------------------------------------------------------------

class WorkspaceAuthBody(BaseModel):
    token: str

class WorkspaceCreateBody(BaseModel):
    name: str


@app.get("/api/workspaces")
def list_ws():
    return list_workspaces_public()


@app.post("/api/workspaces")
def create_ws(body: WorkspaceCreateBody):
    ws = create_workspace(body.name)
    return {"id": ws["id"], "name": ws["name"], "token": ws["token"]}


@app.post("/api/workspace/auth")
def auth_workspace(body: WorkspaceAuthBody, response: Response):
    ws = get_workspace_by_token(body.token)
    if not ws:
        raise HTTPException(401, "Invalid token")
    response.set_cookie(
        "ws_token", body.token,
        httponly=True, samesite="lax", max_age=60 * 60 * 24 * 365,
    )
    return {"id": ws["id"], "name": ws["name"]}


@app.post("/api/workspace/logout")
def logout_workspace(response: Response):
    response.delete_cookie("ws_token")
    return {"ok": True}


@app.get("/api/workspace/current")
def current_workspace(request: Request):
    token = request.cookies.get("ws_token") or request.headers.get("X-Workspace-Token")
    if not token:
        raise HTTPException(401, "No workspace token")
    ws = get_workspace_by_token(token)
    if not ws:
        raise HTTPException(401, "Invalid token")
    return {"id": ws["id"], "name": ws["name"]}


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------

@app.post("/api/import/preview")
def preview_csv(file: UploadFile = File(...)):
    raw = file.file.read()
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError:
        content = raw.decode("latin-1")
    with db() as conn:
        return preview_rocketmoney(content, conn)


@app.post("/api/import")
def import_csv(file: UploadFile = File(...)):
    raw = file.file.read()
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError:
        content = raw.decode("latin-1")

    with db() as conn:
        stats = parse_rocketmoney(content, file.filename, conn)
        rule_stats = {"rule_applied": 0, "reset_to_imported": 0}
        date_range   = None
        by_account   = []
        by_category  = []

        if stats["new_ids"]:
            rule_stats = apply_rules(conn, txn_ids=stats["new_ids"])
            apply_auto_allocation_rules(conn, stats["new_ids"])
            ids_ph = ",".join("?" * len(stats["new_ids"]))

            dr = conn.execute(
                f"SELECT MIN(date) AS min_d, MAX(date) AS max_d FROM transactions WHERE id IN ({ids_ph})",
                stats["new_ids"],
            ).fetchone()
            if dr["min_d"]:
                date_range = {"from": dr["min_d"], "to": dr["max_d"]}

            by_account = [
                {"account": r["account_name"] or r["account_number"] or "Unknown", "count": r["count"]}
                for r in conn.execute(
                    f"""SELECT COALESCE(account_name, account_number, 'Unknown') AS account_name,
                               account_number, COUNT(*) AS count
                        FROM transactions WHERE id IN ({ids_ph})
                        GROUP BY account_name ORDER BY count DESC""",
                    stats["new_ids"],
                ).fetchall()
            ]

            by_category = [
                {"category": r["category"] or "Uncategorized", "source": r["category_source"], "count": r["count"]}
                for r in conn.execute(
                    f"""SELECT COALESCE(category, 'Uncategorized') AS category,
                               category_source, COUNT(*) AS count
                        FROM transactions WHERE id IN ({ids_ph})
                        GROUP BY category ORDER BY count DESC""",
                    stats["new_ids"],
                ).fetchall()
            ]

        conn.execute(
            """INSERT INTO import_log
               (id, filename, row_count, duplicate_count, inserted_count, rule_matched, transaction_ids)
               VALUES (?,?,?,?,?,?,?)""",
            (
                str(uuid.uuid4()),
                file.filename,
                stats["total"],
                stats["duplicates"],
                stats["inserted"],
                rule_stats["rule_applied"],
                json.dumps(stats["new_ids"]) if stats["new_ids"] else None,
            ),
        )

    return {
        "inserted":      stats["inserted"],
        "duplicates":    stats["duplicates"],
        "total":         stats["total"],
        "rule_matched":  rule_stats["rule_applied"],
        "uncategorized": rule_stats["reset_to_imported"],
        "date_range":    date_range,
        "by_account":    by_account,
        "by_category":   by_category,
    }


@app.get("/api/import-log")
def get_import_log():
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM import_log ORDER BY imported_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


@app.delete("/api/import/{log_id}")
def undo_import(log_id: str):
    with db() as conn:
        row = conn.execute("SELECT * FROM import_log WHERE id = ?", (log_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Import not found")
        ids = json.loads(row["transaction_ids"]) if row["transaction_ids"] else []
        if ids:
            ph = ",".join("?" * len(ids))
            conn.execute(f"DELETE FROM transactions WHERE id IN ({ph})", ids)
        conn.execute("DELETE FROM import_log WHERE id = ?", (log_id,))
    return {"deleted": len(ids)}


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

SORT_COLS = {"date", "amount", "name", "category", "account_name"}

@app.get("/api/transactions")
def list_transactions(
    search:          str  = Query(None),
    category:        str  = Query(None),
    account:         str  = Query(None),
    label:           str  = Query(None),
    label_search:    str  = Query(None),
    merchant_filter: str  = Query(None),
    amount_filter:   str  = Query(None),
    start:           str  = Query(None),
    end:             str  = Query(None),
    sort_by:         str  = Query("date"),
    sort_dir:        str  = Query("desc"),
    limit:           int  = Query(100, le=1000),
    offset:          int  = Query(0),
):
    where  = ["1=1"]
    params = []

    if search:
        where.append("(name LIKE ? OR description LIKE ? OR custom_name LIKE ? OR merchant_alias LIKE ? OR account_name LIKE ? OR account_number LIKE ? OR CAST(ABS(amount) AS TEXT) LIKE ?)")
        s = f"%{search}%"
        params += [s, s, s, s, s, s, f"%{search.lstrip('$').replace(',','')}%"]
    if merchant_filter:
        where.append("(name LIKE ? OR custom_name LIKE ? OR merchant_alias LIKE ?)")
        m = f"%{merchant_filter}%"
        params += [m, m, m]
    if amount_filter:
        where.append("CAST(ABS(amount) AS TEXT) LIKE ?")
        params.append(f"%{amount_filter.lstrip('$').replace(',', '')}%")
    if category:
        where.append("LOWER(category) = LOWER(?)")
        params.append(category)
    if account:
        where.append("account_number = ?")
        params.append(account)
    if label:
        where.append("(',' || COALESCE(label,'') || ',') LIKE ?")
        params.append(f"%,{label},%")
    if label_search:
        where.append("COALESCE(label,'') LIKE ?")
        params.append(f"%{label_search}%")
    if start:
        where.append("date >= ?")
        params.append(start)
    if end:
        where.append("date <= ?")
        params.append(end)

    col = sort_by if sort_by in SORT_COLS else "date"
    direction = "DESC" if sort_dir.lower() != "asc" else "ASC"
    clause = " AND ".join(where)

    with db() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) FROM transactions WHERE {clause}", params
        ).fetchone()[0]

        rows = conn.execute(
            f"SELECT * FROM transactions WHERE {clause} ORDER BY {col} {direction}, rowid DESC LIMIT ? OFFSET ?",
            params + [limit, offset],
        ).fetchall()

    return {"total": total, "transactions": [dict(r) for r in rows]}


@app.get("/api/transaction-years")
def transaction_years():
    with db() as conn:
        rows = conn.execute(
            "SELECT DISTINCT substr(date,1,4) AS year FROM transactions ORDER BY year DESC"
        ).fetchall()
    return [r["year"] for r in rows]


@app.get("/api/categories")
def list_categories():
    with db() as conn:
        txn_cats = {r["category"] for r in conn.execute(
            "SELECT DISTINCT category FROM transactions WHERE category IS NOT NULL"
        )}
        custom = {r["name"] for r in conn.execute("SELECT name FROM custom_categories")}
    return sorted(txn_cats | custom)


@app.post("/api/categories")
def add_category(name: str = Query(...)):
    with db() as conn:
        conn.execute("INSERT OR IGNORE INTO custom_categories (name) VALUES (?)", (name.strip(),))
    return {"ok": True}


@app.post("/api/categories/rename")
def rename_category(old_name: str = Query(...), new_name: str = Query(...)):
    with db() as conn:
        conn.execute("UPDATE transactions SET category = ? WHERE category = ?", (new_name, old_name))
        conn.execute("UPDATE rules SET category = ? WHERE category = ?", (new_name, old_name))
        conn.execute("UPDATE custom_categories SET name = ? WHERE name = ?", (new_name, old_name))
        conn.execute("INSERT OR IGNORE INTO custom_categories (name) VALUES (?)", (new_name,))
    return {"ok": True}


@app.delete("/api/categories/{name}")
def delete_category(name: str):
    with db() as conn:
        conn.execute("DELETE FROM custom_categories WHERE name = ?", (name,))
    return {"ok": True}


@app.get("/api/settings")
def get_settings():
    with db() as conn:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
    return {r["key"]: r["value"] for r in rows}


class SettingBody(BaseModel):
    value: str


@app.put("/api/settings/{key}")
def put_setting(key: str, body: SettingBody):
    with db() as conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, body.value),
        )
    return {"ok": True}


@app.post("/api/labels/rename")
def rename_label(old_name: str = Query(...), new_name: str = Query(...)):
    with db() as conn:
        rows = conn.execute(
            "SELECT id, label FROM transactions WHERE (',' || COALESCE(label,'') || ',') LIKE ?",
            (f"%,{old_name},%",)
        ).fetchall()
        for r in rows:
            parts = [new_name if l.strip() == old_name else l.strip() for l in r["label"].split(",") if l.strip()]
            conn.execute("UPDATE transactions SET label = ? WHERE id = ?", (",".join(parts), r["id"]))
    return {"ok": True}


@app.delete("/api/labels/{name}")
def delete_label(name: str):
    with db() as conn:
        rows = conn.execute(
            "SELECT id, label FROM transactions WHERE (',' || COALESCE(label,'') || ',') LIKE ?",
            (f"%,{name},%",)
        ).fetchall()
        for r in rows:
            parts = [l.strip() for l in r["label"].split(",") if l.strip() and l.strip() != name]
            conn.execute("UPDATE transactions SET label = ? WHERE id = ?", (",".join(parts) or None, r["id"]))
    return {"ok": True}


@app.patch("/api/transactions/{txn_id}/category")
def update_category(txn_id: str, category: str):
    with db() as conn:
        cur = conn.execute(
            "UPDATE transactions SET category = ?, category_source = 'manual' WHERE id = ?",
            (category, txn_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Transaction not found")
    return {"ok": True}


@app.patch("/api/transactions/{txn_id}/merchant_alias")
def update_merchant_alias(txn_id: str, merchant_alias: str = Query(default="")):
    with db() as conn:
        cur = conn.execute(
            "UPDATE transactions SET merchant_alias = ? WHERE id = ?",
            (merchant_alias.strip() or None, txn_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Transaction not found")
    return {"ok": True}


@app.patch("/api/transactions/{txn_id}/label")
def update_label(txn_id: str, label: str):
    with db() as conn:
        cur = conn.execute(
            "UPDATE transactions SET label = ? WHERE id = ?",
            (_norm_labels(label) if label else None, txn_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Transaction not found")
    return {"ok": True}


@app.get("/api/labels")
def list_labels():
    with db() as conn:
        rows = conn.execute(
            "SELECT label FROM transactions WHERE label IS NOT NULL AND label != ''"
        ).fetchall()
    seen = set()
    for r in rows:
        for l in r["label"].split(","):
            l = l.strip()
            if l:
                seen.add(l)
    return sorted(seen)


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

@app.get("/api/accounts")
def list_accounts():
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM accounts ORDER BY institution, account_name"
        ).fetchall()
    return [dict(r) for r in rows]


@app.patch("/api/accounts/{account_id}")
def update_account(account_id: str, ignored: bool):
    with db() as conn:
        cur = conn.execute(
            "UPDATE accounts SET ignored = ? WHERE id = ?",
            (1 if ignored else 0, account_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Account not found")
        # Propagate ignore flag to all transactions for this account
        acct = conn.execute(
            "SELECT account_number FROM accounts WHERE id = ?", (account_id,)
        ).fetchone()
        if acct:
            conn.execute(
                "UPDATE transactions SET ignored = ? WHERE account_number = ?",
                (1 if ignored else 0, acct["account_number"]),
            )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Stats (dashboard hero cards)
# ---------------------------------------------------------------------------

@app.get("/api/stats")
def get_stats(month: str = Query(None, description="YYYY-MM")):
    """
    Cashflow summary. Excludes ignored transactions and pass-through categories
    (Internal Transfers, Credit Card Payment).
    """
    excluded = ", ".join(f"'{c}'" for c in EXCLUDED_CATEGORIES)
    where  = [f"ignored = 0", f"(category NOT IN ({excluded}) OR category IS NULL)"]
    params = []

    if month:
        where.append("date LIKE ?")
        params.append(f"{month}%")

    clause = " AND ".join(where)

    with db() as conn:
        row = conn.execute(
            f"""
            SELECT
                COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS income,
                COALESCE(SUM(CASE WHEN amount > 0 THEN amount         ELSE 0 END), 0) AS spend
            FROM transactions
            WHERE {clause}
            """,
            params,
        ).fetchone()

    income = row["income"]
    spend  = row["spend"]
    net    = income - spend
    savings_rate = round(net / income * 100, 1) if income > 0 else 0.0

    return {
        "income":       round(income, 2),
        "spend":        round(spend, 2),
        "net":          round(net, 2),
        "savings_rate": savings_rate,
    }


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

@app.get("/api/reports/cashflow")
def reports_cashflow(year: int = Query(...), exclude_categories: str = Query(None), exclude_label: str = Query(None)):
    """Monthly income, spend, net for a full year."""
    excluded = ", ".join(f"'{c}'" for c in EXCLUDED_CATEGORIES)
    base = f"ignored = 0 AND (category NOT IN ({excluded}) OR category IS NULL) AND date LIKE ?"
    extra_parts = []
    extra_params = []
    if exclude_categories:
        cats = [c.strip() for c in exclude_categories.split(",") if c.strip()]
        ph = ", ".join("?" * len(cats))
        extra_parts.append(f"(category NOT IN ({ph}) OR category IS NULL)")
        extra_params += cats
    if exclude_label:
        for lbl in [l.strip() for l in exclude_label.split(",") if l.strip()]:
            extra_parts.append(f"NOT ((',' || COALESCE(label,'') || ',') LIKE ?)")
            extra_params.append(f"%,{lbl},%")
    extra = (" AND " + " AND ".join(extra_parts)) if extra_parts else ""
    result = []
    with db() as conn:
        for m in range(1, 13):
            prefix = f"{year}-{m:02d}%"
            params = [prefix] + extra_params
            row = conn.execute(
                f"""SELECT
                    COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS income,
                    COALESCE(SUM(CASE WHEN amount > 0 THEN amount         ELSE 0 END), 0) AS spend
                   FROM transactions WHERE {base}{extra}""",
                params,
            ).fetchone()
            result.append({
                "month": m,
                "label": f"{year}-{m:02d}",
                "income": round(row["income"], 2),
                "spend":  round(row["spend"], 2),
                "net":    round(row["income"] - row["spend"], 2),
            })
    return result


@app.get("/api/reports/category-spend")
def reports_category_spend(
    start:              str = Query(None),
    end:                str = Query(None),
    limit:              int = Query(20, le=100),
    exclude_categories: str = Query(None),
    exclude_label:      str = Query(None),
):
    """Top categories by spend, excluding pass-through categories."""
    excluded = ", ".join(f"'{c}'" for c in EXCLUDED_CATEGORIES)
    where  = [f"amount > 0", f"ignored = 0", f"(category NOT IN ({excluded}) OR category IS NULL)"]
    params = []
    if start:
        where.append("date >= ?"); params.append(start)
    if end:
        where.append("date <= ?"); params.append(end)
    if exclude_categories:
        cats = [c.strip() for c in exclude_categories.split(",") if c.strip()]
        ph = ", ".join("?" * len(cats))
        where.append(f"(category NOT IN ({ph}) OR category IS NULL)")
        params += cats
    if exclude_label:
        for lbl in [l.strip() for l in exclude_label.split(",") if l.strip()]:
            where.append(f"NOT ((',' || COALESCE(label,'') || ',') LIKE ?)")
            params.append(f"%,{lbl},%")
    clause = " AND ".join(where)
    with db() as conn:
        rows = conn.execute(
            f"""SELECT category, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
                FROM transactions WHERE {clause}
                GROUP BY category ORDER BY total DESC LIMIT ?""",
            params + [limit],
        ).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Rules
# ---------------------------------------------------------------------------

class RuleBody(BaseModel):
    pattern:           str = ""
    category:          Optional[str] = None
    sub_category:      Optional[str] = None
    label:             Optional[str] = None
    scope_institution: Optional[str] = None
    scope_account:     Optional[str] = None
    amount_min:        Optional[float] = None
    amount_max:        Optional[float] = None


class ReorderBody(BaseModel):
    ordered_ids: List[str]


@app.get("/api/rules")
def list_rules():
    with db() as conn:
        rows = conn.execute("SELECT * FROM rules ORDER BY priority ASC").fetchall()
    return [dict(r) for r in rows]


@app.post("/api/rules", status_code=201)
def create_rule_endpoint(body: RuleBody):
    if not (body.category or body.label):
        raise HTTPException(400, "Rule must set at least one of category or label")
    with db() as conn:
        rule = create_rule(conn, body.pattern, body.category, body.sub_category,
                           body.scope_institution, body.scope_account,
                           body.amount_min, body.amount_max, _norm_label(body.label) if body.label else None)
        stats = apply_rules(conn)
    return {"rule": rule, "apply_stats": stats}


@app.put("/api/rules/{rule_id}")
def update_rule_endpoint(rule_id: str, body: RuleBody):
    if not (body.category or body.label):
        raise HTTPException(400, "Rule must set at least one of category or label")
    with db() as conn:
        rule = update_rule(conn, rule_id,
                           pattern=body.pattern, category=body.category,
                           sub_category=body.sub_category,
                           label=_norm_label(body.label) if body.label else None,
                           scope_institution=body.scope_institution,
                           scope_account=body.scope_account,
                           amount_min=body.amount_min,
                           amount_max=body.amount_max)
        if rule is None:
            raise HTTPException(404, "Rule not found")
        stats = apply_rules(conn)
    return {"rule": rule, "apply_stats": stats}


@app.delete("/api/rules/{rule_id}")
def delete_rule_endpoint(rule_id: str):
    with db() as conn:
        if not delete_rule(conn, rule_id):
            raise HTTPException(404, "Rule not found")
        stats = apply_rules(conn)
    return {"ok": True, "apply_stats": stats}


@app.post("/api/rules/{rule_id}/apply")
def apply_rule_endpoint(rule_id: str):
    with db() as conn:
        if not conn.execute("SELECT 1 FROM rules WHERE id = ?", (rule_id,)).fetchone():
            raise HTTPException(404, "Rule not found")
        stats = apply_rules(conn)
    return {"ok": True, "apply_stats": stats}


@app.post("/api/rules/reorder")
def reorder_rules_endpoint(body: ReorderBody):
    with db() as conn:
        reorder_rules(conn, body.ordered_ids)
        stats = apply_rules(conn)
    return {"ok": True, "apply_stats": stats}


@app.get("/api/rules/preview")
def preview_rule_endpoint(
    pattern:           str   = Query(""),
    scope_institution: str   = Query(None),
    scope_account:     str   = Query(None),
    amount_min:        float = Query(None),
    amount_max:        float = Query(None),
    limit:             int   = Query(20, le=200),
):
    with db() as conn:
        matches, total = preview_rule(conn, pattern, scope_institution, scope_account,
                                      amount_min, amount_max, limit)
    return {"total_matches": total, "sample": matches}


# ---------------------------------------------------------------------------
# Income
# ---------------------------------------------------------------------------

class IncomeSourceBody(BaseModel):
    name:                 str
    source_type:          str
    is_active:            Optional[bool] = True
    is_recurring:         Optional[bool] = False
    expected_amount:      Optional[float] = None
    expected_day_of_month: Optional[int] = None
    notes:                Optional[str] = None


class IncomeTxnPatch(BaseModel):
    income_source_type: Optional[str] = None
    income_source_name: Optional[str] = None
    income_source_id:   Optional[str] = None
    is_recurring:       Optional[bool] = None
    expected_amount:    Optional[float] = None
    tax_year:           Optional[int] = None
    is_gross:           Optional[bool] = None


@app.get("/api/income/source-types")
def income_source_types():
    return INCOME_CATEGORIES


@app.get("/api/income/summary")
def income_summary(period: str = Query(None, description="YYYY-MM | YYYY | ytd")):
    with db() as conn:
        return get_summary(conn, period)


@app.get("/api/income/monthly")
def income_monthly(year: int = Query(...), category: str = Query(None), label: str = Query(None), exclude_label: str = Query(None)):
    cats   = [c.strip() for c in category.split(",")]      if category      else None
    lbls   = [l.strip() for l in label.split(",")]         if label         else None
    ex_lbs = [l.strip() for l in exclude_label.split(",")] if exclude_label else None
    with db() as conn:
        return get_monthly(conn, year, categories=cats, labels=lbls, exclude_labels=ex_lbs)


@app.get("/api/income/by-source")
def income_by_source(period: str = Query(None)):
    with db() as conn:
        return get_by_source(conn, period)


@app.get("/api/income/yoy")
def income_yoy():
    with db() as conn:
        return get_yoy(conn)


@app.get("/api/income/tax-exposure")
def income_tax_exposure(year: int = Query(...)):
    with db() as conn:
        return get_tax_exposure(conn, year)


@app.get("/api/income/transactions")
def income_transactions(
    period:          str = Query(None),
    category:        str = Query(None),
    label:           str = Query(None),
    label_search:    str = Query(None),
    merchant_filter: str = Query(None),
    exclude_label:   str = Query(None),
    search:          str = Query(None),
    amount_filter:   str = Query(None),
    sort_by:         str = Query("date"),
    sort_dir:        str = Query("desc"),
    limit:           int = Query(100, le=500),
    offset:          int = Query(0),
):
    from income import INCOME_WHERE, _period_clause
    pc, params = _period_clause(period)
    where  = [INCOME_WHERE, pc]
    if category:
        cats = [c.strip() for c in category.split(",") if c.strip()]
        if len(cats) == 1:
            where.append("LOWER(category) = LOWER(?)"); params.append(cats[0])
        elif cats:
            where.append(f"category IN ({','.join('?'*len(cats))})"); params.extend(cats)
    if label:
        lbls = [l.strip() for l in label.split(",") if l.strip()]
        if lbls:
            conds = " OR ".join(["(',' || COALESCE(label,'') || ',') LIKE ?"] * len(lbls))
            where.append(f"({conds})")
            params.extend(f"%,{l},%" for l in lbls)
    if exclude_label:
        ex_lbs = [l.strip() for l in exclude_label.split(",") if l.strip()]
        if ex_lbs:
            conds = " OR ".join(["(',' || COALESCE(label,'') || ',') LIKE ?"] * len(ex_lbs))
            where.append(f"NOT ({conds})")
            params.extend(f"%,{l},%" for l in ex_lbs)
    if search:
        where.append("(name LIKE ? OR description LIKE ? OR custom_name LIKE ? OR merchant_alias LIKE ? OR account_name LIKE ? OR account_number LIKE ? OR CAST(ABS(amount) AS TEXT) LIKE ?)")
        s = f"%{search}%"
        params.extend([s, s, s, s, s, s, f"%{search.lstrip('$').replace(',', '')}%"])
    if merchant_filter:
        where.append("(name LIKE ? OR custom_name LIKE ? OR merchant_alias LIKE ?)")
        m = f"%{merchant_filter}%"
        params.extend([m, m, m])
    if amount_filter:
        where.append("CAST(ABS(amount) AS TEXT) LIKE ?")
        params.append(f"%{amount_filter.lstrip('$').replace(',', '')}%")
    if label_search:
        where.append("COALESCE(label,'') LIKE ?")
        params.append(f"%{label_search}%")

    col       = sort_by if sort_by in SORT_COLS else "date"
    direction = "DESC" if sort_dir.lower() != "asc" else "ASC"
    clause = " AND ".join(where)
    with db() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM transactions WHERE {clause}", params).fetchone()[0]
        rows  = conn.execute(
            f"SELECT * FROM transactions WHERE {clause} ORDER BY {col} {direction}, rowid DESC LIMIT ? OFFSET ?",
            params + [limit, offset],
        ).fetchall()
    return {"total": total, "transactions": [dict(r) for r in rows]}


@app.patch("/api/income/transactions/{txn_id}")
def patch_income_txn(txn_id: str, body: IncomeTxnPatch):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    with db() as conn:
        cur = conn.execute(
            f"UPDATE transactions SET {set_clause} WHERE id = ?",
            list(updates.values()) + [txn_id],
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Transaction not found")
    return {"ok": True}


@app.get("/api/income/sources")
def list_income_sources():
    with db() as conn:
        rows = conn.execute("SELECT * FROM income_sources ORDER BY name").fetchall()
    return [dict(r) for r in rows]


@app.post("/api/income/sources", status_code=201)
def create_income_source(body: IncomeSourceBody):
    import uuid as _uuid
    sid = str(_uuid.uuid4())
    with db() as conn:
        conn.execute(
            """INSERT INTO income_sources
               (id, name, source_type, is_active, is_recurring, expected_amount, expected_day_of_month, notes)
               VALUES (?,?,?,?,?,?,?,?)""",
            (sid, body.name, body.source_type, 1 if body.is_active else 0,
             1 if body.is_recurring else 0, body.expected_amount,
             body.expected_day_of_month, body.notes),
        )
        row = conn.execute("SELECT * FROM income_sources WHERE id = ?", (sid,)).fetchone()
    return dict(row)


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------

@app.get("/api/expenses/summary")
def expense_summary(period: str = Query(None, description="YYYY-MM | YYYY | ytd")):
    with db() as conn:
        return get_expense_summary(conn, period)


@app.get("/api/expenses/monthly")
def expense_monthly(year: int = Query(...), category: str = Query(None), label: str = Query(None), exclude_label: str = Query(None)):
    cats   = [c.strip() for c in category.split(",")]      if category      else None
    lbls   = [l.strip() for l in label.split(",")]         if label         else None
    ex_lbs = [l.strip() for l in exclude_label.split(",")] if exclude_label else None
    with db() as conn:
        return get_expense_monthly(conn, year, categories=cats, labels=lbls, exclude_labels=ex_lbs)


@app.get("/api/expenses/yoy")
def expense_yoy():
    with db() as conn:
        return get_expense_yoy(conn)


@app.get("/api/expenses/transactions")
def expense_transactions(
    period:          str = Query(None),
    category:        str = Query(None),
    label:           str = Query(None),
    label_search:    str = Query(None),
    merchant_filter: str = Query(None),
    exclude_label:   str = Query(None),
    search:          str = Query(None),
    amount_filter:   str = Query(None),
    sort_by:         str = Query("date"),
    sort_dir:        str = Query("desc"),
    limit:           int = Query(100, le=500),
    offset:          int = Query(0),
):
    from expenses import EXPENSE_WHERE, _period_clause as _expense_period_clause
    pc, params = _expense_period_clause(period)
    where  = [EXPENSE_WHERE, pc]
    if category:
        cats = [c.strip() for c in category.split(",") if c.strip()]
        if len(cats) == 1:
            where.append("LOWER(category) = LOWER(?)"); params.append(cats[0])
        elif cats:
            where.append(f"category IN ({','.join('?'*len(cats))})"); params.extend(cats)
    if label:
        lbls = [l.strip() for l in label.split(",") if l.strip()]
        if lbls:
            conds = " OR ".join(["(',' || COALESCE(label,'') || ',') LIKE ?"] * len(lbls))
            where.append(f"({conds})")
            params.extend(f"%,{l},%" for l in lbls)
    if exclude_label:
        ex_lbs = [l.strip() for l in exclude_label.split(",") if l.strip()]
        if ex_lbs:
            conds = " OR ".join(["(',' || COALESCE(label,'') || ',') LIKE ?"] * len(ex_lbs))
            where.append(f"NOT ({conds})")
            params.extend(f"%,{l},%" for l in ex_lbs)
    if search:
        where.append("(name LIKE ? OR description LIKE ? OR custom_name LIKE ? OR merchant_alias LIKE ? OR account_name LIKE ? OR account_number LIKE ? OR CAST(ABS(amount) AS TEXT) LIKE ?)")
        s = f"%{search}%"
        params.extend([s, s, s, s, s, s, f"%{search.lstrip('$').replace(',', '')}%"])
    if merchant_filter:
        where.append("(name LIKE ? OR custom_name LIKE ? OR merchant_alias LIKE ?)")
        m = f"%{merchant_filter}%"
        params.extend([m, m, m])
    if amount_filter:
        where.append("CAST(ABS(amount) AS TEXT) LIKE ?")
        params.append(f"%{amount_filter.lstrip('$').replace(',', '')}%")
    if label_search:
        where.append("COALESCE(label,'') LIKE ?")
        params.append(f"%{label_search}%")

    col       = sort_by if sort_by in SORT_COLS else "date"
    direction = "DESC" if sort_dir.lower() != "asc" else "ASC"
    clause = " AND ".join(where)
    with db() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM transactions WHERE {clause}", params).fetchone()[0]
        rows  = conn.execute(
            f"SELECT * FROM transactions WHERE {clause} ORDER BY {col} {direction}, rowid DESC LIMIT ? OFFSET ?",
            params + [limit, offset],
        ).fetchall()
    return {"total": total, "transactions": [dict(r) for r in rows]}


# ---------------------------------------------------------------------------
# Properties
# ---------------------------------------------------------------------------

class PropertyBody(BaseModel):
    name:              str
    address:           Optional[str] = None
    property_type:     Optional[str] = None
    personal_use_days: Optional[int] = 0
    notes:             Optional[str] = None


class UnitBody(BaseModel):
    name:       str
    usage_type: Optional[str] = None
    notes:      Optional[str] = None


class AllocationSplit(BaseModel):
    unit_id:    Optional[str] = None
    label:      str
    percentage: float


class AllocationRuleBody(BaseModel):
    name:             str
    property_id:      Optional[str] = None
    splits:           List[AllocationSplit]
    notes:            Optional[str] = None
    merchant_pattern: Optional[str] = None


class RecurringOverridePatch(BaseModel):
    is_recurring_override: Optional[bool] = None  # None=auto, True=recurring, False=one-time


class ApplyAllocationBody(BaseModel):
    rule_id: Optional[str] = None


class TxnPropertyPatch(BaseModel):
    property_id:           Optional[str] = None
    unit_id:               Optional[str] = None
    schedule_e_category:   Optional[str] = None
    is_capital_improvement: Optional[bool] = None
    is_deductible:         Optional[bool] = None


@app.get("/api/properties/schedule-e-categories")
def schedule_e_categories():
    return SCHEDULE_E_CATEGORIES


@app.get("/api/properties")
def list_properties_endpoint():
    with db() as conn:
        return list_properties(conn)


@app.post("/api/properties", status_code=201)
def create_property_endpoint(body: PropertyBody):
    with db() as conn:
        return create_property(conn, body.name, body.address, body.property_type,
                               body.personal_use_days or 0, body.notes)


@app.get("/api/properties/{prop_id}")
def get_property_endpoint(prop_id: str):
    with db() as conn:
        prop = get_property(conn, prop_id)
    if not prop:
        raise HTTPException(404, "Property not found")
    return prop


@app.put("/api/properties/{prop_id}")
def update_property_endpoint(prop_id: str, body: PropertyBody):
    with db() as conn:
        prop = update_property(conn, prop_id, **body.dict())
    if not prop:
        raise HTTPException(404, "Property not found")
    return prop


@app.delete("/api/properties/{prop_id}")
def delete_property_endpoint(prop_id: str):
    with db() as conn:
        if not delete_property(conn, prop_id):
            raise HTTPException(404, "Property not found")
    return {"ok": True}


@app.get("/api/properties/{prop_id}/expenses")
def property_expenses(prop_id: str, period: str = Query(None)):
    with db() as conn:
        return get_property_expenses(conn, prop_id, period)


@app.get("/api/properties/{prop_id}/schedule-e")
def property_schedule_e(prop_id: str, year: int = Query(...)):
    with db() as conn:
        return get_schedule_e(conn, prop_id, year)


# ---------------------------------------------------------------------------
# Units
# ---------------------------------------------------------------------------

@app.post("/api/properties/{prop_id}/units", status_code=201)
def create_unit_endpoint(prop_id: str, body: UnitBody):
    with db() as conn:
        return create_unit(conn, prop_id, body.name, body.usage_type, body.notes)


@app.put("/api/units/{unit_id}")
def update_unit_endpoint(unit_id: str, body: UnitBody):
    with db() as conn:
        unit = update_unit(conn, unit_id, **body.dict())
    if not unit:
        raise HTTPException(404, "Unit not found")
    return unit


@app.delete("/api/units/{unit_id}")
def delete_unit_endpoint(unit_id: str):
    with db() as conn:
        if not delete_unit(conn, unit_id):
            raise HTTPException(404, "Unit not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Allocation rules
# ---------------------------------------------------------------------------

@app.get("/api/allocation-rules")
def list_allocation_rules_endpoint(property_id: str = Query(None)):
    with db() as conn:
        return list_allocation_rules(conn, property_id)


@app.post("/api/allocation-rules", status_code=201)
def create_allocation_rule_endpoint(body: AllocationRuleBody):
    splits = [s.dict() for s in body.splits]
    with db() as conn:
        try:
            return create_allocation_rule(
                conn, body.name, body.property_id, splits, body.notes,
                merchant_pattern=body.merchant_pattern or None,
            )
        except ValueError as e:
            raise HTTPException(400, str(e))


@app.put("/api/allocation-rules/{rule_id}")
def update_allocation_rule_endpoint(rule_id: str, body: AllocationRuleBody):
    splits = [s.dict() for s in body.splits]
    with db() as conn:
        try:
            rule = update_allocation_rule(
                conn, rule_id, body.name, body.notes, splits,
                merchant_pattern=body.merchant_pattern,
            )
        except ValueError as e:
            raise HTTPException(400, str(e))
    if not rule:
        raise HTTPException(404, "Allocation rule not found")
    return rule


@app.delete("/api/allocation-rules/{rule_id}")
def delete_allocation_rule_endpoint(rule_id: str):
    with db() as conn:
        if not delete_allocation_rule(conn, rule_id):
            raise HTTPException(404, "Allocation rule not found")
    return {"ok": True}


@app.post("/api/transactions/{txn_id}/allocate")
def allocate_transaction(txn_id: str, body: ApplyAllocationBody):
    with db() as conn:
        try:
            return apply_allocation(conn, txn_id, body.rule_id)
        except ValueError as e:
            raise HTTPException(404, str(e))


@app.patch("/api/transactions/{txn_id}/property")
def patch_txn_property(txn_id: str, body: TxnPropertyPatch):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    # Convert bools to ints for SQLite
    for k in ("is_capital_improvement", "is_deductible"):
        if k in updates:
            updates[k] = 1 if updates[k] else 0
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    with db() as conn:
        cur = conn.execute(
            f"UPDATE transactions SET {set_clause} WHERE id = ?",
            list(updates.values()) + [txn_id],
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Transaction not found")
    return {"ok": True}


@app.patch("/api/transactions/{txn_id}/recurring")
def patch_txn_recurring(txn_id: str, body: RecurringOverridePatch):
    val = None if body.is_recurring_override is None else (1 if body.is_recurring_override else 0)
    with db() as conn:
        cur = conn.execute(
            "UPDATE transactions SET is_recurring_override = ? WHERE id = ?", (val, txn_id)
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Transaction not found")
    return {"ok": True}


@app.get("/api/properties/{prop_id}/expense-analysis")
def property_expense_analysis(prop_id: str, year: int = Query(None)):
    if year is None:
        from datetime import date
        year = date.today().year
    with db() as conn:
        return get_expense_analysis(conn, prop_id, year)

# ---------------------------------------------------------------------------
# AI — Claude integration (#10 & #11)
# ---------------------------------------------------------------------------

class SuggestRuleBody(BaseModel):
    description: str


class NLSearchBody(BaseModel):
    query: str


class NormalizeBody(BaseModel):
    txn_ids: Optional[List[str]] = None


def _ai_error(e: Exception):
    msg = str(e)
    if "ANTHROPIC_API_KEY" in msg:
        raise HTTPException(503, "Anthropic API key not configured. Add it in Settings.")
    if "OPENAI_API_KEY" in msg:
        raise HTTPException(503, "OpenAI API key not configured. Add it in Settings.")
    if "GOOGLE_API_KEY" in msg:
        raise HTTPException(503, "Google API key not configured. Add it in Settings.")
    if "RESOURCE_EXHAUSTED" in msg:
        raise HTTPException(429, "Gemini quota exceeded. Enable billing at aistudio.google.com or try again later.")
    raise HTTPException(500, msg)


@app.post("/api/ai/suggest-rule")
def ai_suggest_rule(body: SuggestRuleBody):
    try:
        with db() as conn:
            return ai_module.suggest_rule(conn, body.description)
    except Exception as e:
        _ai_error(e)


@app.post("/api/ai/bulk-categorize")
def ai_bulk_categorize():
    try:
        with db() as conn:
            return ai_module.bulk_categorize(conn)
    except Exception as e:
        _ai_error(e)


@app.post("/api/ai/normalize-vendors")
def ai_normalize_vendors(body: NormalizeBody):
    try:
        with db() as conn:
            count = ai_module.normalize_vendors(conn, body.txn_ids)
        return {"ok": True, "updated": count}
    except Exception as e:
        _ai_error(e)


@app.post("/api/ai/classify-income/{txn_id}")
def ai_classify_income(txn_id: str):
    try:
        with db() as conn:
            return ai_module.classify_income(conn, txn_id)
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        _ai_error(e)


@app.get("/api/ai/anomalies")
def ai_anomalies():
    with db() as conn:
        return ai_module.detect_anomalies(conn)


@app.post("/api/ai/search")
def ai_nl_search(body: NLSearchBody):
    try:
        with db() as conn:
            return ai_module.nl_search(conn, body.query)
    except Exception as e:
        _ai_error(e)


@app.get("/api/ai/token-usage")
def ai_token_usage():
    with db() as conn:
        return ai_module.get_token_usage_summary(conn)


class ChatBody(BaseModel):
    messages: List[dict]


@app.post("/api/ai/chat")
def ai_chat(body: ChatBody):
    try:
        with db() as conn:
            return ai_module.chat(conn, body.messages)
    except Exception as e:
        _ai_error(e)


@app.get("/api/ai/recurring")
def ai_recurring():
    with db() as conn:
        return ai_module.detect_recurring(conn)


# ---------------------------------------------------------------------------
# Reconcile
# ---------------------------------------------------------------------------

@app.post("/api/reconcile/preview")
async def reconcile_preview(file: UploadFile = File(...)):
    raw = await file.read()
    content = raw.decode("utf-8", errors="replace")
    fmt = detect_format(content, file.filename or "")
    if fmt == "venmo":
        rows = parse_venmo_csv(content)
    else:
        rows = parse_paypal_csv(content)
    with db() as conn:
        matches = match_statements(conn, rows)
    return matches


class ReconcileApplyItem(BaseModel):
    txn_id: str
    merchant_alias: str
    force: bool = False


class ReconcileApplyBody(BaseModel):
    items: List[ReconcileApplyItem]


@app.post("/api/reconcile/apply")
def reconcile_apply(body: ReconcileApplyBody):
    updated = []
    skipped = []
    with db() as conn:
        for item in body.items:
            row = conn.execute(
                "SELECT merchant_alias FROM transactions WHERE id = ?", (item.txn_id,)
            ).fetchone()
            if row is None:
                continue
            if row["merchant_alias"] and not item.force:
                skipped.append(item.txn_id)
                continue
            conn.execute(
                "UPDATE transactions SET merchant_alias = ? WHERE id = ?",
                (item.merchant_alias.strip() or None, item.txn_id),
            )
            updated.append(item.txn_id)
    return {"updated": len(updated), "skipped": len(skipped)}
