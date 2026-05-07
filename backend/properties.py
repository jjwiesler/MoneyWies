"""
Property model — CRUD, allocation apply, Schedule E queries.

Allocation rules are non-destructive: the original transaction is never modified.
Splits are stored in transaction_allocations, which is a derived layer
recalculated whenever the rule changes.
"""
import uuid
from typing import Optional, List

SCHEDULE_E_CATEGORIES = [
    "Advertising",
    "Auto & Travel",
    "Cleaning & Maintenance",
    "Commissions",
    "Insurance",
    "Legal & Professional",
    "Management Fees",
    "Mortgage Interest",
    "Other Interest",
    "Repairs",
    "Supplies",
    "Taxes",
    "Utilities",
    "Other",
]

PROPERTY_TYPES = ["primary_home", "vacation_home", "rental", "other"]
UNIT_USAGE_TYPES = ["personal", "rental", "mixed"]


# ---------------------------------------------------------------------------
# Properties
# ---------------------------------------------------------------------------

def list_properties(conn) -> list:
    rows = conn.execute(
        "SELECT p.*, COUNT(u.id) AS unit_count FROM properties p LEFT JOIN units u ON u.property_id = p.id GROUP BY p.id ORDER BY p.name"
    ).fetchall()
    return [dict(r) for r in rows]


def get_property(conn, prop_id: str) -> Optional[dict]:
    row = conn.execute("SELECT * FROM properties WHERE id = ?", (prop_id,)).fetchone()
    if not row:
        return None
    result = dict(row)
    result["units"] = [dict(u) for u in conn.execute("SELECT * FROM units WHERE property_id = ? ORDER BY name", (prop_id,)).fetchall()]
    return result


def create_property(conn, name: str, address: Optional[str], property_type: Optional[str],
                    personal_use_days: int = 0, notes: Optional[str] = None) -> dict:
    pid = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO properties (id, name, address, property_type, personal_use_days, notes) VALUES (?,?,?,?,?,?)",
        (pid, name, address, property_type, personal_use_days, notes),
    )
    return dict(conn.execute("SELECT * FROM properties WHERE id = ?", (pid,)).fetchone())


def update_property(conn, prop_id: str, **fields) -> Optional[dict]:
    allowed = {"name", "address", "property_type", "personal_use_days", "notes"}
    updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(f"UPDATE properties SET {set_clause} WHERE id = ?", list(updates.values()) + [prop_id])
    return get_property(conn, prop_id)


def delete_property(conn, prop_id: str) -> bool:
    cur = conn.execute("DELETE FROM properties WHERE id = ?", (prop_id,))
    return cur.rowcount > 0


# ---------------------------------------------------------------------------
# Units
# ---------------------------------------------------------------------------

def create_unit(conn, property_id: str, name: str, usage_type: Optional[str], notes: Optional[str] = None) -> dict:
    uid = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO units (id, property_id, name, usage_type, notes) VALUES (?,?,?,?,?)",
        (uid, property_id, name, usage_type, notes),
    )
    return dict(conn.execute("SELECT * FROM units WHERE id = ?", (uid,)).fetchone())


def update_unit(conn, unit_id: str, **fields) -> Optional[dict]:
    allowed = {"name", "usage_type", "notes"}
    updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(f"UPDATE units SET {set_clause} WHERE id = ?", list(updates.values()) + [unit_id])
    row = conn.execute("SELECT * FROM units WHERE id = ?", (unit_id,)).fetchone()
    return dict(row) if row else None


def delete_unit(conn, unit_id: str) -> bool:
    cur = conn.execute("DELETE FROM units WHERE id = ?", (unit_id,))
    return cur.rowcount > 0


# ---------------------------------------------------------------------------
# Allocation rules
# ---------------------------------------------------------------------------

def list_allocation_rules(conn, property_id: Optional[str] = None) -> list:
    if property_id:
        rows = conn.execute("SELECT * FROM allocation_rules WHERE property_id = ? ORDER BY name", (property_id,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM allocation_rules ORDER BY name").fetchall()
    result = []
    for row in rows:
        r = dict(row)
        r["splits"] = [dict(s) for s in conn.execute(
            "SELECT * FROM allocation_rule_splits WHERE rule_id = ? ORDER BY percentage DESC", (r["id"],)
        ).fetchall()]
        result.append(r)
    return result


def create_allocation_rule(conn, name: str, property_id: Optional[str],
                           splits: list, notes: Optional[str] = None) -> dict:
    """
    splits: [{unit_id, label, percentage}, ...]  — percentages must sum to 100.
    """
    total_pct = sum(s["percentage"] for s in splits)
    if abs(total_pct - 100) > 0.01:
        raise ValueError(f"Split percentages must sum to 100, got {total_pct}")

    rule_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO allocation_rules (id, name, property_id, notes) VALUES (?,?,?,?)",
        (rule_id, name, property_id, notes),
    )
    for split in splits:
        conn.execute(
            "INSERT INTO allocation_rule_splits (id, rule_id, unit_id, label, percentage) VALUES (?,?,?,?,?)",
            (str(uuid.uuid4()), rule_id, split.get("unit_id"), split["label"], split["percentage"]),
        )
    return _get_rule_with_splits(conn, rule_id)


def update_allocation_rule(conn, rule_id: str, name: Optional[str], notes: Optional[str],
                           splits: Optional[list]) -> Optional[dict]:
    if name or notes:
        updates = {}
        if name:  updates["name"]  = name
        if notes: updates["notes"] = notes
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(f"UPDATE allocation_rules SET {set_clause} WHERE id = ?", list(updates.values()) + [rule_id])

    if splits is not None:
        total_pct = sum(s["percentage"] for s in splits)
        if abs(total_pct - 100) > 0.01:
            raise ValueError(f"Split percentages must sum to 100, got {total_pct}")
        conn.execute("DELETE FROM allocation_rule_splits WHERE rule_id = ?", (rule_id,))
        for split in splits:
            conn.execute(
                "INSERT INTO allocation_rule_splits (id, rule_id, unit_id, label, percentage) VALUES (?,?,?,?,?)",
                (str(uuid.uuid4()), rule_id, split.get("unit_id"), split["label"], split["percentage"]),
            )
        # Recompute allocations for all transactions using this rule
        _recompute_rule_allocations(conn, rule_id)

    return _get_rule_with_splits(conn, rule_id)


def delete_allocation_rule(conn, rule_id: str) -> bool:
    conn.execute("DELETE FROM transaction_allocations WHERE rule_id = ?", (rule_id,))
    conn.execute("DELETE FROM allocation_rule_splits WHERE rule_id = ?", (rule_id,))
    cur = conn.execute("DELETE FROM allocation_rules WHERE id = ?", (rule_id,))
    # Clear rule reference on transactions
    conn.execute("UPDATE transactions SET allocation_rule_id = NULL WHERE allocation_rule_id = ?", (rule_id,))
    return cur.rowcount > 0


def _get_rule_with_splits(conn, rule_id: str) -> Optional[dict]:
    row = conn.execute("SELECT * FROM allocation_rules WHERE id = ?", (rule_id,)).fetchone()
    if not row:
        return None
    r = dict(row)
    r["splits"] = [dict(s) for s in conn.execute(
        "SELECT * FROM allocation_rule_splits WHERE rule_id = ? ORDER BY percentage DESC", (rule_id,)
    ).fetchall()]
    return r


# ---------------------------------------------------------------------------
# Apply allocation rule to a transaction
# ---------------------------------------------------------------------------

def apply_allocation(conn, txn_id: str, rule_id: Optional[str]) -> dict:
    """
    Tag a transaction with an allocation rule and compute the splits.
    Passing rule_id=None clears the allocation.
    """
    # Clear existing allocations for this transaction
    conn.execute("DELETE FROM transaction_allocations WHERE transaction_id = ?", (txn_id,))
    conn.execute("UPDATE transactions SET allocation_rule_id = NULL WHERE id = ?", (txn_id,))

    if not rule_id:
        return {"ok": True, "allocations": []}

    txn = conn.execute("SELECT amount FROM transactions WHERE id = ?", (txn_id,)).fetchone()
    if not txn:
        raise ValueError("Transaction not found")

    splits = conn.execute(
        "SELECT * FROM allocation_rule_splits WHERE rule_id = ?", (rule_id,)
    ).fetchall()

    allocations = []
    for split in splits:
        alloc_amount = round(txn["amount"] * split["percentage"] / 100, 2)
        alloc_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO transaction_allocations
               (id, transaction_id, rule_id, split_id, unit_id, label, percentage, amount)
               VALUES (?,?,?,?,?,?,?,?)""",
            (alloc_id, txn_id, rule_id, split["id"], split["unit_id"],
             split["label"], split["percentage"], alloc_amount),
        )
        allocations.append({
            "id": alloc_id, "label": split["label"],
            "percentage": split["percentage"], "amount": alloc_amount,
        })

    conn.execute("UPDATE transactions SET allocation_rule_id = ? WHERE id = ?", (rule_id, txn_id))
    return {"ok": True, "allocations": allocations}


def _recompute_rule_allocations(conn, rule_id: str) -> int:
    """Re-apply a rule to all transactions already tagged with it."""
    txn_ids = [r["id"] for r in conn.execute(
        "SELECT id FROM transactions WHERE allocation_rule_id = ?", (rule_id,)
    ).fetchall()]
    for txn_id in txn_ids:
        apply_allocation(conn, txn_id, rule_id)
    return len(txn_ids)


# ---------------------------------------------------------------------------
# Property expense queries
# ---------------------------------------------------------------------------

def get_property_expenses(conn, property_id: str, period: Optional[str] = None) -> dict:
    """Total expenses for a property, broken down by unit and category."""
    where = "t.property_id = ? AND t.amount > 0 AND t.ignored = 0"
    params = [property_id]
    if period:
        where += " AND t.date LIKE ?"
        params.append(f"{period}%")

    # Direct property expenses (not allocated)
    direct = conn.execute(
        f"""SELECT t.unit_id, u.name AS unit_name, t.sub_category, t.schedule_e_category,
                   COALESCE(SUM(t.amount), 0) AS total, COUNT(*) AS count
            FROM transactions t
            LEFT JOIN units u ON u.id = t.unit_id
            WHERE {where}
            GROUP BY t.unit_id, t.sub_category, t.schedule_e_category""",
        params,
    ).fetchall()

    # Allocated expenses
    allocated = conn.execute(
        f"""SELECT ta.unit_id, u.name AS unit_name, ta.label,
                   t.sub_category, ta.schedule_e_category,
                   COALESCE(SUM(ta.amount), 0) AS total, COUNT(*) AS count
            FROM transaction_allocations ta
            JOIN transactions t ON t.id = ta.transaction_id
            LEFT JOIN units u ON u.id = ta.unit_id
            WHERE t.property_id = ? AND t.amount > 0 AND t.ignored = 0
            {"AND t.date LIKE ?" if period else ""}
            GROUP BY ta.unit_id, t.sub_category, ta.schedule_e_category""",
        [property_id] + ([f"{period}%"] if period else []),
    ).fetchall()

    return {
        "direct":    [dict(r) for r in direct],
        "allocated": [dict(r) for r in allocated],
    }


def get_schedule_e(conn, property_id: str, year: int) -> list:
    """
    IRS Schedule E line items for a property for a given year.
    Pulls from both direct transaction tags and allocated splits.
    """
    cats = conn.execute(
        """
        SELECT schedule_e_category, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
        FROM (
            SELECT t.schedule_e_category, t.amount
            FROM transactions t
            WHERE t.property_id = ? AND t.amount > 0 AND t.ignored = 0
              AND t.schedule_e_category IS NOT NULL AND t.date LIKE ?
              AND t.allocation_rule_id IS NULL
            UNION ALL
            SELECT ta.schedule_e_category, ta.amount
            FROM transaction_allocations ta
            JOIN transactions t ON t.id = ta.transaction_id
            WHERE t.property_id = ? AND t.amount > 0 AND t.ignored = 0
              AND ta.schedule_e_category IS NOT NULL AND t.date LIKE ?
        )
        GROUP BY schedule_e_category
        ORDER BY schedule_e_category
        """,
        [property_id, f"{year}%", property_id, f"{year}%"],
    ).fetchall()
    return [dict(r) for r in cats]
