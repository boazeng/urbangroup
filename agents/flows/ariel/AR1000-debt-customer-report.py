"""
AR1000 — Ariel Debt Customer Report (דוח חייבים לקוחות אריאל)

Flow:
1. Fetch accounts from ACCOUNTS_RECEIVABLE where ACNGCODE = '102-1'
2. Filter to accounts with non-zero BALANCE3 (current balance)
3. Return sorted list by balance descending
"""

import sys
import os
import io
import logging
from pathlib import Path
from datetime import datetime, timezone

if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import requests
from requests.auth import HTTPBasicAuth

if os.environ.get("IS_LAMBDA") != "true":
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
    load_dotenv(env_path)

logger = logging.getLogger("urbangroup.ar1000")

PRIORITY_URL = os.getenv("PRIORITY_URL_DEMO", os.getenv("PRIORITY_URL", "")).rstrip("/")
PRIORITY_USERNAME = os.getenv("PRIORITY_USERNAME", "")
PRIORITY_PASSWORD = os.getenv("PRIORITY_PASSWORD", "")

ARIEL_ACNGCODE = "102-1"


def generate_report():
    """Fetch Ariel accounts (ACNGCODE='102-1') with their current balance from ACCOUNTS_RECEIVABLE."""
    headers = {"Accept": "application/json", "OData-Version": "4.0"}
    auth = HTTPBasicAuth(PRIORITY_USERNAME, PRIORITY_PASSWORD)

    url = (
        f"{PRIORITY_URL}/ACCOUNTS_RECEIVABLE"
        f"?$filter=ACNGCODE eq '{ARIEL_ACNGCODE}'"
        f"&$select=ACCNAME,ACCDES,BALANCE3,BALANCE2,ACNGCODE"
    )

    all_accounts = []
    while url:
        resp = requests.get(url, headers=headers, auth=auth)
        resp.raise_for_status()
        data = resp.json()
        all_accounts.extend(data.get("value", []))
        url = data.get("@odata.nextLink")

    logger.info(f"Fetched {len(all_accounts)} Ariel accounts (ACNGCODE={ARIEL_ACNGCODE})")

    # Filter to accounts with non-zero balance
    customers = []
    for acc in all_accounts:
        balance = float(acc.get("BALANCE3", 0) or 0)
        if balance == 0:
            continue
        customers.append({
            "custname": acc.get("ACCNAME", ""),
            "cdes": acc.get("ACCDES", ""),
            "balance": balance,
        })

    # Sort by balance descending
    customers.sort(key=lambda c: c["balance"], reverse=True)

    total_balance = sum(c["balance"] for c in customers)

    return {
        "customers": customers,
        "total_balance": total_balance,
        "ariel_customer_count": len(all_accounts),
        "filtered_customer_count": len(customers),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def main():
    print("=" * 60)
    print("  AR1000 — Ariel Debt Customer Report")
    print(f"  Section: {ARIEL_ACNGCODE}")
    print("=" * 60)
    print()

    if not PRIORITY_URL or not PRIORITY_USERNAME:
        print("Error: Missing PRIORITY_URL or PRIORITY_USERNAME in .env")
        sys.exit(1)

    print(f"Connecting to: {PRIORITY_URL}")
    print()

    report = generate_report()
    print(f"Ariel accounts (ACNGCODE={ARIEL_ACNGCODE}): {report['ariel_customer_count']}")
    print(f"Accounts with balance: {report['filtered_customer_count']}")
    print()

    fmt = "{:<12} {:<30} {:>15}"
    print(fmt.format("Customer", "Name", "Balance"))
    print("-" * 60)
    for c in report["customers"]:
        print(fmt.format(
            c["custname"],
            c["cdes"][:30],
            f'{c["balance"]:,.0f}',
        ))
    print("-" * 60)
    print(fmt.format("", "TOTAL", f'{report["total_balance"]:,.0f}'))

    # Save output
    output_dir = Path(__file__).resolve().parent.parent.parent.parent / "output"
    output_dir.mkdir(exist_ok=True)
    output_file = output_dir / "AR1000-debt-customer-report.txt"

    with open(output_file, "w", encoding="utf-8") as f:
        f.write(f"AR1000 — Ariel Debt Customer Report\n")
        f.write(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Source: {PRIORITY_URL}\n")
        f.write(f"Section: {ARIEL_ACNGCODE}\n")
        f.write(f"Ariel accounts: {report['ariel_customer_count']}\n")
        f.write(f"Accounts with balance: {report['filtered_customer_count']}\n")
        f.write("\n")
        f.write(fmt.format("Customer", "Name", "Balance") + "\n")
        f.write("-" * 60 + "\n")
        for c in report["customers"]:
            f.write(fmt.format(
                c["custname"],
                c["cdes"][:30],
                f'{c["balance"]:,.0f}',
            ) + "\n")
        f.write("-" * 60 + "\n")
        f.write(fmt.format("", "TOTAL", f'{report["total_balance"]:,.0f}') + "\n")

    print()
    print(f"Saved to: {output_file}")


if __name__ == "__main__":
    main()
