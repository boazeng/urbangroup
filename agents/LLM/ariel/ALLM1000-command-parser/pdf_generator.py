"""
PDF Generator for Ariel reports.
Generates Hebrew RTL PDF documents using fpdf2 + python-bidi.
"""

import os
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

# Colors
COLOR_PRIMARY = (25, 55, 109)       # Dark blue
COLOR_HEADER_BG = (37, 99, 186)     # Blue header
COLOR_HEADER_TEXT = (255, 255, 255)  # White
COLOR_ROW_ALT = (241, 245, 251)     # Light blue-gray
COLOR_ROW_WHITE = (255, 255, 255)
COLOR_BORDER = (200, 210, 225)
COLOR_TOTAL_BG = (230, 238, 250)
COLOR_TEXT = (30, 30, 30)
COLOR_TEXT_LIGHT = (100, 110, 130)


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


def _draw_header_bar(pdf, title, page_width):
    """Draw a colored title bar at the top of the page."""
    pdf.set_fill_color(*COLOR_PRIMARY)
    pdf.rect(0, 0, page_width, 28, "F")
    pdf.set_font("DejaVu", "B", 16)
    pdf.set_text_color(*COLOR_HEADER_TEXT)
    pdf.set_y(6)
    pdf.cell(0, 16, _rtl(title), align="R")
    pdf.set_y(30)
    pdf.set_text_color(*COLOR_TEXT)


def _draw_meta_line(pdf, label, value):
    """Draw a metadata line (label: value)."""
    pdf.set_font("DejaVu", "B", 9)
    pdf.set_text_color(*COLOR_TEXT_LIGHT)
    pdf.cell(0, 6, _rtl(f"{label}: {value}"), new_x="LMARGIN", new_y="NEXT", align="R")
    pdf.set_text_color(*COLOR_TEXT)


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
    if filters.get("status"):
        parts.append(f"סטטוס: {filters['status']}")
    return " | ".join(parts) if parts else ""


def _draw_table_header(pdf, columns):
    """Draw table header row with colored background."""
    pdf.set_fill_color(*COLOR_HEADER_BG)
    pdf.set_text_color(*COLOR_HEADER_TEXT)
    pdf.set_font("DejaVu", "B", 9)
    row_h = 9
    for col in columns:
        pdf.cell(col["w"], row_h, _rtl(col["label"]), border=0, align="R", fill=True)
    pdf.ln()
    pdf.set_text_color(*COLOR_TEXT)


def _draw_table_row(pdf, columns, values, row_idx):
    """Draw a single table row with alternating colors."""
    bg = COLOR_ROW_ALT if row_idx % 2 == 0 else COLOR_ROW_WHITE
    pdf.set_fill_color(*bg)
    pdf.set_font("DejaVu", "", 9)
    row_h = 7
    for i, col in enumerate(columns):
        pdf.cell(col["w"], row_h, _rtl(values[i]), border=0, align="R", fill=True)
    pdf.ln()


def _draw_total_row(pdf, columns, values):
    """Draw the totals row with emphasis."""
    # Thin separator line
    x_start = pdf.get_x()
    y = pdf.get_y()
    total_w = sum(c["w"] for c in columns)
    pdf.set_draw_color(*COLOR_BORDER)
    pdf.line(x_start, y, x_start + total_w, y)
    pdf.ln(1)

    pdf.set_fill_color(*COLOR_TOTAL_BG)
    pdf.set_font("DejaVu", "B", 10)
    row_h = 9
    for i, col in enumerate(columns):
        pdf.cell(col["w"], row_h, _rtl(values[i]), border=0, align="R", fill=True)
    pdf.ln()


def generate_debt_report_pdf(report):
    """Generate a PDF for the AR1000 debt customer report."""
    pdf = _create_pdf()
    pdf.add_page()
    page_w = pdf.w

    # Title bar
    _draw_header_bar(pdf, "דוח חייבים — אריאל", page_w)

    # Meta info
    now = datetime.utcnow().strftime("%d/%m/%Y %H:%M")
    _draw_meta_line(pdf, "תאריך הפקה", now)
    _draw_meta_line(pdf, "לקוחות עם יתרה", str(report['filtered_customer_count']))

    # Filters
    filters_line = _format_filters_line(report.get("filters_applied", {}))
    if filters_line:
        pdf.set_font("DejaVu", "B", 9)
        pdf.set_text_color(*COLOR_PRIMARY)
        pdf.cell(0, 6, _rtl(f"סינון: {filters_line}"), new_x="LMARGIN", new_y="NEXT", align="R")
        pdf.set_text_color(*COLOR_TEXT)

    pdf.ln(4)

    # Table
    columns = [
        {"label": "יתרה (₪)", "w": 45},
        {"label": "שם לקוח", "w": 95},
        {"label": "מס׳ לקוח", "w": 50},
    ]

    _draw_table_header(pdf, columns)

    for idx, c in enumerate(report["customers"]):
        values = [
            f'{c["balance"]:,.0f}',
            c["cdes"][:40],
            c["custname"],
        ]
        _draw_table_row(pdf, columns, values, idx)

    # Total
    _draw_total_row(pdf, columns, [
        f'{report["total_balance"]:,.0f} ₪',
        "סה״כ",
        "",
    ])

    return pdf.output()


def generate_uncharged_report_pdf(report):
    """Generate a PDF for the AR10010 uncharged delivery notes report."""
    pdf = _create_pdf()
    pdf.add_page("L")  # Landscape
    page_w = pdf.w

    # Title bar
    _draw_header_bar(pdf, "תעודות משלוח שלא חויבו — אריאל", page_w)

    # Meta info
    now = datetime.utcnow().strftime("%d/%m/%Y %H:%M")
    _draw_meta_line(pdf, "תאריך הפקה", now)
    _draw_meta_line(pdf, "תעודות", str(report['document_count']))

    # Filters
    filters_line = _format_filters_line(report.get("filters_applied", {}))
    if filters_line:
        pdf.set_font("DejaVu", "B", 9)
        pdf.set_text_color(*COLOR_PRIMARY)
        pdf.cell(0, 6, _rtl(f"סינון: {filters_line}"), new_x="LMARGIN", new_y="NEXT", align="R")
        pdf.set_text_color(*COLOR_TEXT)

    pdf.ln(4)

    # Table
    columns = [
        {"label": "סטטוס", "w": 25},
        {"label": "סכום (₪)", "w": 30},
        {"label": "פרטים", "w": 40},
        {"label": "אתר", "w": 38},
        {"label": "שם לקוח", "w": 50},
        {"label": "תאריך", "w": 30},
        {"label": "מס׳ לקוח", "w": 30},
        {"label": "ת. משלוח", "w": 30},
    ]

    _draw_table_header(pdf, columns)

    for idx, d in enumerate(report["documents"]):
        values = [
            d["statdes"],
            f'{d["totprice"]:,.0f}',
            d.get("details", "")[:18],
            d.get("codedes", "")[:16],
            d["cdes"][:22],
            d["curdate"],
            d["custname"],
            d["docno"],
        ]
        _draw_table_row(pdf, columns, values, idx)

    # Total
    _draw_total_row(pdf, columns, [
        "",
        f'{report["total_amount"]:,.0f} ₪',
        "",
        "",
        "סה״כ",
        "",
        "",
        "",
    ])

    return pdf.output()
