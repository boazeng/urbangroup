"""
Aging Report (דוח גיול חובות) — Consolidated Invoices (חשבוניות מרכזות)
Fetches finalized CINVOICES from Priority and groups outstanding balances by age bucket.
"""

import sys
import os
import io
import json
import logging
from pathlib import Path
from datetime import datetime, timezone

if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import requests
from requests.auth import HTTPBasicAuth

if os.environ.get("IS_LAMBDA") != "true":
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent.parent.parent.parent / ".env"
    load_dotenv(env_path)

logger = logging.getLogger("urbangroup.aging_report")

PRIORITY_URL = os.getenv("PRIORITY_URL", "").rstrip("/")
PRIORITY_USERNAME = os.getenv("PRIORITY_USERNAME", "")
PRIORITY_PASSWORD = os.getenv("PRIORITY_PASSWORD", "")

AGE_BUCKETS = [
    ("current", 0, 30),
    ("30", 31, 60),
    ("60", 61, 90),
    ("90", 91, 120),
    ("120plus", 121, 999999),
]


def fetch_aging_report(branch=None):
    """Fetch consolidated invoices from Priority and compute aging buckets.

    Args:
        branch: optional branch code to filter by (e.g. "108", "026")

    Returns:
        dict with:
            customers: list of per-customer aging rows
            totals: overall totals per bucket
            generated_at: ISO timestamp
    """
    headers = {
        "Accept": "application/json",
        "OData-Version": "4.0",
    }
    auth = HTTPBasicAuth(PRIORITY_USERNAME, PRIORITY_PASSWORD)

    # Fetch all finalized consolidated invoices
    select = "CUSTNAME,CDES,IVNUM,IVDATE,TOTPRICE,CASHPAYMENT,DEBIT,BRANCHNAME"
    odata_filter = "FINAL eq 'Y'"
    if branch:
        odata_filter += f" and BRANCHNAME eq '{branch}'"
    url = f"{PRIORITY_URL}/CINVOICES?$filter={odata_filter}&$select={select}"

    all_invoices = []
    while url:
        resp = requests.get(url, headers=headers, auth=auth)
        resp.raise_for_status()
        data = resp.json()
        all_invoices.extend(data.get("value", []))
        url = data.get("@odata.nextLink")

    logger.info(f"Fetched {len(all_invoices)} finalized consolidated invoices")

    now = datetime.now(timezone.utc)
    customers = {}

    for inv in all_invoices:
        custname = inv.get("CUSTNAME", "")
        cdes = inv.get("CDES", "")
        totprice = float(inv.get("TOTPRICE", 0) or 0)
        cashpayment = float(inv.get("CASHPAYMENT", 0) or 0)
        balance = totprice - cashpayment

        if balance <= 0:
            continue

        # Parse invoice date
        ivdate_str = inv.get("IVDATE", "")
        if not ivdate_str:
            continue
        try:
            ivdate = datetime.fromisoformat(ivdate_str.replace("Z", "+00:00"))
        except ValueError:
            continue

        age_days = (now - ivdate).days

        # Determine bucket
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

    # Sort by total descending
    customer_list = sorted(customers.values(), key=lambda c: c["total"], reverse=True)

    # Calculate totals
    totals = {"current": 0, "30": 0, "60": 0, "90": 0, "120plus": 0, "total": 0}
    for c in customer_list:
        for bucket_key in totals:
            totals[bucket_key] += c[bucket_key]

    return {
        "customers": customer_list,
        "totals": totals,
        "invoice_count": len(all_invoices),
        "generated_at": now.isoformat(),
    }


def main():
    print("=" * 60)
    print("  Aging Report - Consolidated Invoices")
    print("=" * 60)
    print()

    if not PRIORITY_URL or not PRIORITY_USERNAME:
        print("Error: Missing PRIORITY_URL or PRIORITY_USERNAME in .env")
        sys.exit(1)

    print(f"Connecting to: {PRIORITY_URL}")
    print()

    result = fetch_aging_report()

    print(f"Total invoices: {result['invoice_count']}")
    print(f"Customers with balance: {len(result['customers'])}")
    print()

    fmt = "{:<12} {:<20} {:>10} {:>10} {:>10} {:>10} {:>10} {:>12}"
    print(fmt.format("Customer", "Name", "Current", "30", "60", "90", "120+", "Total"))
    print("-" * 100)
    for c in result["customers"]:
        print(fmt.format(
            c["custname"],
            c["cdes"][:20],
            f'{c["current"]:,.0f}',
            f'{c["30"]:,.0f}',
            f'{c["60"]:,.0f}',
            f'{c["90"]:,.0f}',
            f'{c["120plus"]:,.0f}',
            f'{c["total"]:,.0f}',
        ))
    print("-" * 100)
    t = result["totals"]
    print(fmt.format(
        "", "TOTAL",
        f'{t["current"]:,.0f}',
        f'{t["30"]:,.0f}',
        f'{t["60"]:,.0f}',
        f'{t["90"]:,.0f}',
        f'{t["120plus"]:,.0f}',
        f'{t["total"]:,.0f}',
    ))


if __name__ == "__main__":
    main()
