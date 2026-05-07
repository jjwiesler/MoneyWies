import csv
import uuid
from collections import defaultdict
from io import StringIO


# Categories filtered from income/spend stats — they're balance sheet moves, not cashflow
EXCLUDED_CATEGORIES = {"Internal Transfers", "Credit Card Payment"}


def parse_rocketmoney(content: str, filename: str, conn) -> dict:
    """
    Parse a RocketMoney CSV export and insert new transactions.

    Sign convention (from RocketMoney):
        negative amount = income / money in
        positive amount = expense / money out

    Dedup key: (date, account_number, amount, description)
    Using description rather than merchant name because multiple transactions
    can share the same date + amount + merchant (e.g. two $40 Venmo payments).
    """
    reader = csv.DictReader(StringIO(content))

    # Load existing dedup keys
    existing_keys = set()
    for row in conn.execute("SELECT date, account_number, amount, description FROM transactions"):
        existing_keys.add((row["date"], row["account_number"], row["amount"], row["description"]))

    # Load ignored account numbers
    ignored_accounts = {
        row["account_number"]
        for row in conn.execute("SELECT account_number FROM accounts WHERE ignored = 1")
    }

    inserted = 0
    duplicates = 0
    new_ids = []
    accounts_seen = {}

    for row in reader:
        date        = row["Date"].strip()
        amount_str  = row["Amount"].strip()
        description = row["Description"].strip()
        acct_num    = row["Account Number"].strip()

        if not date or amount_str == "":
            continue

        amount = float(amount_str)
        key = (date, acct_num, amount, description)

        if key in existing_keys:
            duplicates += 1
            continue

        existing_keys.add(key)

        # Track accounts for upsert
        if acct_num and acct_num not in accounts_seen:
            accounts_seen[acct_num] = {
                "institution":  row["Institution Name"].strip(),
                "account_name": row["Account Name"].strip(),
                "account_number": acct_num,
                "account_type": row["Account Type"].strip(),
            }

        ignored = 1 if acct_num in ignored_accounts else 0

        txn_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO transactions
                (id, date, original_date, institution, account_name, account_number,
                 account_type, name, custom_name, description, amount, category,
                 imported_category, category_source, note, ignored, tax_deductible, tags, source_file)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                txn_id,
                date,
                row["Original Date"].strip() or None,
                row["Institution Name"].strip() or None,
                row["Account Name"].strip() or None,
                acct_num or None,
                row["Account Type"].strip() or None,
                row["Name"].strip() or None,
                row["Custom Name"].strip() or None,
                description or None,
                amount,
                row["Category"].strip() or None,
                row["Category"].strip() or None,
                "imported",
                row["Note"].strip() or None,
                ignored,
                1 if row["Tax Deductible"].strip().lower() in ("yes", "true", "1") else 0,
                row["Transaction Tags"].strip() or None,
                filename,
            ),
        )
        new_ids.append(txn_id)
        inserted += 1

    # Upsert accounts
    for acct in accounts_seen.values():
        conn.execute(
            """
            INSERT INTO accounts (id, institution, account_name, account_number, account_type)
            VALUES (?,?,?,?,?)
            ON CONFLICT(account_number) DO NOTHING
            """,
            (
                str(uuid.uuid4()),
                acct["institution"],
                acct["account_name"],
                acct["account_number"],
                acct["account_type"],
            ),
        )

    return {"inserted": inserted, "duplicates": duplicates, "total": inserted + duplicates, "new_ids": new_ids}


def preview_rocketmoney(content: str, conn) -> dict:
    """
    Parse a RocketMoney CSV and return what WOULD be imported — no writes.
    Simulates rule matching so the preview matches the real import result.
    """
    from rules import _matches

    reader = csv.DictReader(StringIO(content))

    existing_keys = set()
    for row in conn.execute("SELECT date, account_number, amount, description FROM transactions"):
        existing_keys.add((row["date"], row["account_number"], row["amount"], row["description"]))

    rules     = conn.execute("SELECT * FROM rules ORDER BY priority ASC").fetchall()
    cat_rules = [r for r in rules if r["category"]]

    duplicates  = 0
    dates       = []
    by_account  = defaultdict(int)
    by_category = defaultdict(lambda: {"count": 0, "source": "imported"})

    for row in reader:
        date        = row["Date"].strip()
        amount_str  = row["Amount"].strip()
        description = row["Description"].strip()
        acct_num    = row["Account Number"].strip()

        if not date or amount_str == "":
            continue

        amount = float(amount_str)
        key = (date, acct_num, amount, description)

        if key in existing_keys:
            duplicates += 1
            continue
        existing_keys.add(key)

        dates.append(date)
        acct_label = row["Account Name"].strip() or acct_num or "Unknown"
        by_account[acct_label] += 1

        stub = {
            "name":           row["Name"].strip() or None,
            "description":    description or None,
            "institution":    row["Institution Name"].strip() or None,
            "account_number": acct_num or None,
            "amount":         amount,
        }

        category = row["Category"].strip() or None
        source   = "imported"
        for rule in cat_rules:
            if _matches(stub, rule):
                category = rule["category"]
                source   = "rule"
                break

        cat_key = category or "Uncategorized"
        by_category[cat_key]["count"] += 1
        by_category[cat_key]["source"] = source

    inserted     = len(dates)
    rule_matched = sum(1 for v in by_category.values() if v["source"] == "rule")
    uncategorized = sum(1 for v in by_category.values() if v["source"] == "imported")

    return {
        "inserted":      inserted,
        "duplicates":    duplicates,
        "total":         inserted + duplicates,
        "rule_matched":  rule_matched,
        "uncategorized": uncategorized,
        "date_range":    {"from": min(dates), "to": max(dates)} if dates else None,
        "by_account":    [{"account": k, "count": v} for k, v in sorted(by_account.items(), key=lambda x: -x[1])],
        "by_category":   [{"category": k, "source": v["source"], "count": v["count"]}
                          for k, v in sorted(by_category.items(), key=lambda x: -x[1]["count"])],
    }
