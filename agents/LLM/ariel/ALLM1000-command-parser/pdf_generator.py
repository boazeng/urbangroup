"""
PDF Generator for Ariel reports.
Generates Hebrew RTL PDF documents using fpdf2 + python-bidi.
"""

import os
import io
import logging
from datetime import datetime
from pathlib import Path

from fpdf import FPDF
from bidi.algorithm import get_display

logger = logging.getLogger("urbangroup.pdf_generator")

# Font paths — Lambda uses /var/task/, local uses project root
if os.environ.get("IS_LAMBDA") == "true":
    FONT_DIR = Path("/var/task/fonts")
else:
    FONT_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "fonts"

FONT_REGULAR = str(FONT_DIR / "DejaVuSans.ttf")
FONT_BOLD = str(FONT_DIR / "DejaVuSans-Bold.ttf")


def _rtl(text):
    """Apply BiDi algorithm for correct Hebrew display in PDF."""
    return get_display(str(text))


def _create_pdf():
    """Create a new PDF with Hebrew fonts loaded."""
    pdf = FPDF()
    pdf.add_font("DejaVu", "", FONT_REGULAR)
    pdf.add_font("DejaVu", "B", FONT_BOLD)
    pdf.set_auto_page_break(auto=True, margin=15)
    return pdf


def _format_filters_line(filters):
    """Format active filters as a Hebrew string for display in PDF."""
    parts = []
    if filters.get("customer_name"):
        parts.append(f"לקוח: {filters['customer_name']}")
    if filters.get("min_amount"):
        parts.append(f"מינימום: {float(filters['min_amount']):,.0f} ₪")
    if filters.get("date_from"):
        parts.append(f"מתאריך: {filters['date_from']}")
    if filters.get("date_to"):
        parts.append(f"עד תאריך: {filters['date_to']}")
    return " | ".join(parts) if parts else ""


def generate_debt_report_pdf(report):
    """Generate a PDF for the AR1000 debt customer report.

    Args:
        report: dict from ar1000_report.generate_report()

    Returns:
        bytes: PDF file content
    """
    pdf = _create_pdf()
    pdf.add_page()

    # Title
    pdf.set_font("DejaVu", "B", 18)
    pdf.cell(0, 12, _rtl("דוח חייבים — אריאל"), new_x="LMARGIN", new_y="NEXT", align="R")

    # Date + summary
    pdf.set_font("DejaVu", "", 10)
    now = datetime.utcnow().strftime("%d/%m/%Y %H:%M")
    pdf.cell(0, 7, _rtl(f"תאריך: {now}"), new_x="LMARGIN", new_y="NEXT", align="R")
    pdf.cell(0, 7, _rtl(f"לקוחות עם יתרה: {report['filtered_customer_count']}"), new_x="LMARGIN", new_y="NEXT", align="R")

    # Show active filters
    filters_line = _format_filters_line(report.get("filters_applied", {}))
    if filters_line:
        pdf.set_font("DejaVu", "B", 10)
        pdf.cell(0, 7, _rtl(f"סינון: {filters_line}"), new_x="LMARGIN", new_y="NEXT", align="R")

    pdf.ln(5)

    # Table header
    col_widths = [50, 90, 50]  # Balance, Name, Customer#
    pdf.set_font("DejaVu", "B", 11)
    pdf.cell(col_widths[0], 8, _rtl("יתרה (₪)"), border="B", align="R")
    pdf.cell(col_widths[1], 8, _rtl("שם לקוח"), border="B", align="R")
    pdf.cell(col_widths[2], 8, _rtl("מס׳ לקוח"), border="B", align="R")
    pdf.ln()

    # Table rows
    pdf.set_font("DejaVu", "", 10)
    for c in report["customers"]:
        pdf.cell(col_widths[0], 7, _rtl(f'{c["balance"]:,.0f}'), align="R")
        pdf.cell(col_widths[1], 7, _rtl(c["cdes"][:40]), align="R")
        pdf.cell(col_widths[2], 7, _rtl(c["custname"]), align="R")
        pdf.ln()

    # Total
    pdf.ln(3)
    pdf.set_font("DejaVu", "B", 12)
    pdf.cell(col_widths[0], 9, _rtl(f'{report["total_balance"]:,.0f} ₪'), border="T", align="R")
    pdf.cell(col_widths[1], 9, _rtl("סה״כ"), border="T", align="R")
    pdf.cell(col_widths[2], 9, "", border="T")

    return pdf.output()


def generate_uncharged_report_pdf(report):
    """Generate a PDF for the AR10010 uncharged delivery notes report.

    Args:
        report: dict from ar10010_report.generate_report()

    Returns:
        bytes: PDF file content
    """
    pdf = _create_pdf()
    pdf.add_page("L")  # Landscape for more columns

    # Title
    pdf.set_font("DejaVu", "B", 18)
    pdf.cell(0, 12, _rtl("תעודות משלוח שלא חויבו — אריאל"), new_x="LMARGIN", new_y="NEXT", align="R")

    # Date + summary
    pdf.set_font("DejaVu", "", 10)
    now = datetime.utcnow().strftime("%d/%m/%Y %H:%M")
    pdf.cell(0, 7, _rtl(f"תאריך: {now}"), new_x="LMARGIN", new_y="NEXT", align="R")
    pdf.cell(0, 7, _rtl(f"תעודות: {report['document_count']}"), new_x="LMARGIN", new_y="NEXT", align="R")

    # Show active filters
    filters_line = _format_filters_line(report.get("filters_applied", {}))
    if filters_line:
        pdf.set_font("DejaVu", "B", 10)
        pdf.cell(0, 7, _rtl(f"סינון: {filters_line}"), new_x="LMARGIN", new_y="NEXT", align="R")

    pdf.ln(5)

    # Table header
    col_widths = [35, 30, 80, 40, 45, 47]  # Status, Amount, Name, Date, Customer, DocNo
    pdf.set_font("DejaVu", "B", 10)
    pdf.cell(col_widths[0], 8, _rtl("סטטוס"), border="B", align="R")
    pdf.cell(col_widths[1], 8, _rtl("סכום (₪)"), border="B", align="R")
    pdf.cell(col_widths[2], 8, _rtl("שם לקוח"), border="B", align="R")
    pdf.cell(col_widths[3], 8, _rtl("תאריך"), border="B", align="R")
    pdf.cell(col_widths[4], 8, _rtl("מס׳ לקוח"), border="B", align="R")
    pdf.cell(col_widths[5], 8, _rtl("ת. משלוח"), border="B", align="R")
    pdf.ln()

    # Table rows
    pdf.set_font("DejaVu", "", 9)
    for d in report["documents"]:
        pdf.cell(col_widths[0], 7, _rtl(d["statdes"]), align="R")
        pdf.cell(col_widths[1], 7, _rtl(f'{d["totprice"]:,.0f}'), align="R")
        pdf.cell(col_widths[2], 7, _rtl(d["cdes"][:35]), align="R")
        pdf.cell(col_widths[3], 7, _rtl(d["curdate"]), align="R")
        pdf.cell(col_widths[4], 7, _rtl(d["custname"]), align="R")
        pdf.cell(col_widths[5], 7, _rtl(d["docno"]), align="R")
        pdf.ln()

    # Total
    pdf.ln(3)
    pdf.set_font("DejaVu", "B", 11)
    pdf.cell(col_widths[0], 9, "", border="T")
    pdf.cell(col_widths[1], 9, _rtl(f'{report["total_amount"]:,.0f} ₪'), border="T", align="R")
    pdf.cell(col_widths[2], 9, _rtl("סה״כ"), border="T", align="R")
    pdf.cell(col_widths[3], 9, "", border="T")
    pdf.cell(col_widths[4], 9, "", border="T")
    pdf.cell(col_widths[5], 9, "", border="T")

    return pdf.output()
