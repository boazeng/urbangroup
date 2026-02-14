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


def generate_report():
    """Fetch uncharged delivery notes for branch 102."""
    headers = {"Accept": "application/json", "OData-Version": "4.0"}
    auth = HTTPBasicAuth(PRIORITY_USERNAME, PRIORITY_PASSWORD)

    url = (
        f"{PRIORITY_URL}/DOCUMENTS_D"
        f"?$filter=BRANCHNAME eq '{ARIEL_BRANCH}' and IVALL eq 'N'"
        f"&$select=DOCNO,CUSTNAME,CDES,CURDATE,TOTPRICE,STATDES"
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

    documents = []
    for doc in all_docs:
        documents.append({
            "docno": doc.get("DOCNO", ""),
            "custname": doc.get("CUSTNAME", ""),
            "cdes": doc.get("CDES", ""),
            "curdate": (doc.get("CURDATE", "") or "")[:10],
            "totprice": float(doc.get("TOTPRICE", 0) or 0),
            "statdes": doc.get("STATDES", ""),
        })

    total_amount = sum(d["totprice"] for d in documents)

    return {
        "documents": documents,
        "total_amount": total_amount,
        "document_count": len(documents),
        "generated_at": datetime.now(timezone.utc).isoformat(),
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
