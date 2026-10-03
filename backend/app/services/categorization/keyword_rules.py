"""FinLens-style keyword categorization (income vs. expense aware).

Ported from the FinLens ``finlib/analysis.py`` rule set. Used as a fallback by
:func:`app.services.categorization.rules.categorize` when the provider-specific
rules in ``providers.yaml`` do not match — so PDF statement rows (which have no
provider merchant tags) still land in meaningful categories.

First match wins; order matters. Expense rules apply to debits, income rules to
credits. Everything else falls back to "Other Expense" / "Other Income".
"""

from __future__ import annotations

# (category, [keywords]) — matched as case-insensitive substrings.
EXPENSE_RULES: list[tuple[str, list[str]]] = [
    ("Bills & Utilities", ["electric", "k-electric", "kelectric", "wapda", "sui",
                           "gas bill", "ptcl", "wifi", "internet", "lesco",
                           "iesco", "gepco", "utility", "bill"]),
    ("Telecom & Mobile", ["jazz", "zong", "ufone", "telenor", "easypaisa",
                          "jazzcash", "mobile", "recharge", "top up", "topup",
                          "airtime", "scratch", "load"]),
    ("Food & Dining", ["food", "restaurant", "cafe", "foodpanda", "kfc",
                       "mcdonald", "pizza", "bakery", "dine", "eat", "burger",
                       "coffee"]),
    ("Groceries & Shopping", ["mart", "store", "shop", "daraz", "amazon",
                              "grocery", "bazar", "supermarket", "metro",
                              "imtiaz", "carrefour", "pos"]),
    ("Fuel & Transport", ["fuel", "petrol", "pso", "shell", "parco", "byco",
                          "careem", "uber", "indrive", "bykea", "toll",
                          "transport"]),
    ("Cash & ATM", ["atm", "cash withdraw", "withdrawal", "cash wdl", "cwd"]),
    ("Transfers Out", ["ibft", "funds transfer", "fund transfer", "1link",
                       "raast", "ift", "transfer to", "sent to", "remit",
                       "outward"]),
    ("Fees & Charges", ["charge", "fee", "wht", "service charge", "duty",
                        "stamp", "tax", "fed ", "excise", "penalty"]),
    ("Health", ["pharmacy", "hospital", "clinic", "medical", "lab", "dawa"]),
    ("Education", ["school", "university", "college", "tuition", "academy",
                   "course"]),
    ("Subscriptions", ["netflix", "spotify", "youtube", "subscription",
                       "google", "apple.com", "microsoft", "openai", "prime"]),
]

INCOME_RULES: list[tuple[str, list[str]]] = [
    # Refunds first: a reversed card purchase must not read as salary.
    ("Refunds", ["refund", "reversal", "reversed", "cashback", "chargeback"]),
    # Bare "pay" matched "NayaPay"/"easypaisa"; require a real payroll word.
    ("Salary", ["salary", "payroll", "wages", "stipend"]),
    ("Profit & Returns", ["profit", "return", "markup", "interest", "dividend",
                          "reward"]),
    ("Transfers In", ["ibft", "funds transfer", "transfer from", "received",
                      "raast", "inward", "credit from", "deposit"]),
]

DEFAULT_EXPENSE = "Other Expense"
DEFAULT_INCOME = "Other Income"


def categorize_by_keywords(text: str | None, *, is_credit: bool) -> str:
    """Return a category name for ``text`` using the income/expense rule set."""
    haystack = (text or "").lower()
    rules = INCOME_RULES if is_credit else EXPENSE_RULES
    for name, keywords in rules:
        if any(k in haystack for k in keywords):
            return name
    return DEFAULT_INCOME if is_credit else DEFAULT_EXPENSE
