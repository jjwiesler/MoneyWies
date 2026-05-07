import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).parent / "moneywies.db"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def db():
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS transactions (
                id              TEXT PRIMARY KEY,
                date            TEXT NOT NULL,
                original_date   TEXT,
                institution     TEXT,
                account_name    TEXT,
                account_number  TEXT,
                account_type    TEXT,
                name            TEXT,
                custom_name     TEXT,
                description     TEXT,
                amount          REAL NOT NULL,
                category        TEXT,
                sub_category    TEXT,
                imported_category TEXT,
                category_source TEXT DEFAULT 'imported',
                note            TEXT,
                ignored         INTEGER DEFAULT 0,
                tax_deductible  INTEGER DEFAULT 0,
                tags            TEXT,
                source_file     TEXT,
                duplicate_of    TEXT REFERENCES transactions(id)
            );

            CREATE INDEX IF NOT EXISTS idx_txn_date     ON transactions(date);
            CREATE INDEX IF NOT EXISTS idx_txn_account  ON transactions(account_number);
            CREATE INDEX IF NOT EXISTS idx_txn_category ON transactions(category);

            CREATE TABLE IF NOT EXISTS import_log (
                id              TEXT PRIMARY KEY,
                filename        TEXT NOT NULL,
                imported_at     TEXT DEFAULT (datetime('now')),
                row_count       INTEGER,
                duplicate_count INTEGER
            );

            CREATE TABLE IF NOT EXISTS accounts (
                id             TEXT PRIMARY KEY,
                institution    TEXT,
                account_name   TEXT,
                account_number TEXT UNIQUE,
                account_type   TEXT,
                ignored        INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS rules (
                id               TEXT PRIMARY KEY,
                pattern          TEXT NOT NULL,
                category         TEXT NOT NULL,
                sub_category     TEXT,
                priority         INTEGER NOT NULL DEFAULT 0,
                scope_institution TEXT,
                scope_account    TEXT,
                created_at       TEXT DEFAULT (datetime('now')),
                updated_at       TEXT DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_rules_priority ON rules(priority);

            CREATE TABLE IF NOT EXISTS income_sources (
                id                    TEXT PRIMARY KEY,
                name                  TEXT NOT NULL,
                source_type           TEXT NOT NULL,
                is_active             INTEGER DEFAULT 1,
                is_recurring          INTEGER DEFAULT 0,
                expected_amount       REAL,
                expected_day_of_month INTEGER,
                notes                 TEXT,
                created_at            TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS properties (
                id                       TEXT PRIMARY KEY,
                name                     TEXT NOT NULL,
                address                  TEXT,
                property_type            TEXT,
                personal_use_days        INTEGER DEFAULT 0,
                notes                    TEXT,
                created_at               TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS units (
                id          TEXT PRIMARY KEY,
                property_id TEXT NOT NULL REFERENCES properties(id),
                name        TEXT NOT NULL,
                usage_type  TEXT,
                notes       TEXT
            );

            CREATE TABLE IF NOT EXISTS allocation_rules (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                property_id TEXT REFERENCES properties(id),
                notes       TEXT,
                created_at  TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS allocation_rule_splits (
                id          TEXT PRIMARY KEY,
                rule_id     TEXT NOT NULL REFERENCES allocation_rules(id),
                unit_id     TEXT REFERENCES units(id),
                label       TEXT NOT NULL,
                percentage  REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS transaction_allocations (
                id             TEXT PRIMARY KEY,
                transaction_id TEXT NOT NULL REFERENCES transactions(id),
                rule_id        TEXT REFERENCES allocation_rules(id),
                split_id       TEXT REFERENCES allocation_rule_splits(id),
                unit_id        TEXT REFERENCES units(id),
                label          TEXT,
                percentage     REAL NOT NULL,
                amount         REAL NOT NULL,
                schedule_e_category TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_alloc_txn ON transaction_allocations(transaction_id);
            CREATE INDEX IF NOT EXISTS idx_alloc_unit ON transaction_allocations(unit_id);

            CREATE TABLE IF NOT EXISTS token_usage (
                id             TEXT PRIMARY KEY,
                feature        TEXT NOT NULL,
                model          TEXT,
                input_tokens   INTEGER DEFAULT 0,
                output_tokens  INTEGER DEFAULT 0,
                cost_usd       REAL DEFAULT 0,
                created_at     TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE TABLE IF NOT EXISTS custom_categories (
                name TEXT PRIMARY KEY
            );
        """)
        # Migrations for existing DBs
        _migrate(conn)


def _migrate(conn):
    cols = {r[1] for r in conn.execute("PRAGMA table_info(transactions)")}
    if "sub_category" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN sub_category TEXT")
    if "imported_category" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN imported_category TEXT")
        conn.execute("""
            UPDATE transactions
            SET imported_category = category
            WHERE imported_category IS NULL AND category IS NOT NULL
        """)
    if "income_source_type" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN income_source_type TEXT")
    if "income_source_name" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN income_source_name TEXT")
    if "income_source_id" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN income_source_id TEXT REFERENCES income_sources(id)")
    if "is_recurring" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN is_recurring INTEGER DEFAULT 0")
    if "expected_amount" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN expected_amount REAL")
    if "tax_year" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN tax_year INTEGER")
    if "is_gross" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN is_gross INTEGER DEFAULT 0")
    if "property_id" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN property_id TEXT REFERENCES properties(id)")
    if "unit_id" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN unit_id TEXT REFERENCES units(id)")
    if "allocation_rule_id" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN allocation_rule_id TEXT REFERENCES allocation_rules(id)")
    if "is_capital_improvement" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN is_capital_improvement INTEGER DEFAULT 0")
    if "is_deductible" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN is_deductible INTEGER DEFAULT 0")
    if "schedule_e_category" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN schedule_e_category TEXT")
    if "label" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN label TEXT")
    if "merchant_alias" not in cols:
        conn.execute("ALTER TABLE transactions ADD COLUMN merchant_alias TEXT")

    # Rules table migrations
    rule_cols = {r[1] for r in conn.execute("PRAGMA table_info(rules)")}
    if "amount_min" not in rule_cols:
        conn.execute("ALTER TABLE rules ADD COLUMN amount_min REAL")
    if "amount_max" not in rule_cols:
        conn.execute("ALTER TABLE rules ADD COLUMN amount_max REAL")
    if "label" not in rule_cols:
        # Recreate rules table: adds label column and makes category nullable
        conn.executescript("""
            PRAGMA foreign_keys=OFF;
            CREATE TABLE rules_new (
                id                TEXT PRIMARY KEY,
                pattern           TEXT NOT NULL DEFAULT '',
                category          TEXT,
                sub_category      TEXT,
                label             TEXT,
                priority          INTEGER NOT NULL DEFAULT 0,
                scope_institution TEXT,
                scope_account     TEXT,
                amount_min        REAL,
                amount_max        REAL,
                created_at        TEXT DEFAULT (datetime('now')),
                updated_at        TEXT DEFAULT (datetime('now'))
            );
            INSERT INTO rules_new
                (id, pattern, category, sub_category, priority, scope_institution,
                 scope_account, amount_min, amount_max, created_at, updated_at)
            SELECT id, pattern, category, sub_category, priority, scope_institution,
                   scope_account, amount_min, amount_max, created_at, updated_at
            FROM rules;
            DROP TABLE rules;
            ALTER TABLE rules_new RENAME TO rules;
            CREATE INDEX IF NOT EXISTS idx_rules_priority ON rules(priority);
            PRAGMA foreign_keys=ON;
        """)

    # Import log migrations
    log_cols = {r[1] for r in conn.execute("PRAGMA table_info(import_log)")}
    if "inserted_count" not in log_cols:
        conn.execute("ALTER TABLE import_log ADD COLUMN inserted_count INTEGER DEFAULT 0")
    if "rule_matched" not in log_cols:
        conn.execute("ALTER TABLE import_log ADD COLUMN rule_matched INTEGER DEFAULT 0")
    if "transaction_ids" not in log_cols:
        conn.execute("ALTER TABLE import_log ADD COLUMN transaction_ids TEXT")

    # Seed income categories into custom_categories
    income_cats = [
        "W2 Payroll", "1099 / Freelance", "K-1 Distribution",
        "Rental Income", "Investment", "Tax Refund", "Reimbursement", "Miscellaneous",
    ]
    for cat in income_cats:
        conn.execute("INSERT OR IGNORE INTO custom_categories (name) VALUES (?)", (cat,))

    # Migrate income_source_type → category on income transactions
    type_to_cat = {
        "W2":           "W2 Payroll",
        "freelance":    "1099 / Freelance",
        "k1":           "K-1 Distribution",
        "rental":       "Rental Income",
        "investment":   "Investment",
        "tax_refund":   "Tax Refund",
        "reimbursement":"Reimbursement",
        "misc":         "Miscellaneous",
    }
    for src, cat in type_to_cat.items():
        conn.execute(
            """UPDATE transactions SET category = ?, category_source = 'manual'
               WHERE income_source_type = ? AND amount < 0 AND category != ?""",
            (cat, src, cat),
        )
