"""
AI integration — categorization, income classification, anomaly detection, NL search.

All public functions accept an open sqlite3 connection and log token usage.
Supports Anthropic (Claude) and OpenAI providers, switchable via settings.
"""
import os
import json
import re
import uuid
import datetime
from typing import Optional

import anthropic

MODEL = "claude-sonnet-4-6"
OPENAI_MODEL = "gpt-4o"

# Pricing per million tokens
_INPUT_COST_PER_M  = 3.0    # claude-sonnet-4-6
_OUTPUT_COST_PER_M = 15.0
_OAI_INPUT_COST_PER_M  = 2.5   # gpt-4o
_OAI_OUTPUT_COST_PER_M = 10.0
GEMINI_MODEL = "gemini-2.5-flash"
_GEMINI_INPUT_COST_PER_M  = 0.30   # gemini-2.5-flash
_GEMINI_OUTPUT_COST_PER_M = 0.40

INCOME_SOURCE_TYPES = ["W2", "freelance", "k1", "rental", "investment", "tax_refund", "reimbursement", "misc"]

EXPENSE_CATEGORIES = [
    "Food & Dining", "Shopping", "Entertainment", "Bills & Utilities",
    "Auto & Transport", "Travel & Vacation", "Health & Fitness", "Medical",
    "Groceries", "Personal Care", "Business Services", "Home & Garden",
    "Education", "Gifts & Donations", "Taxes", "Fees", "Other", "Uncategorized",
]

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_api_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        from db import get_conn
        conn = get_conn()
        try:
            row = conn.execute("SELECT value FROM settings WHERE key='anthropic_api_key'").fetchone()
            if row:
                key = row["value"]
        finally:
            conn.close()
    if not key:
        raise ValueError("ANTHROPIC_API_KEY is not set")
    return key


def _client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=_get_api_key())


def _track(conn, feature: str, msg) -> None:
    u = msg.usage
    cost = (u.input_tokens * _INPUT_COST_PER_M + u.output_tokens * _OUTPUT_COST_PER_M) / 1_000_000
    conn.execute(
        "INSERT INTO token_usage (id, feature, model, input_tokens, output_tokens, cost_usd) VALUES (?,?,?,?,?,?)",
        (str(uuid.uuid4()), feature, MODEL, u.input_tokens, u.output_tokens, cost),
    )


def _tool_result(msg):
    for block in msg.content:
        if block.type == "tool_use":
            return block.input
    return None


def _get_provider() -> str:
    from db import get_conn
    conn = get_conn()
    try:
        row = conn.execute("SELECT value FROM settings WHERE key='ai_provider'").fetchone()
        return row["value"] if row else "anthropic"
    finally:
        conn.close()


def _get_openai_key() -> str:
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        from db import get_conn
        conn = get_conn()
        try:
            row = conn.execute("SELECT value FROM settings WHERE key='openai_api_key'").fetchone()
            if row:
                key = row["value"]
        finally:
            conn.close()
    if not key:
        raise ValueError("OPENAI_API_KEY is not set")
    return key


def _openai_client():
    import openai
    return openai.OpenAI(api_key=_get_openai_key())


def _get_gemini_key() -> str:
    key = os.environ.get("GOOGLE_API_KEY")
    if not key:
        from db import get_conn
        conn = get_conn()
        try:
            row = conn.execute("SELECT value FROM settings WHERE key='gemini_api_key'").fetchone()
            if row:
                key = row["value"]
        finally:
            conn.close()
    if not key:
        raise ValueError("GOOGLE_API_KEY is not set")
    return key


_gemini_client_instance = None

def _gemini_client():
    global _gemini_client_instance
    from google import genai
    key = _get_gemini_key()
    if _gemini_client_instance is None:
        _gemini_client_instance = genai.Client(api_key=key)
    return _gemini_client_instance


def _track_gemini(conn, feature: str, response) -> None:
    u = response.usage_metadata
    cost = (u.prompt_token_count * _GEMINI_INPUT_COST_PER_M + u.candidates_token_count * _GEMINI_OUTPUT_COST_PER_M) / 1_000_000
    conn.execute(
        "INSERT INTO token_usage (id, feature, model, input_tokens, output_tokens, cost_usd) VALUES (?,?,?,?,?,?)",
        (str(uuid.uuid4()), feature, GEMINI_MODEL, u.prompt_token_count, u.candidates_token_count, cost),
    )


def _json_schema_to_gemini(schema: dict):
    from google.genai import types
    t = schema.get("type", "string")
    kwargs = {}
    if schema.get("description"):
        kwargs["description"] = schema["description"]
    if schema.get("enum"):
        kwargs["enum"] = schema["enum"]
    if t == "object":
        props = schema.get("properties", {})
        if props:
            kwargs["properties"] = {k: _json_schema_to_gemini(v) for k, v in props.items()}
        if schema.get("required"):
            kwargs["required"] = schema["required"]
        return types.Schema(type=types.Type.OBJECT, **kwargs)
    elif t == "array":
        if "items" in schema:
            kwargs["items"] = _json_schema_to_gemini(schema["items"])
        return types.Schema(type=types.Type.ARRAY, **kwargs)
    elif t == "integer":
        return types.Schema(type=types.Type.INTEGER, **kwargs)
    elif t == "number":
        return types.Schema(type=types.Type.NUMBER, **kwargs)
    elif t == "boolean":
        return types.Schema(type=types.Type.BOOLEAN, **kwargs)
    else:
        return types.Schema(type=types.Type.STRING, **kwargs)


def _to_gemini_tools(tools: list) -> list:
    from google.genai import types
    decls = [
        types.FunctionDeclaration(
            name=t["name"],
            description=t.get("description", ""),
            parameters=_json_schema_to_gemini(t["input_schema"]),
        )
        for t in tools
    ]
    return [types.Tool(function_declarations=decls)]


def _track_openai(conn, feature: str, response) -> None:
    u = response.usage
    cost = (u.prompt_tokens * _OAI_INPUT_COST_PER_M + u.completion_tokens * _OAI_OUTPUT_COST_PER_M) / 1_000_000
    conn.execute(
        "INSERT INTO token_usage (id, feature, model, input_tokens, output_tokens, cost_usd) VALUES (?,?,?,?,?,?)",
        (str(uuid.uuid4()), feature, OPENAI_MODEL, u.prompt_tokens, u.completion_tokens, cost),
    )


def _to_oai_tool(tool: dict) -> dict:
    return {
        "type": "function",
        "function": {
            "name": tool["name"],
            "description": tool.get("description", ""),
            "parameters": tool["input_schema"],
        },
    }


def _call_tool(conn, feature: str, messages: list, tool_def: dict, max_tokens: int, system: str = None) -> Optional[dict]:
    """Call active provider with forced tool use. Returns parsed tool result or None."""
    provider = _get_provider()
    if provider == "openai":
        client = _openai_client()
        oai_messages = []
        if system:
            oai_messages.append({"role": "system", "content": system})
        oai_messages.extend(messages)
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            max_tokens=max_tokens,
            tools=[_to_oai_tool(tool_def)],
            tool_choice={"type": "function", "function": {"name": tool_def["name"]}},
            messages=oai_messages,
        )
        _track_openai(conn, feature, response)
        tc = response.choices[0].message.tool_calls
        if not tc:
            return None
        return json.loads(tc[0].function.arguments)
    elif provider == "gemini":
        from google.genai import types
        contents = [
            types.Content(role="user" if m["role"] == "user" else "model", parts=[types.Part(text=m["content"])])
            for m in messages
        ]
        response = _gemini_client().models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system,
                tools=_to_gemini_tools([tool_def]),
                max_output_tokens=max_tokens,
                tool_config=types.ToolConfig(
                    function_calling_config=types.FunctionCallingConfig(
                        mode=types.FunctionCallingConfigMode.ANY,
                        allowed_function_names=[tool_def["name"]],
                    )
                ),
            ),
        )
        _track_gemini(conn, feature, response)
        for p in response.candidates[0].content.parts:
            if p.function_call and p.function_call.name:
                return dict(p.function_call.args)
        return None
    else:
        kwargs = dict(
            model=MODEL,
            max_tokens=max_tokens,
            tools=[tool_def],
            tool_choice={"type": "tool", "name": tool_def["name"]},
            messages=messages,
        )
        if system:
            kwargs["system"] = system
        msg = _client().messages.create(**kwargs)
        _track(conn, feature, msg)
        return _tool_result(msg)


# ---------------------------------------------------------------------------
# #10-A: NL rule creation
# ---------------------------------------------------------------------------

def suggest_rule(conn, description: str) -> dict:
    """
    Given plain-English user intent, return a structured {pattern, category, sub_category, explanation}.
    """
    sample_rows = conn.execute(
        "SELECT name, description, amount FROM transactions WHERE ignored = 0 ORDER BY RANDOM() LIMIT 30"
    ).fetchall()
    sample_text = "\n".join(
        f"- {r['name']}: {(r['description'] or '')[:60]} (${r['amount']:.2f})"
        for r in sample_rows
    )

    result = _call_tool(conn, "suggest_rule",
        [{"role": "user", "content": f"""You are a personal finance categorization assistant.

The user wants a categorization rule: "{description}"

Sample transactions for context:
{sample_text}

Generate a rule with a short pattern string (merchant keyword or phrase) that matches the user's intent."""}],
        {
            "name": "create_rule",
            "description": "Propose a categorization rule",
            "input_schema": {
                "type": "object",
                "properties": {
                    "pattern":      {"type": "string", "description": "Case-insensitive substring to match in transaction name or description"},
                    "category":     {"type": "string", "enum": EXPENSE_CATEGORIES},
                    "sub_category": {"type": "string"},
                    "explanation":  {"type": "string"},
                },
                "required": ["pattern", "category", "explanation"],
            },
        },
        400,
    )
    if not result:
        return {"ok": False, "error": "No rule generated"}
    return {"ok": True, **result}


# ---------------------------------------------------------------------------
# #10-B: Bulk categorization suggestions
# ---------------------------------------------------------------------------

def bulk_categorize(conn, limit: int = 60) -> list:
    """
    Scan uncategorized transactions and return a list of rule suggestions.
    Groups by merchant name first to avoid sending duplicate data.
    """
    rows = conn.execute(
        """SELECT name, COUNT(*) AS cnt, AVG(ABS(amount)) AS avg_amt
           FROM transactions
           WHERE (category IS NULL OR category = 'Uncategorized') AND ignored = 0 AND amount > 0
           GROUP BY name
           ORDER BY cnt DESC
           LIMIT ?""",
        (limit,),
    ).fetchall()

    if not rows:
        return []

    merchant_list = "\n".join(
        f"- \"{r['name']}\" ({r['cnt']} txns, avg ${r['avg_amt']:.0f})"
        for r in rows
    )

    result = _call_tool(conn, "bulk_categorize",
        [{"role": "user", "content": f"""You are a personal finance categorization assistant.

Group these uncategorized merchants and suggest categorization rules.
Return 5–15 rules covering the most common patterns.
Use short keyword patterns (e.g. "amazon", "netflix", "whole foods") not full merchant strings.

Merchants (name, frequency, average amount):
{merchant_list}

Available categories: {', '.join(EXPENSE_CATEGORIES)}"""}],
        {
            "name": "suggest_rules",
            "description": "Suggest categorization rules for merchant groups",
            "input_schema": {
                "type": "object",
                "properties": {
                    "suggestions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "pattern":       {"type": "string"},
                                "category":      {"type": "string", "enum": EXPENSE_CATEGORIES},
                                "sub_category":  {"type": "string"},
                                "example_names": {"type": "array", "items": {"type": "string"}},
                                "reasoning":     {"type": "string"},
                                "txn_count":     {"type": "integer"},
                            },
                            "required": ["pattern", "category", "example_names", "reasoning"],
                        },
                    },
                },
                "required": ["suggestions"],
            },
        },
        2000,
    )
    return result.get("suggestions", []) if result else []


# ---------------------------------------------------------------------------
# #10-C: Vendor name normalization
# ---------------------------------------------------------------------------

def normalize_vendors(conn, txn_ids: Optional[list] = None) -> int:
    """
    Normalize custom_name for transactions that don't have one yet.
    Sends merchant names in batches to Claude and writes back normalized values.
    Returns count of transactions updated.
    """
    if txn_ids:
        placeholders = ",".join("?" * len(txn_ids))
        rows = conn.execute(
            f"SELECT id, name FROM transactions WHERE id IN ({placeholders}) AND (custom_name IS NULL OR custom_name = '')",
            txn_ids,
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT id, name FROM transactions WHERE (custom_name IS NULL OR custom_name = '') AND ignored = 0 LIMIT 100"
        ).fetchall()

    if not rows:
        return 0

    # Deduplicate by raw name → batch normalize
    unique_names = list({r["name"] for r in rows})
    name_list = "\n".join(f"- {n}" for n in unique_names[:80])

    result = _call_tool(conn, "normalize_vendors",
        [{"role": "user", "content": f"""Normalize these raw bank merchant names into clean, human-readable names.
Rules: remove transaction IDs, store codes, asterisks, trailing numbers. Keep brand names.
Examples: "AMAZON.COM*2X9B3" → "Amazon", "SQ *BLUE BOTTLE" → "Blue Bottle Coffee", "WHOLEFDS #0123" → "Whole Foods"

Raw names:
{name_list}"""}],
        {
            "name": "normalized_names",
            "description": "Return normalized merchant names",
            "input_schema": {
                "type": "object",
                "properties": {
                    "mappings": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "raw":        {"type": "string"},
                                "normalized": {"type": "string"},
                            },
                            "required": ["raw", "normalized"],
                        },
                    },
                },
                "required": ["mappings"],
            },
        },
        1500,
    )
    if not result:
        return 0

    name_map = {m["raw"]: m["normalized"] for m in result.get("mappings", [])}
    updated = 0
    for r in rows:
        normalized = name_map.get(r["name"])
        if normalized and normalized != r["name"]:
            conn.execute("UPDATE transactions SET custom_name = ? WHERE id = ?", (normalized, r["id"]))
            updated += 1
    return updated


# ---------------------------------------------------------------------------
# #11-A: Income classification
# ---------------------------------------------------------------------------

def classify_income(conn, txn_id: str) -> dict:
    """
    Classify an income transaction's source type with confidence + explanation.
    """
    txn = conn.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,)).fetchone()
    if not txn:
        raise ValueError("Transaction not found")

    context = conn.execute(
        """SELECT name, description, amount, date FROM transactions
           WHERE account_number = ? AND date LIKE ? AND id != ? AND amount < 0
           LIMIT 4""",
        (txn["account_number"], txn["date"][:7] + "%", txn_id),
    ).fetchall()
    ctx_text = "\n".join(f"  - {r['name']}: ${abs(r['amount']):.2f} on {r['date']}" for r in context)

    result = _call_tool(conn, "classify_income",
        [{"role": "user", "content": f"""Classify this income transaction:

Name: {txn['name']}
Description: {txn['description'] or 'none'}
Amount: ${abs(txn['amount']):.2f}
Account: {txn['account_name']} ({txn['account_type']})
Date: {txn['date']}

Other income on same account that month:
{ctx_text or '  none'}

Source types: W2 (regular payroll), freelance (1099/contract/gig), k1 (partnership/LLC),
rental (rent received), investment (dividends/capital gains), tax_refund,
reimbursement (expense reimbursement), misc"""}],
        {
            "name": "classify_income",
            "description": "Classify income transaction source type",
            "input_schema": {
                "type": "object",
                "properties": {
                    "source_type":  {"type": "string", "enum": INCOME_SOURCE_TYPES},
                    "confidence":   {"type": "string", "enum": ["high", "medium", "low"]},
                    "explanation":  {"type": "string"},
                },
                "required": ["source_type", "confidence", "explanation"],
            },
        },
        400,
    )
    if not result:
        return {"ok": False, "error": "Classification failed"}
    return {"ok": True, **result}


# ---------------------------------------------------------------------------
# #11-B: Anomaly detection (SQL-driven, no LLM cost)
# ---------------------------------------------------------------------------

def detect_anomalies(conn) -> list:
    """
    Detect price changes, unusual spend, and income shortfalls.
    Pure SQL — no LLM call, so always fast and free.
    """
    anomalies = []

    # 1. Price increases: recurring charges up 15%+ vs prior occurrence
    price_changes = conn.execute("""
        WITH ranked AS (
            SELECT name, amount, date,
                   LAG(amount) OVER (PARTITION BY name ORDER BY date) AS prev_amount,
                   LAG(date)   OVER (PARTITION BY name ORDER BY date) AS prev_date
            FROM transactions
            WHERE ignored = 0 AND amount > 5
        )
        SELECT name, amount, prev_amount, date, prev_date
        FROM ranked
        WHERE prev_amount IS NOT NULL
          AND amount > prev_amount * 1.15
          AND prev_date >= date('now', '-12 months')
        ORDER BY (amount - prev_amount) DESC
        LIMIT 8
    """).fetchall()
    for r in price_changes:
        anomalies.append({
            "type":        "price_increase",
            "merchant":    r["name"],
            "amount":      round(r["amount"], 2),
            "prev_amount": round(r["prev_amount"], 2),
            "date":        r["date"],
            "prev_date":   r["prev_date"],
            "delta":       round(r["amount"] - r["prev_amount"], 2),
            "pct_change":  round((r["amount"] - r["prev_amount"]) / r["prev_amount"] * 100, 1),
        })

    # 2. Unusual spend: transactions > 3× merchant historical average, last 90 days
    unusual = conn.execute("""
        WITH stats AS (
            SELECT name, AVG(amount) AS avg_amt, COUNT(*) AS cnt
            FROM transactions
            WHERE ignored = 0 AND amount > 0
              AND date < date('now', '-90 days')
            GROUP BY name HAVING cnt >= 3
        )
        SELECT t.id, t.name, t.amount, t.date, s.avg_amt
        FROM transactions t
        JOIN stats s ON s.name = t.name
        WHERE t.amount > s.avg_amt * 3
          AND t.amount > 50
          AND t.date >= date('now', '-90 days')
          AND t.ignored = 0
        ORDER BY t.date DESC
        LIMIT 8
    """).fetchall()
    for r in unusual:
        anomalies.append({
            "type":        "unusual_spend",
            "txn_id":      r["id"],
            "merchant":    r["name"],
            "amount":      round(r["amount"], 2),
            "avg_amount":  round(r["avg_amt"], 2),
            "date":        r["date"],
            "multiplier":  round(r["amount"] / r["avg_amt"], 1),
        })

    # 3. Large one-offs: transactions > $500 with no prior occurrence in last 2 years
    one_offs = conn.execute("""
        SELECT t.id, t.name, t.amount, t.date, t.category
        FROM transactions t
        WHERE t.amount > 500
          AND t.ignored = 0
          AND t.date >= date('now', '-60 days')
          AND (SELECT COUNT(*) FROM transactions t2
               WHERE t2.name = t.name AND t2.id != t.id
                 AND t2.date < t.date
                 AND t2.date >= date('now', '-24 months')) = 0
        ORDER BY t.amount DESC
        LIMIT 6
    """).fetchall()
    for r in one_offs:
        anomalies.append({
            "type":     "one_off",
            "txn_id":   r["id"],
            "merchant": r["name"],
            "amount":   round(r["amount"], 2),
            "date":     r["date"],
            "category": r["category"],
        })

    return anomalies


# ---------------------------------------------------------------------------
# #11-C: Natural language transaction search
# ---------------------------------------------------------------------------

def nl_search(conn, query: str) -> dict:
    """
    Translate a plain-English query into structured filters and return matching transactions.
    """
    today = datetime.date.today().isoformat()

    result = _call_tool(conn, "nl_search",
        [{"role": "user", "content": f"""Translate this natural-language transaction search into structured filters.
Today: {today}

Query: "{query}"

Categories: {', '.join(EXPENSE_CATEGORIES)}
Relative dates like "last quarter", "this year", "last month" should be resolved to absolute YYYY-MM-DD dates.
If the user is looking for income/deposits, set income_only=true."""}],
        {
            "name": "search_transactions",
            "description": "Structured filter to search transactions",
            "input_schema": {
                "type": "object",
                "properties": {
                    "search":           {"type": "string", "description": "Keyword to match in merchant name or description"},
                    "category":         {"type": "string"},
                    "start":            {"type": "string", "description": "YYYY-MM-DD"},
                    "end":              {"type": "string", "description": "YYYY-MM-DD"},
                    "min_amount":       {"type": "number"},
                    "max_amount":       {"type": "number"},
                    "income_only":      {"type": "boolean", "description": "True if user is asking about income/deposits"},
                    "interpreted":      {"type": "string", "description": "One-sentence plain-English restatement of the query"},
                },
                "required": ["interpreted"],
            },
        },
        500,
    )
    if not result:
        return {"ok": False, "error": "Could not interpret query", "transactions": []}

    interpreted = result.pop("interpreted", query)
    income_only  = result.pop("income_only", False)

    where  = ["ignored = 0"]
    params = []

    if income_only:
        where.append("amount < 0")
    else:
        where.append("amount > 0")

    if result.get("search"):
        where.append("(name LIKE ? OR description LIKE ? OR custom_name LIKE ?)")
        kw = f"%{result['search']}%"
        params += [kw, kw, kw]
    if result.get("category"):
        where.append("category = ?")
        params.append(result["category"])
    if result.get("start"):
        where.append("date >= ?")
        params.append(result["start"])
    if result.get("end"):
        where.append("date <= ?")
        params.append(result["end"])
    if result.get("min_amount") is not None:
        where.append("ABS(amount) >= ?")
        params.append(result["min_amount"])
    if result.get("max_amount") is not None:
        where.append("ABS(amount) <= ?")
        params.append(result["max_amount"])

    clause = " AND ".join(where)
    total = conn.execute(f"SELECT COUNT(*) FROM transactions WHERE {clause}", params).fetchone()[0]
    rows  = conn.execute(
        f"SELECT * FROM transactions WHERE {clause} ORDER BY date DESC LIMIT 100", params
    ).fetchall()

    return {
        "ok":           True,
        "interpreted":  interpreted,
        "filters":      result,
        "total":        total,
        "transactions": [dict(r) for r in rows],
    }


# ---------------------------------------------------------------------------
# Token usage summary
# ---------------------------------------------------------------------------

def get_token_usage_summary(conn) -> dict:
    rows = conn.execute(
        """SELECT feature, COUNT(*) AS calls, SUM(input_tokens) AS input_tokens,
                  SUM(output_tokens) AS output_tokens, SUM(cost_usd) AS cost_usd
           FROM token_usage
           GROUP BY feature ORDER BY cost_usd DESC"""
    ).fetchall()
    total = conn.execute(
        "SELECT SUM(cost_usd) AS total FROM token_usage"
    ).fetchone()
    return {
        "by_feature": [dict(r) for r in rows],
        "total_cost_usd": round(total["total"] or 0, 4),
    }


# ---------------------------------------------------------------------------
# #12-A: Recurring charge detection (SQL-only)
# ---------------------------------------------------------------------------

def detect_recurring(conn) -> list:
    """
    Find merchants with consistent charge intervals — weekly, biweekly, monthly, quarterly, annual.
    Pure SQL, no LLM cost.
    """
    rows = conn.execute("""
        WITH normalized AS (
            -- Strip ACH-style descriptors (DES:..., ID:...) so transactions like
            -- "KAISERDUES DES:X ID:Y INDN:Z" all share the same norm_name.
            SELECT
                CASE
                    WHEN INSTR(name, ' DES:') > 0 THEN SUBSTR(name, 1, INSTR(name, ' DES:') - 1)
                    WHEN INSTR(name, ' ID:')  > 0 THEN SUBSTR(name, 1, INSTR(name, ' ID:')  - 1)
                    ELSE name
                END AS norm_name,
                name,
                amount,
                date,
                category,
                ignored
            FROM transactions
        ),
        intervals AS (
            SELECT
                norm_name,
                ROUND(amount) AS rounded_amt,
                date,
                LAG(date) OVER (PARTITION BY norm_name, ROUND(amount) ORDER BY date) AS prev_date,
                MAX(date) OVER (PARTITION BY norm_name, ROUND(amount)) AS last_date,
                COUNT(*) OVER (PARTITION BY norm_name, ROUND(amount)) AS total_count
            FROM normalized
            WHERE ignored = 0 AND amount > 2
        ),
        stats AS (
            SELECT
                norm_name,
                rounded_amt,
                last_date,
                total_count,
                AVG(julianday(date) - julianday(prev_date)) AS avg_days,
                COUNT(prev_date) AS interval_count
            FROM intervals
            WHERE prev_date IS NOT NULL
            GROUP BY norm_name, rounded_amt
            HAVING interval_count >= 2
              AND AVG(julianday(date) - julianday(prev_date)) <= 400
        )
        SELECT
            s.norm_name AS name,
            s.rounded_amt AS amount,
            s.last_date,
            s.total_count,
            ROUND(s.avg_days) AS avg_interval_days,
            date(s.last_date, '+' || CAST(ROUND(s.avg_days) AS INTEGER) || ' days') AS next_due,
            ROUND(s.rounded_amt * 365.0 / s.avg_days, 2) AS yearly_cost,
            (SELECT n.category FROM normalized n WHERE n.norm_name = s.norm_name AND n.ignored = 0 ORDER BY n.date DESC LIMIT 1) AS category,
            (SELECT MAX(n.date) FROM normalized n WHERE n.norm_name = s.norm_name AND n.ignored = 0) AS last_seen,
            CASE
                WHEN s.avg_days BETWEEN 5  AND 9   THEN 'weekly'
                WHEN s.avg_days BETWEEN 12 AND 17  THEN 'biweekly'
                WHEN s.avg_days BETWEEN 27 AND 35  THEN 'monthly'
                WHEN s.avg_days BETWEEN 85 AND 97  THEN 'quarterly'
                WHEN s.avg_days BETWEEN 355 AND 380 THEN 'annual'
                ELSE 'irregular'
            END AS frequency
        FROM stats s
        WHERE s.avg_days BETWEEN 5 AND 380
        ORDER BY s.last_date DESC, s.rounded_amt DESC
    """).fetchall()
    results = [dict(r) for r in rows]

    def _name_key(name):
        return re.sub(r'[^a-z0-9]', '', name.lower())[:5]

    def _build_tracks(entries, threshold=0.70):
        """
        Split same-merchant entries into subscription tracks by amount proximity.
        Entries whose amounts differ by >30% from the track's current price are
        treated as a separate concurrent subscription rather than a price change.
        Sorts newest→oldest so each track grows backward in time.
        """
        sorted_desc = sorted(entries, key=lambda e: e['last_date'] or '', reverse=True)
        tracks = []
        for entry in sorted_desc:
            placed = False
            for track in tracks:
                cur = track[-1]['amount']
                ratio = min(entry['amount'], cur) / max(entry['amount'], cur) if cur > 0 else 0
                if ratio >= threshold:
                    track.append(entry)
                    placed = True
                    break
            if not placed:
                tracks.append([entry])
        return tracks

    def _make_entry(track):
        asc = list(reversed(track))          # oldest → newest
        primary = track[0]                   # newest = current price
        price_history = [{'name': e['name'], 'amount': e['amount'], 'last_date': e['last_date']} for e in asc]
        yoy_pct = None
        amounts = [e['amount'] for e in asc]
        if len(amounts) >= 2 and amounts[0] != amounts[-1] and amounts[0] > 0:
            try:
                dates = [datetime.date.fromisoformat(e['last_date']) for e in asc if e['last_date']]
                years = (dates[-1] - dates[0]).days / 365.25
                if years > 0.1:
                    yoy_pct = round(((amounts[-1] / amounts[0]) ** (1 / years) - 1) * 100, 1)
            except Exception:
                pass
        return {**primary, 'price_history': price_history, 'yoy_pct': yoy_pct}

    # Group by name-prefix only — frequency split happens after track-building,
    # so variable billing amounts (e.g. ATT $74/$82/$87 across months) aren't
    # fragmented into different buckets before tracks are formed.
    groups: dict = {}
    for r in results:
        key = _name_key(r['name'])
        groups.setdefault(key, []).append(r)

    merged = []
    for entries in groups.values():
        for track in _build_tracks(entries):
            merged.append(_make_entry(track))

    freq_order = {'monthly': 0, 'weekly': 1, 'biweekly': 2, 'quarterly': 3, 'annual': 4, 'irregular': 5}
    merged.sort(key=lambda r: (freq_order.get(r['frequency'], 5), -r['amount']))

    return merged


# ---------------------------------------------------------------------------
# #12-B: Conversational chat with tool loop
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """You are a personal finance assistant for MoneyWies, a household finance app.
You have access to real transaction data. Answer questions directly with specific numbers.
Be concise — this is a chat panel, not a report. Use dollar amounts and dates from the data.
When you fetch data with a tool, reference the actual numbers in your reply.
You can suggest actions (rules, categorizations) but always ask before making changes."""

_CHAT_TOOLS = [
    {
        "name": "get_cashflow",
        "description": "Get income, spend, net, and savings rate for a period",
        "input_schema": {
            "type": "object",
            "properties": {
                "period": {"type": "string", "description": "YYYY-MM for a month, YYYY for full year, or 'ytd' for year-to-date"}
            },
        },
    },
    {
        "name": "search_transactions",
        "description": "Search transactions by keyword, category, date range, or amount",
        "input_schema": {
            "type": "object",
            "properties": {
                "search":     {"type": "string"},
                "category":   {"type": "string"},
                "start":      {"type": "string", "description": "YYYY-MM-DD"},
                "end":        {"type": "string", "description": "YYYY-MM-DD"},
                "min_amount": {"type": "number"},
                "max_amount": {"type": "number"},
                "limit":      {"type": "integer", "default": 20},
            },
        },
    },
    {
        "name": "get_top_categories",
        "description": "Get top spending categories for a date range",
        "input_schema": {
            "type": "object",
            "properties": {
                "start": {"type": "string", "description": "YYYY-MM-DD"},
                "end":   {"type": "string", "description": "YYYY-MM-DD"},
                "limit": {"type": "integer", "default": 10},
            },
        },
    },
    {
        "name": "get_income_summary",
        "description": "Get income totals and breakdown by source type",
        "input_schema": {
            "type": "object",
            "properties": {
                "period": {"type": "string", "description": "YYYY-MM, YYYY, or 'ytd'"}
            },
        },
    },
    {
        "name": "get_recurring_charges",
        "description": "Get list of recurring/subscription charges",
        "input_schema": {"type": "object", "properties": {}},
    },
]


def _run_tool(conn, name: str, inputs: dict) -> str:
    """Execute a chat tool and return a JSON-serialisable string result."""
    import json
    today = datetime.date.today()

    if name == "get_cashflow":
        period = inputs.get("period", str(today.year))
        from income import _period_clause, INCOME_WHERE
        from importer import EXCLUDED_CATEGORIES
        excl = ", ".join(f"'{c}'" for c in EXCLUDED_CATEGORIES)
        base = f"ignored = 0 AND (category NOT IN ({excl}) OR category IS NULL)"
        if period == "ytd":
            clause = f"{base} AND date LIKE '{today.year}%'"
        elif len(period) == 4:
            clause = f"{base} AND date LIKE '{period}%'"
        else:
            clause = f"{base} AND date LIKE '{period}%'"
        row = conn.execute(
            f"""SELECT
                COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS income,
                COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS spend
               FROM transactions WHERE {clause}"""
        ).fetchone()
        income, spend = row["income"], row["spend"]
        net = income - spend
        return json.dumps({
            "period": period,
            "income": round(income, 2),
            "spend":  round(spend, 2),
            "net":    round(net, 2),
            "savings_rate": f"{round(net / income * 100, 1)}%" if income else "N/A",
        })

    elif name == "search_transactions":
        where = ["ignored = 0"]
        params = []
        if inputs.get("search"):
            where.append("(name LIKE ? OR description LIKE ? OR custom_name LIKE ?)")
            kw = f"%{inputs['search']}%"
            params += [kw, kw, kw]
        if inputs.get("category"):
            where.append("category = ?"); params.append(inputs["category"])
        if inputs.get("start"):
            where.append("date >= ?"); params.append(inputs["start"])
        if inputs.get("end"):
            where.append("date <= ?"); params.append(inputs["end"])
        if inputs.get("min_amount") is not None:
            where.append("ABS(amount) >= ?"); params.append(inputs["min_amount"])
        if inputs.get("max_amount") is not None:
            where.append("ABS(amount) <= ?"); params.append(inputs["max_amount"])
        limit = min(int(inputs.get("limit", 20)), 50)
        clause = " AND ".join(where)
        total = conn.execute(f"SELECT COUNT(*) FROM transactions WHERE {clause}", params).fetchone()[0]
        rows = conn.execute(
            f"SELECT date, name, custom_name, amount, category FROM transactions WHERE {clause} ORDER BY date DESC LIMIT ?",
            params + [limit],
        ).fetchall()
        txns = [{"date": r["date"], "name": r["custom_name"] or r["name"], "amount": r["amount"], "category": r["category"]} for r in rows]
        return json.dumps({"total": total, "shown": len(txns), "transactions": txns})

    elif name == "get_top_categories":
        from importer import EXCLUDED_CATEGORIES
        excl = ", ".join(f"'{c}'" for c in EXCLUDED_CATEGORIES)
        where = [f"amount > 0", f"ignored = 0", f"(category NOT IN ({excl}) OR category IS NULL)"]
        params = []
        if inputs.get("start"): where.append("date >= ?"); params.append(inputs["start"])
        if inputs.get("end"):   where.append("date <= ?"); params.append(inputs["end"])
        limit = min(int(inputs.get("limit", 10)), 20)
        clause = " AND ".join(where)
        rows = conn.execute(
            f"SELECT category, SUM(amount) AS total, COUNT(*) AS count FROM transactions WHERE {clause} GROUP BY category ORDER BY total DESC LIMIT ?",
            params + [limit],
        ).fetchall()
        return json.dumps([{"category": r["category"], "total": round(r["total"], 2), "count": r["count"]} for r in rows])

    elif name == "get_income_summary":
        from income import get_summary
        period = inputs.get("period")
        return json.dumps(get_summary(conn, period))

    elif name == "get_recurring_charges":
        rows = detect_recurring(conn)
        return json.dumps(rows[:20])

    return json.dumps({"error": f"Unknown tool: {name}"})


def chat(conn, messages: list) -> dict:
    """
    Multi-turn chat with tool loop. Returns {reply, tool_calls}.
    messages: [{role: 'user'|'assistant', content: str}]
    """
    today = datetime.date.today().isoformat()
    api_messages = [{"role": m["role"], "content": m["content"]} for m in messages]
    tool_calls = []
    max_iterations = 5
    provider = _get_provider()

    if provider == "openai":
        oai_tools = [_to_oai_tool(t) for t in _CHAT_TOOLS]
        oai_messages = [{"role": "system", "content": f"{_SYSTEM_PROMPT}\nToday's date: {today}"}] + api_messages

        for _ in range(max_iterations):
            response = _openai_client().chat.completions.create(
                model=OPENAI_MODEL,
                max_tokens=1024,
                tools=oai_tools,
                messages=oai_messages,
            )
            _track_openai(conn, "chat", response)

            choice = response.choices[0]
            if choice.finish_reason == "stop":
                return {"reply": choice.message.content or "", "tool_calls": tool_calls}

            if choice.finish_reason == "tool_calls":
                oai_messages.append(choice.message)
                tool_results = []
                for tc in choice.message.tool_calls:
                    inputs = json.loads(tc.function.arguments)
                    result_str = _run_tool(conn, tc.function.name, inputs)
                    tool_calls.append({"tool": tc.function.name, "input": inputs, "result": result_str})
                    tool_results.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result_str,
                    })
                oai_messages.extend(tool_results)
    elif provider == "gemini":
        from google.genai import types
        contents = [
            types.Content(role="user" if m["role"] == "user" else "model", parts=[types.Part(text=m["content"])])
            for m in api_messages
        ]
        for _ in range(max_iterations):
            response = _gemini_client().models.generate_content(
                model=GEMINI_MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=f"{_SYSTEM_PROMPT}\nToday's date: {today}",
                    tools=_to_gemini_tools(_CHAT_TOOLS),
                    max_output_tokens=1024,
                ),
            )
            _track_gemini(conn, "chat", response)
            candidate = response.candidates[0]
            fcs = [p.function_call for p in candidate.content.parts if p.function_call and p.function_call.name]
            if not fcs:
                reply = " ".join(p.text for p in candidate.content.parts if p.text)
                return {"reply": reply, "tool_calls": tool_calls}
            contents.append(candidate.content)
            result_parts = []
            for fc in fcs:
                inputs = dict(fc.args)
                result_str = _run_tool(conn, fc.name, inputs)
                tool_calls.append({"tool": fc.name, "input": inputs, "result": result_str})
                result_parts.append(types.Part(function_response=types.FunctionResponse(name=fc.name, response={"result": result_str})))
            contents.append(types.Content(role="user", parts=result_parts))
    else:
        client = _client()
        for _ in range(max_iterations):
            response = client.messages.create(
                model=MODEL,
                max_tokens=1024,
                system=f"{_SYSTEM_PROMPT}\nToday's date: {today}",
                tools=_CHAT_TOOLS,
                messages=api_messages,
            )
            _track(conn, "chat", response)

            if response.stop_reason == "end_turn":
                reply = " ".join(b.text for b in response.content if hasattr(b, "text"))
                return {"reply": reply, "tool_calls": tool_calls}

            if response.stop_reason == "tool_use":
                api_messages.append({"role": "assistant", "content": response.content})
                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        result_str = _run_tool(conn, block.name, block.input)
                        tool_calls.append({"tool": block.name, "input": block.input, "result": result_str})
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": result_str,
                        })
                api_messages.append({"role": "user", "content": tool_results})

    return {"reply": "I ran into a problem processing that request. Please try again.", "tool_calls": tool_calls}
