"""
AR10020 — Ariel Consolidated Invoices Report (חשבוניות מרכזות)

Fetches consolidated invoices (CINVOICES) for branch 102,
grouped by customer, for the last month by default.
"""

import sys
import os
import io
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta

if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import requests
from requests.auth import HTTPBasicAuth

if os.environ.get("IS_LAMBDA") != "true":
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
    load_dotenv(env_path)

logger = logging.getLogger("urbangroup.ar10020")

PRIORITY_URL = os.getenv("PRIORITY_URL_DEMO", os.getenv("PRIORITY_URL", "")).rstrip("/")
PRIORITY_USERNAME = os.getenv("PRIORITY_USERNAME", "")
PRIORITY_PASSWORD = os.getenv("PRIORITY_PASSWORD", "")

ARIEL_BRANCH = "102"


def generate_report(days_back=30):
    """Fetch consolidated invoices for branch 102.

    Args:
        days_back: Number of days to look back (default 30)

    Returns:
        dict with customers (grouped), totals, metadata
    """
    headers = {"Accept": "application/json", "OData-Version": "4.0"}
    auth = HTTPBasicAuth(PRIORITY_USERNAME, PRIORITY_PASSWORD)

    date_from = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%dT00:00:00Z")

    odata_filter = f"BRANCHNAME eq '{ARIEL_BRANCH}' and IVDATE ge {date_from} and FINAL eq 'Y'"

    url = (
        f"{PRIORITY_URL}/CINVOICES"
        f"?$filter={odata_filter}"
        f"&$select=IVNUM,CUSTNAME,CDES,IVDATE,TOTPRICE,QPRICE,VAT,STATDES,CODEDES,DETAILS,DOCNO"
        f"&$orderby=CUSTNAME,IVDATE desc"
    )

    all_invoices = []
    while url:
        resp = requests.get(url, headers=headers, auth=auth)
        resp.raise_for_status()
        data = resp.json()
        all_invoices.extend(data.get("value", []))
        url = data.get("@odata.nextLink")

    logger.info(f"Fetched {len(all_invoices)} invoices for branch {ARIEL_BRANCH}")

    # Group by customer
    customers_map = {}
    for inv in all_invoices:
        cust = inv.get("CUSTNAME", "")
        if cust not in customers_map:
            customers_map[cust] = {
                "custname": cust,
                "cdes": inv.get("CDES", ""),
                "invoices": [],
                "total": 0,
                "total_before_vat": 0,
                "total_vat": 0,
            }
        totprice = float(inv.get("TOTPRICE", 0) or 0)
        qprice = float(inv.get("QPRICE", 0) or 0)
        vat = float(inv.get("VAT", 0) or 0)
        customers_map[cust]["invoices"].append({
            "ivnum": inv.get("IVNUM", ""),
            "ivdate": (inv.get("IVDATE", "") or "")[:10],
            "totprice": totprice,
            "qprice": qprice,
            "vat": vat,
            "statdes": inv.get("STATDES", ""),
            "codedes": inv.get("CODEDES", "") or "",
            "details": inv.get("DETAILS", "") or "",
            "docno": inv.get("DOCNO", "") or "",
        })
        customers_map[cust]["total"] += totprice
        customers_map[cust]["total_before_vat"] += qprice
        customers_map[cust]["total_vat"] += vat

    # Sort customers by total descending
    customers = sorted(customers_map.values(), key=lambda c: c["total"], reverse=True)

    total_amount = sum(c["total"] for c in customers)
    total_invoices = sum(len(c["invoices"]) for c in customers)

    return {
        "customers": customers,
        "total_amount": total_amount,
        "total_invoices": total_invoices,
        "customer_count": len(customers),
        "days_back": days_back,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def main():
    print("=" * 70)
    print("  AR10020 — Consolidated Invoices (חשבוניות מרכזות)")
    print(f"  Branch: {ARIEL_BRANCH}")
    print("=" * 70)
    print()

    if not PRIORITY_URL or not PRIORITY_USERNAME:
        print("Error: Missing PRIORITY_URL or PRIORITY_USERNAME in .env")
        sys.exit(1)

    print(f"Connecting to: {PRIORITY_URL}")
    print()

    report = generate_report()
    print(f"Invoices: {report['total_invoices']}")
    print(f"Customers: {report['customer_count']}")
    print(f"Total: {report['total_amount']:,.0f}")
    print()

    for c in report["customers"]:
        print(f"\n{c['custname']} - {c['cdes']} ({len(c['invoices'])} invoices, total {c['total']:,.0f})")
        for inv in c["invoices"]:
            print(f"  {inv['ivnum']} | {inv['ivdate']} | {inv['totprice']:,.0f} | {inv['codedes']} | {inv['details']}")


if __name__ == "__main__":
    main()
