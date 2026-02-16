"""
1010-Supplier Invoices Batch Agent
Reads supplier invoice data from an Excel template and creates draft invoices
in Priority ERP using agent 400 (supplier invoice writer).

Excel template columns (row 2 = headers, data from row 3):
  B=מס, C=שם קובץ, D=עמוד, E=מספר ספק, F=תאריך, G=מספר חשבונית,
  H=סניף, I=פרטים, J=מספר הקצאה, K=מקט, L=תאור המוצר, M=חשבון,
  N=סכום לפני מעמ, O=סכום כולל מע"מ
"""

import sys
import os
import io
import json
from pathlib import Path
from datetime import datetime

if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import openpyxl
import fitz  # PyMuPDF - for extracting PDF pages

if os.environ.get("IS_LAMBDA") != "true":
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent.parent.parent.parent / ".env"
    load_dotenv(env_path)

# Use demo URL — set PRIORITY_URL in env BEFORE importing agent 400
PRIORITY_URL = os.getenv("PRIORITY_URL_DEMO", os.getenv("PRIORITY_URL", "")).rstrip("/")
os.environ["PRIORITY_URL"] = PRIORITY_URL

# Import agent 400 (filename has hyphen, use importlib)
import importlib.util
agent_400_file = Path(__file__).resolve().parent.parent.parent.parent / \
    "specific-mission-agents" / "priority-specific-agents" / "400-supplier-invoice" / \
    "400-supplier_invoice_writer.py"
spec = importlib.util.spec_from_file_location("agent_400", str(agent_400_file))
agent_400 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent_400)
create_supplier_invoice = agent_400.create_supplier_invoice
attach_file_to_invoice = agent_400.attach_file_to_invoice


def read_excel(file_path):
    """Read supplier invoices from Excel template.

    Returns list of dicts with invoice data.
    """
    wb = openpyxl.load_workbook(file_path, data_only=True)
    ws = wb.active

    invoices = []
    for row in ws.iter_rows(min_row=3, values_only=False):
        cells = [cell.value for cell in row]
        # Column B (index 1) = row number - skip empty rows
        if not cells[1] and not cells[6]:
            continue

        # Parse date
        date_val = cells[5]  # Column F
        if isinstance(date_val, datetime):
            date_str = date_val.strftime("%Y-%m-%d")
        elif date_val:
            # Try to parse DD/MM/YYYY
            s = str(date_val)
            if "/" in s:
                parts = s.split("/")
                if len(parts) == 3:
                    date_str = f"{parts[2]}-{parts[1]}-{parts[0]}"
                else:
                    date_str = s
            else:
                date_str = s
        else:
            date_str = datetime.now().strftime("%Y-%m-%d")

        # Amount before VAT (column N, index 13)
        amount_no_vat = cells[13]
        if amount_no_vat is None:
            # Try to calculate from column O (with VAT)
            amount_with_vat = cells[14]
            if amount_with_vat:
                amount_no_vat = round(float(amount_with_vat) / 1.18, 2)
            else:
                amount_no_vat = 0

        invoices.append({
            "num": cells[1],                    # B - row number
            "supplier": str(cells[4] or ""),     # E - supplier number
            "date": date_str,                    # F - date
            "invoice_num": str(cells[6] or ""),  # G - invoice number → BOOKNUM
            "branch": str(cells[7] or ""),       # H - branch
            "details": str(cells[8] or ""),      # I - details
            "allocation": str(cells[9] or ""),   # J - allocation number
            "sku": str(cells[10] or ""),          # K - SKU → PARTNAME
            "description": str(cells[11] or ""), # L - description
            "account": str(cells[12] or ""),     # M - expense account → ACCNAME
            "amount_no_vat": float(amount_no_vat or 0),  # N - amount before VAT
        })

    wb.close()
    return invoices


def create_draft_invoice(invoice_data):
    """Create a single draft invoice in Priority using agent 400.

    Args:
        invoice_data: dict from read_excel()

    Returns:
        API response dict
    """
    sku = invoice_data["sku"]
    branch = invoice_data["branch"]
    supplier = invoice_data["supplier"]
    account = invoice_data.get("account", "")

    # In demo, override branch and SKU (don't exist in demo environment)
    if "demo" in PRIORITY_URL:
        branch = "000"
        sku = "011"         # Demo part number

    item = {
        "PARTNAME": sku,
        "TQUANT": 1,
        "PRICE": invoice_data["amount_no_vat"],
    }
    if account:
        item["ACCNAME"] = account

    items = [item]

    result = create_supplier_invoice(
        supplier=supplier,
        date=invoice_data["date"],
        branch=branch,
        items=items,
        booknum=invoice_data["invoice_num"] + "-" + datetime.now().strftime("%H%M%S"),
        details=invoice_data["details"] or None,
    )

    return result


def extract_pdf_page(pdf_path, page_num, output_path):
    """Extract a single page from a PDF file.

    Args:
        pdf_path: Path to source PDF
        page_num: 0-based page index
        output_path: Where to save the single-page PDF
    """
    doc = fitz.open(str(pdf_path))
    out = fitz.open()
    out.insert_pdf(doc, from_page=page_num, to_page=page_num)
    out.save(str(output_path))
    out.close()
    doc.close()


def main():
    print("=" * 60)
    print("  1010-Supplier Invoices Batch - Priority Cloud")
    print("=" * 60)
    print()

    # Safety check: demo only
    if "ebyael" in PRIORITY_URL:
        print("ERROR: This script is pointing to PRODUCTION (ebyael)!")
        print("Switch to demo in .env before running.")
        sys.exit(1)

    print(f"Priority URL: {PRIORITY_URL}")
    print()

    # Read Excel file
    excel_path = Path(__file__).resolve().parent.parent.parent.parent.parent / \
        "input" / "חשבוניות ספק" / "bavli 21.25" / "5555555" / "חשבוניות ספק - טמפלט.xlsx"

    if not excel_path.exists():
        print(f"ERROR: Excel file not found: {excel_path}")
        sys.exit(1)

    print(f"Reading: {excel_path.name}")
    invoices = read_excel(excel_path)
    print(f"Found {len(invoices)} invoice rows")
    print()

    # Create ONE example invoice (first row)
    if not invoices:
        print("No invoices found in file.")
        sys.exit(1)

    # PDF file for attachments
    pdf_path = excel_path.parent / "5555555.pdf"
    if not pdf_path.exists():
        print(f"WARNING: PDF file not found: {pdf_path}")
        pdf_path = None

    inv = invoices[0]
    print(f"Creating draft invoice for row #{inv['num']}:")
    print(f"  Supplier: {inv['supplier']}")
    print(f"  Date: {inv['date']}")
    print(f"  Invoice#: {inv['invoice_num']} (BOOKNUM)")
    print(f"  Branch: {inv['branch']}")
    print(f"  Details: {inv['details']}")
    print(f"  Account: {inv['account']} (ACCNAME)")
    print(f"  SKU: {inv['sku']} (PARTNAME)")
    print(f"  Amount (no VAT): {inv['amount_no_vat']}")
    print()

    try:
        result = create_draft_invoice(inv)
    except Exception as e:
        print(f"ERROR creating invoice: {e}")
        if hasattr(e, "response") and e.response is not None:
            print(f"Response: {e.response.text}")
        sys.exit(1)

    ivnum = result.get("IVNUM")
    print()
    print(f"Draft invoice created successfully! IVNUM={ivnum}")

    # Attach first PDF page
    if pdf_path and ivnum:
        page_num = int(inv.get("num", 1)) - 1  # Row number = page number (1-based)
        print(f"\nExtracting page {page_num + 1} from PDF...")
        import tempfile
        tmp_pdf = Path(tempfile.gettempdir()) / f"invoice_page_{page_num + 1}.pdf"
        try:
            extract_pdf_page(pdf_path, page_num, tmp_pdf)
            print(f"Attaching page to invoice {ivnum}...")
            attach_file_to_invoice(ivnum, tmp_pdf, f"חשבונית עמוד {page_num + 1}")
            print("Attachment added successfully!")
        except Exception as e:
            print(f"ERROR attaching PDF: {e}")
        finally:
            if tmp_pdf.exists():
                tmp_pdf.unlink()

    print()
    print("Response:")
    print(json.dumps(result, indent=2, ensure_ascii=False))

    # Save output
    output_dir = Path(__file__).resolve().parent.parent.parent.parent.parent / "output"
    output_dir.mkdir(exist_ok=True)
    output_file = output_dir / "1010-supplier_invoices_batch.txt"

    with open(output_file, "w", encoding="utf-8") as f:
        f.write("1010-Supplier Invoices Batch\n")
        f.write(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Source: {PRIORITY_URL}\n")
        f.write(f"Excel: {excel_path.name}\n")
        f.write(f"Total rows: {len(invoices)}\n")
        f.write(f"Created: 1 (example)\n\n")
        f.write(f"Invoice data:\n")
        f.write(json.dumps(inv, indent=2, ensure_ascii=False))
        f.write(f"\n\nAPI Response:\n")
        f.write(json.dumps(result, indent=2, ensure_ascii=False))
        f.write("\n")

    print(f"\nSaved to: {output_file}")


if __name__ == "__main__":
    main()
