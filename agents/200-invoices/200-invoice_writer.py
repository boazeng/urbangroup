"""
200-Invoice Writer Agent
Connects to Priority Cloud OData API and creates a tax invoice (חשבונית מס).
"""

import sys
import os
import io
import json
from pathlib import Path
from datetime import datetime

# Fix Windows console encoding for Hebrew (only when running directly)
if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import requests
from requests.auth import HTTPBasicAuth
if os.environ.get("IS_LAMBDA") != "true":
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    load_dotenv(env_path)

PRIORITY_URL = os.getenv("PRIORITY_URL", "").rstrip("/")
PRIORITY_USERNAME = os.getenv("PRIORITY_USERNAME", "")
PRIORITY_PASSWORD = os.getenv("PRIORITY_PASSWORD", "")


def validate_config():
    missing = []
    if not PRIORITY_URL:
        missing.append("PRIORITY_URL")
    if not PRIORITY_USERNAME:
        missing.append("PRIORITY_USERNAME")
    if not PRIORITY_PASSWORD:
        missing.append("PRIORITY_PASSWORD")

    if missing:
        print(f"Error: Missing environment variables: {', '.join(missing)}")
        print(f"Please fill in the .env file at: {env_path}")
        sys.exit(1)


def create_invoice(customer, date, branch, items, details=None):
    """Create a tax invoice in Priority via OData API."""
    url = f"{PRIORITY_URL}/AINVOICES"
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "OData-Version": "4.0",
    }
    auth = HTTPBasicAuth(PRIORITY_USERNAME, PRIORITY_PASSWORD)

    body = {
        "CUSTNAME": customer,
        "IVDATE": date,
        "BRANCHNAME": branch,
        "AINVOICEITEMS_SUBFORM": items,
    }

    if details:
        body["DETAILS"] = details

    print("Sending invoice data:")
    print(json.dumps(body, indent=2, ensure_ascii=False))
    print()

    response = requests.post(url, json=body, headers=headers, auth=auth)
    response.raise_for_status()

    return response.json()


def main():
    print("=" * 60)
    print("  200-Invoice Writer - Priority Cloud")
    print("=" * 60)
    print()

    validate_config()

    print(f"Connecting to: {PRIORITY_URL}")
    print(f"User: {PRIORITY_USERNAME}")
    print()

    # Invoice data
    customer = "1003"
    date = datetime.now().strftime("%Y-%m-%d")
    branch = "000"
    items = [
        {
            "PARTNAME": "011",
            "TQUANT": 10,
            "PRICE": 170,
        }
    ]

    try:
        result = create_invoice(customer, date, branch, items)
    except requests.exceptions.HTTPError as e:
        print(f"Error: HTTP {e.response.status_code}")
        print(f"Response: {e.response.text}")
        sys.exit(1)
    except requests.exceptions.ConnectionError:
        print("Error: Could not connect to Priority server. Check your URL and network.")
        sys.exit(1)

    print("Invoice created successfully!")
    print()
    print("Response:")
    print(json.dumps(result, indent=2, ensure_ascii=False))

    # Save to output file
    output_dir = Path(__file__).resolve().parent.parent / "output"
    output_dir.mkdir(exist_ok=True)

    output_file = output_dir / "200-invoice_write.txt"

    with open(output_file, "w", encoding="utf-8") as f:
        f.write("200-Invoice Writer - Priority Cloud\n")
        f.write(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Source: {PRIORITY_URL}\n")
        f.write("\n")
        f.write(f"Customer: {customer}\n")
        f.write(f"Invoice Date: {date}\n")
        f.write(f"Branch: {branch}\n")
        f.write(f"Items:\n")
        for item in items:
            f.write(f"  Part: {item['PARTNAME']}, "
                    f"Qty: {item['TQUANT']}, "
                    f"Price: {item['PRICE']}\n")
        f.write("\n")
        f.write("API Response:\n")
        f.write(json.dumps(result, indent=2, ensure_ascii=False))
        f.write("\n")

    print()
    print(f"Saved to: {output_file}")


if __name__ == "__main__":
    main()
