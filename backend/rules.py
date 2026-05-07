import uuid
from datetime import datetime, timezone
from typing import Optional


# ---------------------------------------------------------------------------
# Match logic
# ---------------------------------------------------------------------------

def _matches(txn, rule) -> bool:
    """All conditions are ANDed — every non-empty condition must match."""
    # Pattern (optional — empty/None matches any merchant)
    pattern = (rule["pattern"] or "").strip().lower()
    if pattern:
        name = (txn["name"] or "").lower()
        desc = (txn["description"] or "").lower()
        if pattern not in name and pattern not in desc:
            return False

    # Amount range (against absolute value)
    amt_min = rule["amount_min"]
    amt_max = rule["amount_max"]
    if amt_min is not None or amt_max is not None:
        abs_amt = abs(txn["amount"])
        if amt_min is not None and abs_amt < amt_min:
            return False
        if amt_max is not None and abs_amt > amt_max:
            return False

    # Account scope
    if rule["scope_account"]:
        if rule["scope_account"] != txn["account_number"]:
            return False

    # Institution scope
    if rule["scope_institution"]:
        if rule["scope_institution"].lower() != (txn["institution"] or "").lower():
            return False

    return True


# ---------------------------------------------------------------------------
# Apply rules to transactions
# ---------------------------------------------------------------------------

def apply_rules(conn, txn_ids: Optional[list] = None) -> dict:
    """
    Re-evaluate categorization for non-manual transactions, and apply label rules to all.

    Priority order (from PRD §6.1):
      1. manual override  — skip, never touched here
      2. user rules       — highest-priority matching rule wins
      3. imported         — fall back to imported_category

    Returns counts of how many rows were updated by rules vs reset to imported.
    """
    rules = conn.execute(
        "SELECT * FROM rules ORDER BY priority ASC"
    ).fetchall()

    cat_rules   = [r for r in rules if r["category"]]
    label_rules = [r for r in rules if r["label"]]

    if txn_ids is not None:
        placeholders = ",".join("?" * len(txn_ids))
        cat_txns = conn.execute(
            f"""SELECT id, name, description, institution, account_number, amount,
                       imported_category, category_source
                FROM transactions
                WHERE category_source != 'manual' AND id IN ({placeholders})""",
            txn_ids,
        ).fetchall()
        all_txns = conn.execute(
            f"""SELECT id, name, description, institution, account_number, amount, label
                FROM transactions WHERE id IN ({placeholders})""",
            txn_ids,
        ).fetchall()
    else:
        cat_txns = conn.execute(
            """SELECT id, name, description, institution, account_number, amount,
                      imported_category, category_source
               FROM transactions
               WHERE category_source != 'manual'"""
        ).fetchall()
        all_txns = conn.execute(
            """SELECT id, name, description, institution, account_number, amount, label
               FROM transactions"""
        ).fetchall()

    rule_hits   = 0
    import_hits = 0

    for txn in cat_txns:
        matched = None
        for rule in cat_rules:
            if _matches(txn, rule):
                matched = rule
                break

        if matched:
            conn.execute(
                """UPDATE transactions
                   SET category = ?, sub_category = ?, category_source = 'rule'
                   WHERE id = ?""",
                (matched["category"], matched["sub_category"], txn["id"]),
            )
            rule_hits += 1
        else:
            conn.execute(
                """UPDATE transactions
                   SET category = ?, sub_category = NULL, category_source = 'imported'
                   WHERE id = ?""",
                (txn["imported_category"], txn["id"]),
            )
            import_hits += 1

    if label_rules:
        for txn in all_txns:
            for rule in label_rules:
                if _matches(txn, rule):
                    rule_lbl = rule["label"][0].upper() + rule["label"][1:] if rule["label"] else rule["label"]
                    curr = txn["label"] or ""
                    existing_lower = {l.strip().lower() for l in curr.split(",") if l.strip()}
                    if rule_lbl.lower() not in existing_lower:
                        existing_parts = [l.strip() for l in curr.split(",") if l.strip()]
                        existing_parts.append(rule_lbl)
                        new_label = ",".join(sorted(existing_parts))
                        conn.execute(
                            "UPDATE transactions SET label = ? WHERE id = ?",
                            (new_label, txn["id"]),
                        )
                    break

    return {"rule_applied": rule_hits, "reset_to_imported": import_hits, "total": len(cat_txns)}


# ---------------------------------------------------------------------------
# Preview — which transactions would a rule match?
# ---------------------------------------------------------------------------

def preview_rule(conn, pattern: str, scope_institution: Optional[str], scope_account: Optional[str],
                 amount_min: Optional[float], amount_max: Optional[float], limit: int = 20) -> list:
    stub = {
        "pattern": pattern,
        "scope_institution": scope_institution,
        "scope_account": scope_account,
        "amount_min": amount_min,
        "amount_max": amount_max,
    }
    txns = conn.execute(
        """SELECT id, date, name, description, institution, account_number, account_name, amount, category
           FROM transactions ORDER BY date DESC"""
    ).fetchall()
    matches = [dict(t) for t in txns if _matches(t, stub)]
    return matches[:limit], len(matches)


# ---------------------------------------------------------------------------
# CRUD helpers
# ---------------------------------------------------------------------------

def _next_priority(conn) -> int:
    row = conn.execute("SELECT MAX(priority) FROM rules").fetchone()
    return (row[0] or 0) + 1


def create_rule(conn, pattern: str, category: Optional[str], sub_category: Optional[str],
                scope_institution: Optional[str], scope_account: Optional[str],
                amount_min: Optional[float] = None, amount_max: Optional[float] = None,
                label: Optional[str] = None) -> dict:
    rule_id  = str(uuid.uuid4())
    priority = _next_priority(conn)
    conn.execute(
        """INSERT INTO rules
           (id, pattern, category, sub_category, label, priority, scope_institution, scope_account, amount_min, amount_max)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (rule_id, pattern, category, sub_category, label, priority, scope_institution, scope_account, amount_min, amount_max),
    )
    return dict(conn.execute("SELECT * FROM rules WHERE id = ?", (rule_id,)).fetchone())


def update_rule(conn, rule_id: str, **fields) -> Optional[dict]:
    allowed = {"pattern", "category", "sub_category", "label", "scope_institution", "scope_account", "amount_min", "amount_max"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return dict(conn.execute("SELECT * FROM rules WHERE id = ?", (rule_id,)).fetchone())

    updates["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values     = list(updates.values()) + [rule_id]
    conn.execute(f"UPDATE rules SET {set_clause} WHERE id = ?", values)

    row = conn.execute("SELECT * FROM rules WHERE id = ?", (rule_id,)).fetchone()
    return dict(row) if row else None


def delete_rule(conn, rule_id: str) -> bool:
    cur = conn.execute("DELETE FROM rules WHERE id = ?", (rule_id,))
    return cur.rowcount > 0


def reorder_rules(conn, ordered_ids: list) -> None:
    """Reassign priorities 1..N based on the supplied order."""
    for i, rule_id in enumerate(ordered_ids, start=1):
        conn.execute("UPDATE rules SET priority = ? WHERE id = ?", (i, rule_id))
