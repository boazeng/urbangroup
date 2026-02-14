"""
AR10010 — Uncharged Delivery Notes Report (תעודות משלוח שלא חויבו)

Fetches delivery notes (DOCUMENTS_D) for branch 102 where IVALL = 'N'
(not fully invoiced).
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

logger = logging.getLogger("urbangroup.ar10010")

PRIORITY_URL = os.getenv("PRIORITY_URL_DEMO", os.getenv("PRIORITY_URL", "")).rstrip("/")
PRIORITY_USERNAME = os.getenv("PRIORITY_USERNAME", "")
PRIORITY_PASSWORD = os.getenv("PRIORITY_PASSWORD", "")

ARIEL_BRANCH = "102"


def generate_report(filters=None):
    """Fetch uncharged delivery notes for branch 102.

    Args:
        filters: Optional dict with keys: customer_name, min_amount, date_from, date_to
    """
    filters = filters or {}
    headers = {"Accept": "application/json", "OData-Version": "4.0"}
    auth = HTTPBasicAuth(PRIORITY_USERNAME, PRIORITY_PASSWORD)

    odata_filter = f"BRANCHNAME eq '{ARIEL_BRANCH}' and IVALL eq 'N'"

    date_from = filters.get("date_from")
    date_to = filters.get("date_to")
    if date_from:
        odata_filter += f" and CURDATE ge {date_from}T00:00:00Z"
    if date_to:
        odata_filter += f" and CURDATE le {date_to}T23:59:59Z"

    url = (
        f"{PRIORITY_URL}/DOCUMENTS_D"
        f"?$filter={odata_filter}"
        f"&$select=DOCNO,CUSTNAME,CDES,CURDATE,TOTPRICE,STATDES,CODEDES,DETAILS"
        f"&$orderby=CURDATE desc"
    )

    all_docs = []
    while url:
        resp = requests.get(url, headers=headers, auth=auth)
        resp.raise_for_status()
        data = resp.json()
        all_docs.extend(data.get("value", []))
        url = data.get("@odata.nextLink")

    logger.info(f"Fetched {len(all_docs)} uncharged deliveries for branch {ARIEL_BRANCH}")

    min_amount = float(filters.get("min_amount") or 0)
    customer_filter = (filters.get("customer_name") or "").strip().lower()

    documents = []
    for doc in all_docs:
        totprice = float(doc.get("TOTPRICE", 0) or 0)
        if min_amount and totprice < min_amount:
            continue
        if customer_filter:
            cdes = (doc.get("CDES", "") or "").lower()
            custname = (doc.get("CUSTNAME", "") or "").lower()
            if customer_filter not in cdes and customer_filter not in custname:
                continue
        documents.append({
            "docno": doc.get("DOCNO", ""),
            "custname": doc.get("CUSTNAME", ""),
            "cdes": doc.get("CDES", ""),
            "curdate": (doc.get("CURDATE", "") or "")[:10],
            "totprice": totprice,
            "statdes": doc.get("STATDES", ""),
            "codedes": doc.get("CODEDES", "") or "",
            "details": doc.get("DETAILS", "") or "",
        })

    total_amount = sum(d["totprice"] for d in documents)

    return {
        "documents": documents,
        "total_amount": total_amount,
        "document_count": len(documents),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "filters_applied": {k: v for k, v in filters.items() if v},
    }


def main():
    print("=" * 70)
    print("  AR10010 — Uncharged Delivery Notes (תעודות משלוח שלא חויבו)")
    print(f"  Branch: {ARIEL_BRANCH}")
    print("=" * 70)
    print()

    if not PRIORITY_URL or not PRIORITY_USERNAME:
        print("Error: Missing PRIORITY_URL or PRIORITY_USERNAME in .env")
        sys.exit(1)

    print(f"Connecting to: {PRIORITY_URL}")
    print()

    report = generate_report()
    print(f"Uncharged deliveries: {report['document_count']}")
    print(f"Total amount: {report['total_amount']:,.0f}")
    print()

    fmt = "{:<16} {:<12} {:<30} {:<12} {:>12} {:<10}"
    print(fmt.format("Doc No", "Customer", "Name", "Date", "Amount", "Status"))
    print("-" * 95)
    for d in report["documents"]:
        print(fmt.format(
            d["docno"],
            d["custname"],
            d["cdes"][:30],
            d["curdate"],
            f'{d["totprice"]:,.0f}',
            d["statdes"],
        ))
    print("-" * 95)
    print(fmt.format("", "", "TOTAL", "", f'{report["total_amount"]:,.0f}', ""))


if __name__ == "__main__":
    main()
