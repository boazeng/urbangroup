"""
500-Transaction Reader Agent
Reads journal transaction entries (יומן תנועות) from Priority ERP.
Accepts a transaction number (FNCNUM) and retrieves header + line items.
"""

import sys
import os
import io
import json
from pathlib import Path

if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import requests
from requests.auth import HTTPBasicAuth

# Environment loading
if os.environ.get("IS_LAMBDA") != "true":
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent.parent.parent.parent / ".env"
    load_dotenv(env_path)

PRIORITY_URL = os.getenv("PRIORITY_URL_REAL", "").rstrip("/")
PRIORITY_USERNAME = os.getenv("PRIORITY_USERNAME", "")
PRIORITY_PASSWORD = os.getenv("PRIORITY_PASSWORD", "")

HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "OData-Version": "4.0",
}
AUTH = HTTPBasicAuth(PRIORITY_USERNAME, PRIORITY_PASSWORD)


def validate_config():
    missing = []
    if not PRIORITY_URL:
        missing.append("PRIORITY_URL_REAL")
    if not PRIORITY_USERNAME:
        missing.append("PRIORITY_USERNAME")
    if not PRIORITY_PASSWORD:
        missing.append("PRIORITY_PASSWORD")
    if missing:
        print(f"Error: Missing environment variables: {', '.join(missing)}")
        sys.exit(1)


def read_transaction(fncnum):
    """Read a journal transaction by FNCNUM, including line items."""
    url = f"{PRIORITY_URL}/FNCTRANS(FNCNUM='{fncnum}')"
    params = {"$expand": "FNCITEMS_SUBFORM"}

    resp = requests.get(url, params=params, headers=HEADERS, auth=AUTH, timeout=30)
    resp.raise_for_status()
    return resp.json()


def print_transaction(data):
    """Print transaction header and line items in a readable format."""
    print("=" * 70)
    print(f"  Transaction: {data.get('FNCNUM')}")
    print("=" * 70)

    print("\n--- Header ---")
    header_fields = [
        ("FNCNUM", "מס. תנועה"),
        ("FNCPATNAME", "סוג תנועה"),
        ("FNCPATDES2", "תאור סוג"),
        ("FNCDATE", "ת. ערך"),
        ("BALDATE", "ת. למאזן"),
        ("CURDATE", "ת. אסמכתא"),
        ("ACTDATE", "ת. פעילות"),
        ("FNCREF", "אסמכתא"),
        ("BOOKNUM", "אסמכתא 2"),
        ("DETAILS", "פרטים"),
        ("ACCNAME1", "חשבון חובה"),
        ("ACCDES1", "ת. חשבון חובה"),
        ("ACCNAME2", "חשבון זכות"),
        ("ACCDES2", "ת. חשבון זכות"),
        ("SUM1", "סכום"),
        ("SUMDEBIT", "סה\"כ חובה"),
        ("SUMCREDIT", "סה\"כ זכות"),
        ("BRANCHNAME", "סניף"),
        ("FINAL", "נרשמה בספרים"),
        ("CHECKING", "בבדיקה"),
        ("STORNOFLAG", "סטורנו"),
        ("FNCLOTNUM", "מנה"),
        ("USERLOGIN", "חתימה"),
        ("UDATE", "ת. חתימה"),
    ]
    for field, label in header_fields:
        val = data.get(field)
        if val is not None and val != "" and val != 0:
            print(f"  {label:20s} ({field:15s}): {val}")

    items = data.get("FNCITEMS_SUBFORM", [])
    print(f"\n--- Line Items ({len(items)} rows) ---")

    for item in items:
        kline = item.get("KLINE", "?")
        acc = item.get("ACCNAME", "")
        acc_des = item.get("ACCDES", "")
        debit = item.get("DEBIT1", 0)
        credit = item.get("CREDIT1", 0)
        details = item.get("DETAILS", "")
        ref1 = item.get("FNCIREF1", "")
        costc = item.get("COSTCNAME", "")
        costc_des = item.get("COSTCDES", "")
        cust = item.get("CUSTNAME", "")
        cust_des = item.get("CUSTDES", "")

        print(f"\n  Row {kline}:")
        print(f"    Account:     {acc} - {acc_des}")
        if debit:
            print(f"    Debit:       {debit:,.2f}")
        if credit:
            print(f"    Credit:      {credit:,.2f}")
        if details:
            print(f"    Details:     {details}")
        if ref1:
            print(f"    Reference:   {ref1}")
        if costc:
            print(f"    Cost Center: {costc} - {costc_des}")
        if cust:
            print(f"    Customer:    {cust} - {cust_des}")


def main():
    print("=" * 70)
    print("  500-Transaction Reader - Priority Cloud")
    print("=" * 70)
    print()

    validate_config()
    print(f"Connecting to: {PRIORITY_URL}")

    fncnum = sys.argv[1] if len(sys.argv) > 1 else "T120322"
    print(f"Reading transaction: {fncnum}\n")

    try:
        data = read_transaction(fncnum)
    except requests.exceptions.HTTPError as e:
        print(f"Error: HTTP {e.response.status_code}")
        print(f"Response: {e.response.text[:500]}")
        sys.exit(1)
    except requests.exceptions.ConnectionError:
        print("Error: Could not connect to Priority server.")
        sys.exit(1)

    print_transaction(data)

    # Save full JSON to output
    output_dir = Path(__file__).resolve().parent.parent.parent.parent.parent / "output"
    output_dir.mkdir(exist_ok=True)
    output_file = output_dir / "500-transaction_reader.txt"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"\nFull JSON saved to: {output_file}")


if __name__ == "__main__":
    main()
