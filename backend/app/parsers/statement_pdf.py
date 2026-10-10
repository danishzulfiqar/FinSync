"""PDF bank-statement parsing, ported from FinLens (``finlib/parser.py``).

Amounts are placed into Debit / Credit / Balance purely by their x-position on
the page, so we never guess whether a value is money-in or money-out. New banks
are supported by adding an entry to :data:`LAYOUTS`.

Supported layouts out of the box: ``myabl`` (Allied Bank) and ``hbl`` (HBL
Mobile / Konnect). Password-protected PDFs are supported.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import IO

import pdfplumber

# Money token, e.g. "1,234.56" or "-1,234.56".
MONEY_RE = re.compile(r"^-?[\d,]+\.\d{2}$")


class StatementError(Exception):
    """Base class for statement-parsing failures."""


class UnknownLayoutError(StatementError):
    """The PDF did not match any known bank layout."""


class StatementPasswordError(StatementError):
    """The PDF is encrypted and the supplied password was missing or wrong."""


# Per-bank layouts. ``anchors`` are the right-edge x-coordinates of each amount
# column (amounts are right-aligned). ``detect`` picks the layout from the first
# page's text.
LAYOUTS: dict[str, dict] = {
    "myabl": {
        "detect": lambda t: "Opening Balance:" in t and "Account Statement" in t,
        "anchors": {"debit": 372.68, "credit": 471.89, "balance": 571.10},
        "date_re": re.compile(r"^\d{2}\s[A-Z][a-z]{2}\s\d{4}$"),
        "date_fmt": "%d %b %Y",
        "date_x_max": 100.0,
        "desc_x0_min": 100.0,
        "desc_x1_max": 340.0,
        "header_bottom": 205.0,
        "footer_re": re.compile(r"^\d+\s+\d{2}\s\w{3}\s\d{4},"),
        "order": "asc",
    },
    "hbl": {
        "detect": lambda t: "HBL Mobile" in t or "Account Activity generated" in t,
        "anchors": {"debit": 375.0, "credit": 446.0, "balance": 550.0},
        "date_re": re.compile(r"^\d{2}-\d{2}-\d{4}$"),
        "date_fmt": "%d-%m-%Y",
        "date_x_max": 90.0,
        "desc_x0_min": 150.0,
        "desc_x1_max": 340.0,
        "header_bottom": 218.0,
        "footer_re": None,
        "order": "desc",
    },
    # NayaPay statements use a signed AMOUNT column + a running BALANCE instead of
    # separate debit/credit columns, with multi-line descriptions, so they are
    # parsed by a dedicated routine (:func:`_parse_nayapay`) rather than the
    # x-anchor engine. Kept here only so detection stays table-driven.
    "nayapay": {
        "detect": lambda t: "NayaPay" in t
        and "Account Statement" in t
        and ("NayaPay ID" in t or "nayapay.com" in t),
        "date_fmt": "%d %b %Y",
        "order": "asc",
    },
}


@dataclass
class Statement:
    """Parsed contents of one statement PDF."""

    metadata: dict = field(default_factory=dict)
    transactions: list[dict] = field(default_factory=list)


def _detect_layout(page_text: str) -> str:
    for name, cfg in LAYOUTS.items():
        if cfg["detect"](page_text):
            return name
    raise UnknownLayoutError("Unrecognised statement layout (not myABL or HBL).")


def _classify_amount(x1: float, anchors: dict) -> str:
    debit, credit, balance = anchors["debit"], anchors["credit"], anchors["balance"]
    if x1 < (debit + credit) / 2:
        return "debit"
    if x1 < (credit + balance) / 2:
        return "credit"
    return "balance"


def _group_words_into_lines(words: list[dict], tol: float = 3.0) -> list[list[dict]]:
    lines: dict[int, list[dict]] = {}
    for w in words:
        lines.setdefault(round(w["top"] / tol), []).append(w)
    return [sorted(lines[k], key=lambda w: w["x0"]) for k in sorted(lines)]


def _extract_metadata(page, layout_name: str) -> dict:
    text = page.extract_text() or ""
    meta: dict = {}
    if layout_name == "myabl":
        patterns = {
            "account_number": r"Account Number:\s*(\S+)",
            "account_title": r"Account Title:\s*(.+)",
            "currency": r"Currency:\s*(\S+)",
            "opening_balance": r"Opening Balance:\s*([\d,]+\.\d{2})",
            "closing_balance": r"Closing Balance:\s*([\d,]+\.\d{2})",
        }
        for key, pat in patterns.items():
            m = re.search(pat, text)
            meta[key] = m.group(1).strip() if m else None
    else:  # hbl
        m_title = re.search(r"AccountTitle:(.+)", text)
        m_iban = re.search(r"IBAN:(\S+)", text)
        m_row = re.search(
            r"(\d{6,})\s+\d+\s+([A-Z]{3})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})", text
        )
        meta["account_number"] = m_row.group(1) if m_row else None
        meta["account_title"] = m_title.group(1).strip() if m_title else None
        meta["currency"] = m_row.group(2) if m_row else None
        meta["opening_balance"] = m_row.group(3) if m_row else None
        meta["closing_balance"] = m_row.group(4) if m_row else None
        meta["iban"] = m_iban.group(1) if m_iban else None
    return meta


def parse_statement(
    source: str | Path | IO[bytes],
    password: str | None = None,
    source_name: str | None = None,
) -> Statement:
    """Extract account metadata and transactions from a statement PDF.

    ``source`` may be a path or a binary file-like object (e.g. an upload).
    Raises :class:`StatementPasswordError` for encrypted PDFs with a missing or
    wrong password, and :class:`UnknownLayoutError` for unrecognised layouts.
    """
    is_fileobj = hasattr(source, "read")
    if source_name:
        name = source_name
    elif is_fileobj:
        name = getattr(source, "name", "statement.pdf")
    else:
        name = Path(source).name

    stmt = Statement()
    try:
        pdf = pdfplumber.open(
            source if is_fileobj else str(source), password=password or ""
        )
    except Exception as exc:  # pdfminer raises varied types for bad passwords
        if _looks_like_password_error(exc):
            raise StatementPasswordError(
                "This statement is password-protected. Provide the correct password."
            ) from exc
        raise StatementError(f"Could not open PDF: {exc}") from exc

    with pdf:
        layout_name = _detect_layout(pdf.pages[0].extract_text() or "")
        if layout_name == "nayapay":
            return _parse_nayapay(pdf, name)
        layout = LAYOUTS[layout_name]
        anchors = layout["anchors"]

        stmt.metadata = _extract_metadata(pdf.pages[0], layout_name)
        stmt.metadata.update(
            source_file=name,
            pages=len(pdf.pages),
            layout=layout_name,
            date_fmt=layout["date_fmt"],
            order=layout["order"],
        )

        for page in pdf.pages:
            words = page.extract_words(keep_blank_chars=False)
            header_tops = [w["top"] for w in words if w["text"] == "Description"]
            start_y = max(header_tops) if header_tops else layout["header_bottom"]

            for row in _group_words_into_lines(words):
                if not row or row[0]["top"] <= start_y + 2:
                    continue
                line_text = " ".join(w["text"] for w in row)
                if layout["footer_re"] and layout["footer_re"].match(line_text):
                    continue

                date_str = " ".join(
                    w["text"] for w in row if w["x0"] < layout["date_x_max"]
                )
                desc = " ".join(
                    w["text"]
                    for w in row
                    if layout["desc_x0_min"] <= w["x0"] and w["x1"] <= layout["desc_x1_max"]
                )
                amounts = {
                    _classify_amount(w["x1"], anchors): w["text"]
                    for w in row
                    if MONEY_RE.match(w["text"])
                }

                if layout["date_re"].match(date_str):
                    stmt.transactions.append(
                        {
                            "date": date_str,
                            "description": desc,
                            "debit": amounts.get("debit"),
                            "credit": amounts.get("credit"),
                            "balance": amounts.get("balance"),
                        }
                    )
                elif stmt.transactions and desc:
                    stmt.transactions[-1]["description"] += " " + desc

    return stmt


def _looks_like_password_error(exc: Exception) -> bool:
    name = type(exc).__name__.lower()
    msg = str(exc).lower()
    return "password" in name or "password" in msg or "encrypt" in msg


# --------------------------------------------------------------------------- #
# HBL description cleanup                                                       #
# --------------------------------------------------------------------------- #
# HBL statement rows arrive as densely packed text with almost no spacing, e.g.
# "FundsTransferSMc8349def373781TO JOHNSMITHIBANXXXX-3328Thru RaastMB..".
# These helpers turn that into a readable summary plus a counterparty/merchant.

_HBL_IBAN_RE = re.compile(r"IBAN[X]*-?(\d{3,4})")
# The TO/FR direction marker is UPPERCASE and sits right before the counterparty
# name (which ends at "IBAN"). Matched case-sensitively so it never fires inside
# the lowercase transaction-hash noise that precedes it.
_HBL_NAME_RE = re.compile(r"(TO|FR)\s*([A-Z][A-Za-z .'\-]*?)\s*IBAN")
# POS rows end with "PKR <amount><glued digits><MERCHANT>"; the merchant is the
# trailing text once the amount and its trailing reference digits are stripped.
_HBL_POS_MERCHANT_RE = re.compile(r"PKR\s*[\d,]+\.\d{2}(.*)$")
_HBL_LEADING_REF_RE = re.compile(r"^[\d\s+/*.\-]+")
_HBL_TELCO_RE = re.compile(r"(UFONE|JAZZ|WARID|ZONG|TELENOR|SCOM)", re.IGNORECASE)
# "LocalTransfer<ref digits><NAME> <counterparty account digits>-...": the
# counterparty name is the text between the leading reference digits and the
# next long digit run (the account number).
_HBL_LOCAL_NAME_RE = re.compile(r"([A-Za-z][A-Za-z0-9 .,&()'/\-]*?)\s*\d{5,}")
_CAMEL_SPLIT_RE = re.compile(r"(?<=[a-z])(?=[A-Z])")

# HBL POS merchant text glues the city onto the preceding word
# ("PHARMACYISLAMABAD") and omits spaces in some brand names. These lists let us
# re-insert the missing spaces for the common Pakistani cities and known brands.
_HBL_CITIES = (
    "ISLAMABAD",
    "RAWALPINDI",
    "KARACHI",
    "LAHORE",
    "PESHAWAR",
    "MULTAN",
    "FAISALABAD",
    "QUETTA",
    "SIALKOT",
    "GUJRANWALA",
    "HYDERABAD",
    "ABBOTTABAD",
)
_HBL_CITY_RE = re.compile(
    r"(?<=[A-Za-z0-9.)])(" + "|".join(_HBL_CITIES) + r")\b", re.IGNORECASE
)
_HBL_BRAND_FIXUPS = {
    "DWATSON": "D WATSON",
    "THECOFFEE": "THE COFFEE",
    "DAILYDELI": "DAILY DELI",
}
_HBL_BRAND_RE = re.compile(
    r"\b(" + "|".join(_HBL_BRAND_FIXUPS) + r")\b", re.IGNORECASE
)


def _hbl_tidy_name(name: str) -> str:
    name = _CAMEL_SPLIT_RE.sub(" ", name.strip(" -.'"))  # DanishZulfiqar -> Danish Zulfiqar
    return re.sub(r"\s+", " ", name).strip()


def _hbl_tidy_merchant(text: str) -> str:
    """Re-space a glued HBL POS merchant string (city + known brands + ``&``)."""
    text = _HBL_BRAND_RE.sub(lambda m: _HBL_BRAND_FIXUPS[m.group(1).upper()], text)
    text = _HBL_CITY_RE.sub(r" \1", text)  # "PHARMACYISLAMABAD" -> "PHARMACY ISLAMABAD"
    text = re.sub(r"\s*&\s*", " & ", text)  # "BEAN&TEA" -> "BEAN & TEA"
    return re.sub(r"\s+", " ", text).strip()


def _hbl_named_transfer(text: str, marker: str) -> str | None:
    """Pull the counterparty name from a ``<marker><ref digits><NAME> <acct>`` row."""
    rest = re.sub(rf"(?i)^.*?{re.escape(marker)}", "", text, count=1).lstrip()
    rest = re.sub(r"^[\d\s]+", "", rest)  # drop the leading reference digits
    name_m = _HBL_LOCAL_NAME_RE.match(rest)
    if name_m:
        name = _hbl_tidy_name(name_m.group(1))
        if name and len(name) > 2:
            return name
    return None


def clean_hbl_description(raw: str) -> tuple[str, str | None]:
    """Turn a packed HBL statement description into ``(summary, counterparty)``.

    Best-effort: recognises Raast/IBFT transfers, ATM withdrawals, card/POS
    purchases and mobile top-ups; otherwise returns a lightly tidied string.
    """
    text = re.sub(r"\s+", " ", (raw or "")).strip()
    if not text:
        return (raw or "").strip(), None
    lower = text.lower()

    # Card / POS purchase or reversal: the trailing run is the merchant name.
    # Reversals ("D.Card/POSRev") are refunds back to the account.
    if "debitcard/pos" in lower or "d.card/pos" in lower or lower.startswith("pos"):
        is_refund = "posrev" in lower or "pos rev" in lower
        label = "Card refund" if is_refund else "Card purchase"
        m = _HBL_POS_MERCHANT_RE.search(text)
        merchant = _HBL_LEADING_REF_RE.sub("", m.group(1)).strip() if m else ""
        merchant = _hbl_tidy_merchant(merchant) if merchant else ""
        merchant = merchant or None
        if merchant and len(merchant) <= 2:
            merchant = None
        return (f"{label} – {merchant}", merchant) if merchant else (label, None)

    # ATM cash withdrawal.
    if "atmcash" in lower or "cashpaid" in lower or "cashwithdraw" in lower:
        return "ATM cash withdrawal", None

    # Funds transfer (Raast / IBFT / 1-LINK / digital banking / mobile top-up).
    if "fundstransfer" in lower:
        telco = _HBL_TELCO_RE.search(text)
        if telco:
            op = telco.group(1).upper()
            return f"Mobile top-up – {op}", op.title()

        name_m = _HBL_NAME_RE.search(text)
        if name_m:
            direction = "to" if name_m.group(1) == "TO" else "from"
            name = _hbl_tidy_name(name_m.group(2))
            iban = _HBL_IBAN_RE.search(text)
            last4 = iban.group(1)[-4:] if iban else None
            if name:
                summary = f"Transfer {direction} {name}"
                if last4:
                    summary += f" (••••{last4})"
                return summary, name
        return "Funds transfer", None

    # Salary credit: "SalaryCredit<ref digits><EMPLOYER NAME> <acct digits>-...".
    if "salarycredit" in lower:
        name = _hbl_named_transfer(text, "salarycredit")
        return (f"Salary – {name}", name) if name else ("Salary credit", None)

    # Local / inter-bank transfer, e.g. salary or vendor credits:
    # "LocalTransfer13580408476477HUAWEI TECH.PAKISTAN(PVT)LTD 08747900849201-...".
    if "localtransfer" in lower:
        name = _hbl_named_transfer(text, "localtransfer")
        return (f"Local transfer – {name}", name) if name else ("Local transfer", None)

    return text, None


# --------------------------------------------------------------------------- #
# NayaPay statement parser                                                     #
# --------------------------------------------------------------------------- #
# NayaPay lays each transaction out as a vertical band: the top line carries the
# date, type, first description line, signed AMOUNT and running BALANCE; the
# lines below it continue the time, type and description (counterparty, bank,
# transaction id, fees). A signed "+Rs"/"-Rs" amount appears on exactly one line
# per transaction, so we treat any line containing one as the start of a new
# transaction (independent of column geometry, which varies between PDFs) and
# fold the lines beneath it into that transaction. Columns are still used to pull
# the type and description apart once the boundary is known.

_NP_HEADERS = ("TIME", "TYPE", "DESCRIPTION", "AMOUNT", "BALANCE")
_NP_DATE_RE = re.compile(r"\b\d{1,2}\s[A-Za-z]{3}\s\d{4}\b")
_NP_TIME_RE = re.compile(r"\b\d{1,2}:\d{2}\s?[AP]M\b", re.IGNORECASE)
# A signed transaction amount: sign + Rs + value (value may omit decimals).
_NP_AMOUNT_RE = re.compile(r"([+-])\s*Rs\.?\s*([\d,]+(?:\.\d{1,2})?)", re.IGNORECASE)
_NP_BAL_RE = re.compile(r"Rs\.?\s*([\d,]+\.\d{2})", re.IGNORECASE)
_NP_TXID_RE = re.compile(r"Transaction ID\s+([A-Za-z0-9]+)", re.IGNORECASE)
_NP_CARD_RE = re.compile(r"Visa[\sxX\u25cf\u2022*]*?(\d{4})", re.IGNORECASE)
# Counterparty bank sits at the tail of a transfer line, e.g. "easypaisa Bank-3049",
# "HBL-5003", "JazzCash/Mobilink MFB-3338"; everything before it is the name.
_NP_BANK_RE = re.compile(r"^(.+?)\s+([\w/]+(?:\s(?:Bank|MFB))?-\d{3,})$", re.IGNORECASE)
_NP_TRANSFER_RE = re.compile(
    r"(?i)\b(Outgoing fund transfer to|Incoming fund transfer from)\s+"
    r"(.+?)(?:\s+Transaction ID|\s+Service Charges|\s+Fees and|$)"
)
_NP_CARD_PAID_RE = re.compile(
    r"(?i)(Reversed:\s*)?Paid to\s+"
    r"(.+?)(?:\s+Visa\b|\s+Fees and\b|\s+Service Charges\b|\s+USD\b|$)"
)


def _np_header_centres(lines: list[list[dict]]):
    """Return ([(LABEL, x_centre), ...] sorted by x, header_top) for the column
    header row, or (None, None) when this page has no header."""
    for line in lines:
        labels = [w for w in line if w["text"].upper() in _NP_HEADERS]
        if len(labels) >= 3:
            ordered = sorted(
                ((w["text"].upper(), (w["x0"] + w["x1"]) / 2) for w in labels),
                key=lambda lc: lc[1],
            )
            return ordered, line[0]["top"]
    return None, None


def _np_column(centre: float, ordered: list[tuple[str, float]]) -> str:
    return min(ordered, key=lambda lc: abs(lc[1] - centre))[0]


def _np_describe(joined: str, sign: str) -> dict:
    """Pull a human description + counterparty out of a NayaPay description blob."""
    # Columns occasionally leak a date, time, amount or balance into the
    # description; strip those before interpreting the text.
    joined = _NP_DATE_RE.sub(" ", joined)
    joined = _NP_TIME_RE.sub(" ", joined)
    joined = _NP_AMOUNT_RE.sub(" ", joined)
    joined = re.sub(r"Rs\.?\s*[\d,]+(?:\.\d{1,2})?", " ", joined)
    joined = re.sub(r"\s{2,}", " ", joined).strip()

    ref_m = _NP_TXID_RE.search(joined)
    reference = ref_m.group(1) if ref_m else None
    card_m = _NP_CARD_RE.search(joined)
    card_last4 = f"****{card_m.group(1)}" if card_m else None

    transfer = _NP_TRANSFER_RE.search(joined)
    if transfer:
        incoming = "from" in transfer.group(1).lower()
        name_bank = transfer.group(2).strip()
        bank_m = _NP_BANK_RE.match(name_bank)
        name, bank = (bank_m.group(1).strip(), bank_m.group(2).strip()) if bank_m else (name_bank, None)
        desc = f"Received from {name}" if incoming else f"Sent to {name}"
        if bank:
            desc = f"{desc} · {bank}"
        return {"description": desc, "merchant": name, "reference": reference, "card_last4": card_last4}

    paid = _NP_CARD_PAID_RE.search(joined)
    if paid:
        reversed_ = bool(paid.group(1)) or sign == "+"
        merchant = paid.group(2).strip()
        desc = f"Refund from {merchant}" if reversed_ else f"Paid to {merchant}"
        return {"description": desc, "merchant": merchant, "reference": reference, "card_last4": card_last4}

    if re.search(r"(?i)Multiple Merchants", joined):
        return {
            "description": "International card transaction",
            "merchant": "Multiple Merchants",
            "reference": reference,
            "card_last4": card_last4,
        }

    clean = re.split(r"(?i)\s+(?:Transaction ID|Service Charges|Fees and Government)", joined)[0].strip()
    return {"description": clean or None, "merchant": None, "reference": reference, "card_last4": card_last4}


def _np_finalize(block: dict) -> dict | None:
    joined_text = " ".join(t for t in block["text"] if t)
    date_m = _NP_DATE_RE.search(joined_text)
    if not date_m or not block["sign"] or block["amount"] is None:
        return None
    try:
        if Decimal(block["amount"]) == 0:
            return None  # zero-value card authorisations move no money
    except (InvalidOperation, ValueError):
        return None
    time_m = _NP_TIME_RE.search(joined_text)
    parsed = _np_describe(" ".join(d for d in block["desc"] if d).strip(), block["sign"])
    return {
        "date": date_m.group(0),
        "time": time_m.group(0) if time_m else None,
        "type": " ".join(t for t in block["type"] if t).strip() or None,
        "description": parsed["description"],
        "merchant": parsed["merchant"],
        "reference": parsed["reference"],
        "account_identifier": parsed["card_last4"],
        "debit": None if block["sign"] == "+" else block["amount"],
        "credit": block["amount"] if block["sign"] == "+" else None,
        "balance": block["balance"],
    }


def _np_metadata(text: str, rows: list[dict], source_name: str, pages: int) -> dict:
    id_m = re.search(r"\b(03\d{9})\b", text)
    iban_m = re.search(r"\b(PK\d{2}NAYA\w+)", text)
    iban = iban_m.group(1) if iban_m else None
    account_number = id_m.group(1) if id_m else None
    if account_number is None and iban:
        tail = re.search(r"(03\d{9})$", iban)
        account_number = tail.group(1) if tail else None

    holder_m = re.search(r"([A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+)+)\s*\n\s*\S+@\S+", text)
    holder = holder_m.group(1).strip() if holder_m else None

    opening = closing = None
    if rows:
        first, last = rows[0], rows[-1]
        first_amount = first.get("credit") or first.get("debit")
        signed = (
            (Decimal(first["credit"]) if first.get("credit") else -Decimal(first["debit"]))
            if first_amount is not None
            else Decimal(0)
        )
        first_balance = Decimal(str(first["balance"]).replace(",", ""))
        opening = str(first_balance - signed)
        closing = str(Decimal(str(last["balance"]).replace(",", "")))

    return {
        "account_number": account_number,
        "account_title": holder,
        "iban": iban,
        "currency": "PKR",
        "opening_balance": opening,
        "closing_balance": closing,
        "layout": "nayapay",
        "date_fmt": "%d %b %Y",
        "order": "asc",
        "source_file": source_name,
        "pages": pages,
    }


def _parse_nayapay(pdf, source_name: str) -> Statement:
    """Parse a NayaPay account statement into a :class:`Statement`."""
    stmt = Statement()
    ordered: list[tuple[str, float]] | None = None
    blocks: list[dict] = []

    for page in pdf.pages:
        lines = _group_words_into_lines(page.extract_words(keep_blank_chars=False))
        centres, header_top = _np_header_centres(lines)
        if centres:
            ordered = centres
        if ordered is None:
            continue

        current: dict | None = None
        for line in lines:
            if header_top is not None and line[0]["top"] <= header_top + 2:
                continue
            words = sorted(line, key=lambda w: w["x0"])
            full_text = " ".join(w["text"] for w in words)
            cols: dict[str, list[str]] = {label: [] for label, _ in ordered}
            for w in words:
                cols[_np_column((w["x0"] + w["x1"]) / 2, ordered)].append(w["text"])
            amount_col = " ".join(cols.get("AMOUNT", []))
            balance_col = " ".join(cols.get("BALANCE", []))
            desc_text = " ".join(cols.get("DESCRIPTION", []))
            type_text = " ".join(cols.get("TYPE", []))

            # A signed "+Rs"/"-Rs" amount appears once per transaction and marks
            # its top line, wherever the columns place it.
            amt_m = _NP_AMOUNT_RE.search(full_text)
            if amt_m:
                tail = full_text[amt_m.end():]
                bal_m = _NP_BAL_RE.search(tail) or _NP_BAL_RE.search(balance_col)
                # A narrow description column can push its trailing words into the
                # AMOUNT column; recover the text that sits before the sign.
                overflow = re.split(r"[+-]\s*Rs", amount_col, maxsplit=1)[0].strip()
                desc_parts = [desc_text] if desc_text else []
                if overflow and re.search(r"[A-Za-z]", overflow):
                    desc_parts.append(overflow)
                current = {
                    "sign": amt_m.group(1),
                    "amount": amt_m.group(2).replace(",", ""),
                    "balance": bal_m.group(1).replace(",", "") if bal_m else None,
                    "type": [type_text] if type_text else [],
                    "text": [full_text],
                    "desc": desc_parts,
                }
                blocks.append(current)
            elif current is not None:
                current["text"].append(full_text)
                if bal_m := _NP_BAL_RE.search(balance_col):
                    if current["balance"] is None:
                        current["balance"] = bal_m.group(1).replace(",", "")
                if type_text:
                    current["type"].append(type_text)
                if desc_text:
                    current["desc"].append(desc_text)

    stmt.transactions = [row for row in (_np_finalize(b) for b in blocks) if row]
    first_text = pdf.pages[0].extract_text() or "" if pdf.pages else ""
    stmt.metadata = _np_metadata(first_text, stmt.transactions, source_name, len(pdf.pages))
    return stmt
