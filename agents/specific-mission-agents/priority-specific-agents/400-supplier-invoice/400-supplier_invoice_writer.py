"""
400-Supplier Invoice Writer Agent
Connects to Priority Cloud OData API and creates a supplier invoice (חשבונית ספק).
"""

import sys
import os
import io
import json
import base64
import mimetypes
from pathlib import Path
from datetime import datetime

# Fix Windows console encoding for Hebrew (only when running directly)
if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import requests
from requests.auth import HTTPBasicAuth
if os.environ.get("IS_LAMBDA") != "true":
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent.parent.parent.parent / ".env"
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


def create_supplier_invoice(supplier, date, branch, items, booknum, details=None):
    """Create a supplier invoice in Priority via OData API.

    Args:
        supplier: Supplier number in Priority (SUPNAME)
        date: Invoice date (YYYY-MM-DD)
        branch: Branch name
        items: List of line items [{PARTNAME, TQUANT, PRICE}, ...]
        booknum: Supplier's invoice reference number (BOOKNUM, required)
        details: Optional invoice description

    Returns:
        dict with API response
    """
    url = f"{PRIORITY_URL}/YINVOICES"
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "OData-Version": "4.0",
    }
    auth = HTTPBasicAuth(PRIORITY_USERNAME, PRIORITY_PASSWORD)

    body = {
        "SUPNAME": supplier,
        "IVDATE": date,
        "BRANCHNAME": branch,
        "BOOKNUM": booknum,
        "YINVOICEITEMS_SUBFORM": items,
    }

    if details:
        body["DETAILS"] = details

    print("Sending supplier invoice data:")
    print(json.dumps(body, indent=2, ensure_ascii=False))
    print()

    response = requests.post(url, json=body, headers=headers, auth=auth)
    response.raise_for_status()

    return response.json()


def attach_file_to_invoice(ivnum, file_path, description=None):
    """Attach a file to an existing supplier invoice in Priority.

    Args:
        ivnum: The invoice number (e.g. 'T98')
        file_path: Path to the file to attach
        description: Optional description (defaults to filename)

    Returns:
        dict with API response
    """
    file_path = Path(file_path)
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    mime_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    suffix = file_path.suffix

    with open(file_path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode()

    url = f"{PRIORITY_URL}/YINVOICES(IVNUM='{ivnum}',IVTYPE='Y',DEBIT='D')/EXTFILES_SUBFORM"
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "OData-Version": "4.0",
    }
    auth = HTTPBasicAuth(PRIORITY_USERNAME, PRIORITY_PASSWORD)

    body = {
        "EXTFILEDES": description or file_path.name,
        "EXTFILENAME": f"data:{mime_type};base64,{encoded}",
        "SUFFIX": suffix,
    }

    print(f"Attaching {file_path.name} ({mime_type}, {len(encoded)} bytes base64) to {ivnum}...")

    response = requests.post(url, json=body, headers=headers, auth=auth)
    response.raise_for_status()

    print(f"File attached successfully to invoice {ivnum}")
    return response.json()


def main():
    print("=" * 60)
    print("  400-Supplier Invoice Writer - Priority Cloud")
    print("=" * 60)
    print()

    validate_config()

    # Safety check: ensure we're on demo
    if "ebyael" in PRIORITY_URL:
        print("ERROR: This script is pointing to PRODUCTION (ebyael)!")
        print("Switch to demo in .env before running.")
        sys.exit(1)

    print(f"Connecting to: {PRIORITY_URL}")
    print(f"User: {PRIORITY_USERNAME}")
    print()

    # Test data - supplier invoice
    supplier = "102"
    date = datetime.now().strftime("%Y-%m-%d")
    branch = "000"
    booknum = f"TEST-{datetime.now().strftime('%H%M%S')}"
    items = [
        {
            "PARTNAME": "011",
            "TQUANT": 1,
            "PRICE": 100,
        }
    ]

    try:
        result = create_supplier_invoice(supplier, date, branch, items, booknum)
    except requests.exceptions.HTTPError as e:
        print(f"Error: HTTP {e.response.status_code}")
        print(f"Response: {e.response.text}")
        sys.exit(1)
    except requests.exceptions.ConnectionError:
        print("Error: Could not connect to Priority server. Check your URL and network.")
        sys.exit(1)

    print("Supplier invoice created successfully!")
    print()
    print("Response:")
    print(json.dumps(result, indent=2, ensure_ascii=False))

    # Save to output file
    output_dir = Path(__file__).resolve().parent.parent.parent.parent.parent / "output"
    output_dir.mkdir(exist_ok=True)

    output_file = output_dir / "400-supplier_invoice_write.txt"

    with open(output_file, "w", encoding="utf-8") as f:
        f.write("400-Supplier Invoice Writer - Priority Cloud\n")
        f.write(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Source: {PRIORITY_URL}\n")
        f.write("\n")
        f.write(f"Supplier: {supplier}\n")
        f.write(f"Invoice Date: {date}\n")
        f.write(f"Booknum: {booknum}\n")
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
