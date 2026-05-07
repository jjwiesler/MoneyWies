import csv
import io
from datetime import datetime, timedelta


def _parse_amount(raw: str) -> tuple[float, str]:
    """Returns (amount_abs, direction) from Venmo amount string like '- $350.00' or '+ $4,250.00'."""
    s = raw.strip().strip('"')
    direction = "in" if s.startswith("+") else "out"
    s = s.lstrip("+-").replace("$", "").replace(",", "").strip()
    return round(float(s), 2), direction


def parse_venmo_csv(content: str) -> list[dict]:
    reader = csv.reader(io.StringIO(content))
    rows = list(reader)

    # Find header row: first row whose first non-empty cell is "ID"
    header_idx = None
    for i, row in enumerate(rows):
        cells = [c.strip() for c in row]
        if "ID" in cells and cells.index("ID") <= 2:  # ID is in first few columns
            header_idx = i
            break
    if header_idx is None:
        raise ValueError("Could not find Venmo CSV header row")

    header = [c.strip() for c in rows[header_idx]]

    def col(row, name):
        try:
            return row[header.index(name)].strip()
        except (ValueError, IndexError):
            return ""

    results = []
    for row in rows[header_idx + 1:]:
        if not any(c.strip() for c in row):
            continue
        row_id = col(row, "ID")
        if not row_id:
            continue
        status = col(row, "Status")
        if status == "Refunded":
            continue

        raw_amount = col(row, "Amount (total)")
        if not raw_amount.strip():
            continue
        amount, direction = _parse_amount(raw_amount)

        raw_dt = col(row, "Datetime")
        date = raw_dt.split("T")[0] if "T" in raw_dt else raw_dt[:10]

        note = col(row, "Note") or "(no note)"
        from_name = col(row, "From")
        to_name = col(row, "To")
        counterparty = to_name if direction == "out" else from_name

        proposed_alias = f"Venmo - {note} ({counterparty})" if counterparty else f"Venmo - {note}"

        results.append({
            "id": row_id,
            "date": date,
            "amount": amount,
            "direction": direction,
            "note": note,
            "from_name": from_name,
            "to_name": to_name,
            "proposed_alias": proposed_alias,
        })
    return results


def parse_paypal_csv(content: str) -> list[dict]:
    # Strip UTF-8 BOM if present
    content = content.lstrip("﻿")
    rows = list(csv.DictReader(io.StringIO(content)))

    # First pass: build txn_id → row lookup for name resolution
    txn_by_id = {}
    for row in rows:
        tid = (row.get("Transaction ID") or "").strip()
        if tid:
            txn_by_id[tid] = row

    results = []
    seen_ids = set()

    for row in rows:
        raw_date = (row.get("Date") or "").strip()
        gross_raw = (row.get("Gross") or "").strip()
        if not raw_date or not gross_raw:
            continue

        currency = (row.get("Currency") or "").strip()
        if currency and currency != "USD":
            continue

        txn_id = (row.get("Transaction ID") or "").strip()
        if txn_id in seen_ids:
            continue
        seen_ids.add(txn_id)

        try:
            date = datetime.strptime(raw_date, "%m/%d/%Y").strftime("%Y-%m-%d")
        except ValueError:
            continue

        gross = gross_raw.replace(",", "").replace("$", "")
        try:
            gross_val = float(gross)
        except ValueError:
            continue
        if gross_val == 0:
            continue

        description = (row.get("Description") or "").strip()
        ref_txn_id = (row.get("Reference Txn ID") or "").strip()

        # "Bank Deposit to PP Account" = actual bank debit (what shows in bank as "PayPal")
        # Resolve merchant name from the linked BillPay/payment row via Reference Txn ID
        if "Bank Deposit to PP Account" in description:
            amount = round(abs(gross_val), 2)
            direction = "out"  # money leaving bank
            ref_row = txn_by_id.get(ref_txn_id)
            name = (ref_row.get("Name") or "").strip() if ref_row else ""
            ref_desc = (ref_row.get("Description") or "").strip() if ref_row else ""
            note = name or ref_desc or description
            proposed_alias = f"PayPal - {name}" if name else f"PayPal - {ref_desc}" if ref_desc else "PayPal"

        # "BillPay transaction" is a PayPal-internal debit — skip, covered by Bank Deposit row
        elif "BillPay transaction" in description:
            continue

        # Income/receipts and other payments — may or may not hit bank
        else:
            amount = round(abs(gross_val), 2)
            direction = "out" if gross_val < 0 else "in"
            name = (row.get("Name") or "").strip()
            note = name or description
            if name:
                proposed_alias = f"PayPal - {name}"
            elif description:
                proposed_alias = f"PayPal - {description}"
            else:
                proposed_alias = "PayPal"

        results.append({
            "id": txn_id or f"pp_{raw_date}_{amount}",
            "date": date,
            "amount": amount,
            "direction": direction,
            "note": note,
            "from_name": (row.get("From Email Address") or "").strip(),
            "to_name": "",
            "proposed_alias": proposed_alias,
        })
    return results


def detect_format(content: str, filename: str) -> str:
    """Returns 'venmo' or 'paypal'."""
    sample = content[:4000]
    if "Datetime" in sample and "Amount (total)" in sample:
        return "venmo"
    if "Transaction ID" in sample and "Gross" in sample:
        return "paypal"
    # Fallback by filename hint
    if "venmo" in filename.lower():
        return "venmo"
    if "paypal" in filename.lower() or "statement" in filename.lower():
        return "paypal"
    raise ValueError("Unrecognized file format. Upload a Venmo or PayPal CSV.")


def match_statements(conn, rows: list[dict]) -> list[dict]:
    bank_rows = conn.execute("""
        SELECT id, date, amount, name, description, custom_name, merchant_alias
        FROM transactions
        WHERE (
            LOWER(name) LIKE '%venmo%' OR LOWER(name) LIKE '%paypal%'
            OR LOWER(description) LIKE '%venmo%' OR LOWER(description) LIKE '%paypal%'
        )
        AND ignored = 0
    """).fetchall()

    bank_txns = [dict(r) for r in bank_rows]

    def parse_date(d):
        return datetime.strptime(d, "%Y-%m-%d").date()

    results = []
    for stmt in rows:
        stmt_date = parse_date(stmt["date"])
        stmt_amount = stmt["amount"]

        candidates = []
        for bank in bank_txns:
            try:
                bdate = parse_date(bank["date"])
            except (ValueError, TypeError):
                continue
            if round(abs(bank["amount"]), 2) == stmt_amount and abs((bdate - stmt_date).days) <= 1:
                candidates.append(bank)

        if len(candidates) == 0:
            match_type = "unmatched"
            bank_match = None
        elif len(candidates) == 1:
            bank_match = candidates[0]
            if bank_match["merchant_alias"]:
                match_type = "already_matched"
            else:
                match_type = "confident"
        else:
            # Multiple candidates — check if any already aliased
            match_type = "ambiguous"
            bank_match = None

        results.append({
            "stmt": stmt,
            "bank_match": bank_match,
            "candidates": candidates,
            "match_type": match_type,
        })

    return results
