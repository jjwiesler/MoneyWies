"""
Expense query helpers.

Expense transactions: amount > 0 (money out), ignored = 0,
category NOT IN excluded list.
"""

EXPENSE_WHERE = """
    amount > 0
    AND ignored = 0
    AND (category IS NULL OR category NOT IN ('Internal Transfers', 'Credit Card Payment', 'Ignore'))
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
    row = conn.execute(
        f"""
        SELECT
            COUNT(*)                                                    AS count,
            COALESCE(SUM(amount), 0)                                    AS total,
            COALESCE(SUM(CASE WHEN category IS NOT NULL THEN amount ELSE 0 END), 0) AS classified
        FROM transactions
        WHERE {EXPENSE_WHERE} AND {pc}
        """,
        params,
    ).fetchone()

    by_category = conn.execute(
        f"""
        SELECT
            COALESCE(category, 'Unassigned') AS category,
            COUNT(*)                          AS count,
            COALESCE(SUM(amount), 0)          AS total
        FROM transactions
        WHERE {EXPENSE_WHERE} AND {pc}
        GROUP BY category
        ORDER BY total DESC
        """,
        params,
    ).fetchall()

    label_rows = conn.execute(
        f"""
        SELECT label, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
        FROM transactions
        WHERE {EXPENSE_WHERE} AND {pc} AND label IS NOT NULL AND label != ''
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
            COALESCE(SUM(amount), 0)         AS total
        FROM transactions
        WHERE {EXPENSE_WHERE} AND date LIKE ? {extra}
        GROUP BY month, category
        ORDER BY month
        """,
        [f"{year}%"] + extra_params,
    ).fetchall()
    return [dict(r) for r in rows]


def get_yoy(conn) -> list:
    rows = conn.execute(
        f"""
        SELECT
            strftime('%Y', date)              AS year,
            COALESCE(category, 'Unassigned') AS category,
            COALESCE(SUM(amount), 0)         AS total
        FROM transactions
        WHERE {EXPENSE_WHERE}
        GROUP BY year, category
        ORDER BY year, total DESC
        """,
    ).fetchall()
    return [dict(r) for r in rows]
