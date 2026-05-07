"""
Income query helpers.

Income transactions: amount < 0 (money in), account_type IN ('Cash'),
category NOT IN excluded list. Category field is used for income type
(W2 Payroll, Rental Income, etc.) — same system as regular transactions.
"""

INCOME_CATEGORIES = [
    "W2 Payroll", "1099 / Freelance", "K-1 Distribution",
    "Rental Income", "Investment", "Tax Refund", "Reimbursement", "Miscellaneous",
]

# IRS tax treatment groupings
TAX_GROUPS = {
    "ordinary":     ["W2 Payroll", "1099 / Freelance"],
    "pass_through": ["K-1 Distribution"],
    "rental":       ["Rental Income"],
    "investment":   ["Investment"],
    "other":        ["Tax Refund", "Reimbursement", "Miscellaneous"],
}

INCOME_WHERE = """
    amount < 0
    AND ignored = 0
    AND category NOT IN ('Internal Transfers', 'Credit Card Payment', 'Ignore')
    AND account_type IN ('Cash')
"""


def _period_clause(period: str):
    import datetime
    if not period:
        return "1=1", []
    if period == "ytd":
        year = datetime.date.today().year
        return "date LIKE ?", [f"{year}%"]
    if len(period) == 7:
        return "date LIKE ?", [f"{period}%"]
    if len(period) == 4:
        return "date LIKE ?", [f"{period}%"]
    return "1=1", []


def get_summary(conn, period: str = None) -> dict:
    pc, params = _period_clause(period)
    placeholders = ",".join("?" * len(INCOME_CATEGORIES))
    row = conn.execute(
        f"""
        SELECT
            COUNT(*)                                                                AS count,
            COALESCE(SUM(ABS(amount)), 0)                                          AS total,
            COALESCE(SUM(CASE WHEN category IN ({placeholders}) THEN ABS(amount) ELSE 0 END), 0) AS classified
        FROM transactions
        WHERE {INCOME_WHERE} AND {pc}
        """,
        INCOME_CATEGORIES + params,
    ).fetchone()

    by_category = conn.execute(
        f"""
        SELECT
            COALESCE(category, 'Unassigned') AS category,
            COUNT(*)                          AS count,
            COALESCE(SUM(ABS(amount)), 0)     AS total
        FROM transactions
        WHERE {INCOME_WHERE} AND {pc}
        GROUP BY category
        ORDER BY total DESC
        """,
        params,
    ).fetchall()

    label_rows = conn.execute(
        f"""
        SELECT label, COALESCE(SUM(ABS(amount)), 0) AS total, COUNT(*) AS count
        FROM transactions
        WHERE {INCOME_WHERE} AND {pc} AND label IS NOT NULL AND label != ''
        GROUP BY label
        ORDER BY total DESC
        """,
        params,
    ).fetchall()

    # flatten comma-separated labels
    by_label: dict = {}
    for r in label_rows:
        for lbl in r["label"].split(","):
            lbl = lbl.strip()
            if lbl:
                e = by_label.setdefault(lbl, {"label": lbl, "total": 0.0, "count": 0})
                e["total"] = round(e["total"] + r["total"], 2)
                e["count"] += r["count"]

    return {
        "count":       row["count"],
        "total":       round(row["total"], 2),
        "classified":  round(row["classified"], 2),
        "by_category": [dict(r) for r in by_category],
        "by_label":    sorted(by_label.values(), key=lambda x: x["total"], reverse=True),
    }


def get_monthly(conn, year: int, categories=None, labels=None, exclude_labels=None) -> list:
    extra_where, extra_params = [], []
    if categories:
        phs = ",".join("?" * len(categories))
        extra_where.append(f"category IN ({phs})")
        extra_params.extend(categories)
    if labels:
        conds = " OR ".join(["(',' || COALESCE(label,'') || ',') LIKE ?"] * len(labels))
        extra_where.append(f"({conds})")
        extra_params.extend(f"%,{l},%" for l in labels)
    if exclude_labels:
        conds = " OR ".join(["(',' || COALESCE(label,'') || ',') LIKE ?"] * len(exclude_labels))
        extra_where.append(f"NOT ({conds})")
        extra_params.extend(f"%,{l},%" for l in exclude_labels)
    extra = (" AND " + " AND ".join(extra_where)) if extra_where else ""
    rows = conn.execute(
        f"""
        SELECT
            strftime('%m', date)              AS month,
            COALESCE(category, 'Unassigned') AS category,
            COALESCE(SUM(ABS(amount)), 0)    AS total
        FROM transactions
        WHERE {INCOME_WHERE} AND date LIKE ? {extra}
        GROUP BY month, category
        ORDER BY month
        """,
        [f"{year}%"] + extra_params,
    ).fetchall()
    return [dict(r) for r in rows]


def get_by_source(conn, period: str = None) -> list:
    pc, params = _period_clause(period)
    rows = conn.execute(
        f"""
        SELECT
            COALESCE(category, 'Unassigned') AS category,
            COUNT(*)                          AS count,
            COALESCE(SUM(ABS(amount)), 0)    AS total,
            MAX(date)                         AS last_date,
            MIN(date)                         AS first_date
        FROM transactions
        WHERE {INCOME_WHERE} AND {pc}
        GROUP BY category
        ORDER BY total DESC
        """,
        params,
    ).fetchall()
    return [dict(r) for r in rows]


def get_yoy(conn) -> list:
    rows = conn.execute(
        f"""
        SELECT
            strftime('%Y', date)              AS year,
            COALESCE(category, 'Unassigned') AS category,
            COALESCE(SUM(ABS(amount)), 0)    AS total
        FROM transactions
        WHERE {INCOME_WHERE}
        GROUP BY year, category
        ORDER BY year, total DESC
        """,
    ).fetchall()
    return [dict(r) for r in rows]


def get_tax_exposure(conn, year: int) -> dict:
    rows = conn.execute(
        f"""
        SELECT
            COALESCE(category, 'Unassigned') AS category,
            COALESCE(SUM(ABS(amount)), 0)    AS total,
            COUNT(*)                          AS count
        FROM transactions
        WHERE {INCOME_WHERE} AND date LIKE ?
        GROUP BY category
        """,
        [f"{year}%"],
    ).fetchall()

    groups = {g: {"total": 0.0, "count": 0} for g in TAX_GROUPS}
    for row in rows:
        for group, cats in TAX_GROUPS.items():
            if row["category"] in cats:
                groups[group]["total"] += row["total"]
                groups[group]["count"] += row["count"]
                break

    return {k: {**v, "total": round(v["total"], 2)} for k, v in groups.items()}
