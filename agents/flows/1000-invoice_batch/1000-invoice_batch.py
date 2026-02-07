"""
1000-Invoice Batch Flow
Reads invoices from input JSON file and creates each one in Priority
by calling agent 200's create_invoice function.
"""

import sys
import os
import io
import json
import importlib.util
from pathlib import Path
from datetime import datetime

# Project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent

# Load agent 200 module (uses importlib because folder name has hyphens)
# Agent 200's module-level code handles the stdout UTF-8 fix
agent_200_path = PROJECT_ROOT / "agents" / "200-invoices" / "200-invoice_writer.py"
spec = importlib.util.spec_from_file_location("invoice_writer", agent_200_path)
invoice_writer = importlib.util.module_from_spec(spec)
sys.modules["invoice_writer"] = invoice_writer
spec.loader.exec_module(invoice_writer)

# Input / Output paths
INPUT_FILE = PROJECT_ROOT / "input" / "1000-invoice_batch.json"
OUTPUT_DIR = PROJECT_ROOT / "output"


def load_invoices():
    """Load invoice data from input JSON file."""
    if not INPUT_FILE.exists():
        print(f"Error: Input file not found: {INPUT_FILE}")
        sys.exit(1)

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        invoices = json.load(f)

    if not isinstance(invoices, list):
        print("Error: Input file must contain a JSON array of invoices.")
        sys.exit(1)

    return invoices


def main():
    print("=" * 60)
    print("  1000-Invoice Batch Flow - Priority Cloud")
    print("=" * 60)
    print()

    invoice_writer.validate_config()

    print(f"Connecting to: {invoice_writer.PRIORITY_URL}")
    print(f"User: {invoice_writer.PRIORITY_USERNAME}")
    print()

    invoices = load_invoices()
    print(f"Loaded {len(invoices)} invoices from: {INPUT_FILE}")
    print()

    results = []

    for i, inv in enumerate(invoices, 1):
        customer = inv.get("CUSTNAME", "")
        date = inv.get("IVDATE", datetime.now().strftime("%Y-%m-%d"))
        branch = inv.get("BRANCHNAME", "000")
        items = inv.get("items", [])

        print(f"--- Invoice {i}/{len(invoices)} ---")
        print(f"Customer: {customer}, Date: {date}, Branch: {branch}")
        print(f"Items: {len(items)}")

        try:
            result = invoice_writer.create_invoice(customer, date, branch, items)
            ivnum = result.get("IVNUM", "N/A")
            totprice = result.get("TOTPRICE", 0)
            print(f"OK - Invoice {ivnum} created, Total: {totprice}")
            results.append({
                "index": i,
                "customer": customer,
                "status": "OK",
                "ivnum": ivnum,
                "totprice": totprice,
            })
        except Exception as e:
            error_msg = str(e)
            print(f"FAILED - {error_msg}")
            results.append({
                "index": i,
                "customer": customer,
                "status": "FAILED",
                "error": error_msg,
            })

        print()

    # Summary
    success = sum(1 for r in results if r["status"] == "OK")
    failed = sum(1 for r in results if r["status"] == "FAILED")

    print("=" * 60)
    print(f"  Batch Complete: {success} OK, {failed} Failed, {len(results)} Total")
    print("=" * 60)

    # Save output
    OUTPUT_DIR.mkdir(exist_ok=True)
    output_file = OUTPUT_DIR / "1000-invoice_batch.txt"

    with open(output_file, "w", encoding="utf-8") as f:
        f.write("1000-Invoice Batch Flow - Priority Cloud\n")
        f.write(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Source: {invoice_writer.PRIORITY_URL}\n")
        f.write(f"Input: {INPUT_FILE}\n")
        f.write("\n")
        f.write(f"Results: {success} OK, {failed} Failed, {len(results)} Total\n")
        f.write("-" * 50 + "\n")

        for r in results:
            if r["status"] == "OK":
                f.write(f"  [{r['index']}] Customer: {r['customer']} -> "
                        f"Invoice: {r['ivnum']}, Total: {r['totprice']}\n")
            else:
                f.write(f"  [{r['index']}] Customer: {r['customer']} -> "
                        f"FAILED: {r['error']}\n")

        f.write("-" * 50 + "\n")

    print()
    print(f"Saved to: {output_file}")


if __name__ == "__main__":
    main()
