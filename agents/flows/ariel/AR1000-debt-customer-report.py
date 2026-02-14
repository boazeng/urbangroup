"""
AR1000 — Ariel Debt Customer Report (דוח חייבים לקוחות אריאל)

Flow:
1. Fetch aging report (consolidated invoices) for branch 102
2. Fetch Ariel accounts (ACNGCODE = '102-1') from ACCOUNTS_RECEIVABLE
3. Filter aging report to only include those customers
4. Return the filtered report
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

ARIEL_BRANCH = "102"
ARIEL_ACNGCODE = "102-1"

AGE_BUCKETS = [
    ("current", 0, 30),
    ("30", 31, 60),
    ("60", 61, 90),
    ("90", 91, 120),
    ("120plus", 121, 999999),
]


def fetch_ariel_customers():
    """Fetch accounts with ACNGCODE = '102-1' (Ariel section) from ACCOUNTS_RECEIVABLE.

    ACCNAME in ACCOUNTS_RECEIVABLE corresponds to CUSTNAME in CINVOICES/CUSTOMERS.

    Returns:
        dict of {ACCNAME: ACCDES}
    """
    headers = {"Accept": "application/json", "OData-Version": "4.0"}
    auth = HTTPBasicAuth(PRIORITY_USERNAME, PRIORITY_PASSWORD)

    url = (
        f"{PRIORITY_URL}/ACCOUNTS_RECEIVABLE"
        f"?$filter=ACNGCODE eq '{ARIEL_ACNGCODE}'"
        f"&$select=ACCNAME,ACCDES,ACNGCODE"
    )

    customers = {}
    while url:
        resp = requests.get(url, headers=headers, auth=auth)
        resp.raise_for_status()
        data = resp.json()
        for c in data.get("value", []):
            customers[c["ACCNAME"]] = c.get("ACCDES", "")
        url = data.get("@odata.nextLink")

    logger.info(f"Fetched {len(customers)} Ariel customers (ACNGCODE={ARIEL_ACNGCODE})")
    return customers


def fetch_aging_for_customers(customer_set):
    """Fetch consolidated invoices for branch 102 and filter by customer set.

    Args:
        customer_set: dict of {CUSTNAME: CUSTDES} to include

    Returns:
        dict with customers, totals, invoice_count, generated_at
    """
    headers = {"Accept": "application/json", "OData-Version": "4.0"}
    auth = HTTPBasicAuth(PRIORITY_USERNAME, PRIORITY_PASSWORD)

    select = "CUSTNAME,CDES,IVNUM,IVDATE,TOTPRICE,CASHPAYMENT,DEBIT,BRANCHNAME"
    odata_filter = f"FINAL eq 'Y' and BRANCHNAME eq '{ARIEL_BRANCH}'"
    url = f"{PRIORITY_URL}/CINVOICES?$filter={odata_filter}&$select={select}"

    all_invoices = []
    while url:
        resp = requests.get(url, headers=headers, auth=auth)
        resp.raise_for_status()
        data = resp.json()
        all_invoices.extend(data.get("value", []))
        url = data.get("@odata.nextLink")

    logger.info(f"Fetched {len(all_invoices)} invoices for branch {ARIEL_BRANCH}")

    now = datetime.now(timezone.utc)
    customers = {}

    for inv in all_invoices:
        custname = inv.get("CUSTNAME", "")

        # Only include customers from the Ariel section
        if custname not in customer_set:
            continue

        cdes = inv.get("CDES", "")
        totprice = float(inv.get("TOTPRICE", 0) or 0)
        cashpayment = float(inv.get("CASHPAYMENT", 0) or 0)
        balance = totprice - cashpayment

        if balance <= 0:
            continue

        ivdate_str = inv.get("IVDATE", "")
        if not ivdate_str:
            continue
        try:
            ivdate = datetime.fromisoformat(ivdate_str.replace("Z", "+00:00"))
        except ValueError:
            continue

        age_days = (now - ivdate).days

        bucket = "120plus"
        for name, lo, hi in AGE_BUCKETS:
            if lo <= age_days <= hi:
                bucket = name
                break

        if custname not in customers:
            customers[custname] = {
                "custname": custname,
                "cdes": cdes,
                "current": 0,
                "30": 0,
                "60": 0,
                "90": 0,
                "120plus": 0,
                "total": 0,
                "invoices": [],
            }

        customers[custname][bucket] += balance
        customers[custname]["total"] += balance
        customers[custname]["invoices"].append({
            "ivnum": inv.get("IVNUM", ""),
            "ivdate": ivdate_str[:10],
            "totprice": totprice,
            "cashpayment": cashpayment,
            "balance": balance,
            "age_days": age_days,
            "bucket": bucket,
        })

    customer_list = sorted(customers.values(), key=lambda c: c["total"], reverse=True)

    totals = {"current": 0, "30": 0, "60": 0, "90": 0, "120plus": 0, "total": 0}
    for c in customer_list:
        for bucket_key in totals:
            totals[bucket_key] += c[bucket_key]

    return {
        "customers": customer_list,
        "totals": totals,
        "invoice_count": len(all_invoices),
        "filtered_customer_count": len(customer_list),
        "ariel_customer_count": len(customer_set),
        "generated_at": now.isoformat(),
    }


def generate_report():
    """Main entry point: fetch Ariel customers, then filter aging report."""
    ariel_customers = fetch_ariel_customers()
    report = fetch_aging_for_customers(ariel_customers)
    return report


def main():
    print("=" * 60)
    print("  AR1000 — Ariel Debt Customer Report")
    print(f"  Branch: {ARIEL_BRANCH} | Section: {ARIEL_ACNGCODE}")
    print("=" * 60)
    print()

    if not PRIORITY_URL or not PRIORITY_USERNAME:
        print("Error: Missing PRIORITY_URL or PRIORITY_USERNAME in .env")
        sys.exit(1)

    print(f"Connecting to: {PRIORITY_URL}")
    print()

    # Step 1: Fetch Ariel customers
    print("Step 1: Fetching Ariel customers (ACNGCODE=102-1)...")
    ariel_customers = fetch_ariel_customers()
    print(f"  Found {len(ariel_customers)} customers")
    print()

    # Step 2: Fetch aging report filtered by those customers
    print("Step 2: Fetching aging report for branch 102...")
    report = fetch_aging_for_customers(ariel_customers)
    print(f"  Total invoices (branch 102): {report['invoice_count']}")
    print(f"  Customers with balance (filtered): {report['filtered_customer_count']}")
    print()

    # Print table
    fmt = "{:<12} {:<25} {:>10} {:>10} {:>10} {:>10} {:>10} {:>12}"
    print(fmt.format("Customer", "Name", "Current", "30", "60", "90", "120+", "Total"))
    print("-" * 110)
    for c in report["customers"]:
        print(fmt.format(
            c["custname"],
            c["cdes"][:25],
            f'{c["current"]:,.0f}',
            f'{c["30"]:,.0f}',
            f'{c["60"]:,.0f}',
            f'{c["90"]:,.0f}',
            f'{c["120plus"]:,.0f}',
            f'{c["total"]:,.0f}',
        ))
    print("-" * 110)
    t = report["totals"]
    print(fmt.format(
        "", "TOTAL",
        f'{t["current"]:,.0f}',
        f'{t["30"]:,.0f}',
        f'{t["60"]:,.0f}',
        f'{t["90"]:,.0f}',
        f'{t["120plus"]:,.0f}',
        f'{t["total"]:,.0f}',
    ))

    # Save output
    output_dir = Path(__file__).resolve().parent.parent.parent.parent / "output"
    output_dir.mkdir(exist_ok=True)
    output_file = output_dir / "AR1000-debt-customer-report.txt"

    with open(output_file, "w", encoding="utf-8") as f:
        f.write(f"AR1000 — Ariel Debt Customer Report\n")
        f.write(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Source: {PRIORITY_URL}\n")
        f.write(f"Branch: {ARIEL_BRANCH} | Section: {ARIEL_ACNGCODE}\n")
        f.write(f"Ariel customers: {len(ariel_customers)}\n")
        f.write(f"Customers with balance: {report['filtered_customer_count']}\n")
        f.write("\n")
        f.write(fmt.format("Customer", "Name", "Current", "30", "60", "90", "120+", "Total") + "\n")
        f.write("-" * 110 + "\n")
        for c in report["customers"]:
            f.write(fmt.format(
                c["custname"],
                c["cdes"][:25],
                f'{c["current"]:,.0f}',
                f'{c["30"]:,.0f}',
                f'{c["60"]:,.0f}',
                f'{c["90"]:,.0f}',
                f'{c["120plus"]:,.0f}',
                f'{c["total"]:,.0f}',
            ) + "\n")
        f.write("-" * 110 + "\n")
        f.write(fmt.format(
            "", "TOTAL",
            f'{t["current"]:,.0f}',
            f'{t["30"]:,.0f}',
            f'{t["60"]:,.0f}',
            f'{t["90"]:,.0f}',
            f'{t["120plus"]:,.0f}',
            f'{t["total"]:,.0f}',
        ) + "\n")

    print()
    print(f"Saved to: {output_file}")


if __name__ == "__main__":
    main()
