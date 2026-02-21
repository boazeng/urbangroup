"""
LLM2000 - Invoice Analyzer
Analyzes supplier invoice PDF pages using Claude Vision API.
Extracts: company ID, invoice number, date, amounts, description.
Handles multi-page invoices by grouping related pages.
"""

import os
import json
import base64
import logging
from pathlib import Path

import requests
import fitz  # PyMuPDF

if os.environ.get("IS_LAMBDA") != "true":
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
    load_dotenv(env_path)

logger = logging.getLogger("urbangroup.LLM2000")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")

SYSTEM_PROMPT = """You are an expert at reading Israeli supplier invoices (חשבוניות ספק).
You receive images of PDF pages. Each page may be a separate invoice, or multiple pages may belong to the same invoice.

For each invoice you identify, extract:
- companyId: The supplier's company ID (ח.פ. / ע.מ. / עוסק מורשה number, digits only)
- invoiceNum: Invoice number (מספר חשבונית / מספר תעודה)
- date: Invoice date in YYYY-MM-DD format
- amountNoVat: Total before VAT (סה"כ לפני מע"מ), number only
- amountWithVat: Total including VAT (סה"כ כולל מע"מ / סה"כ לתשלום), number only
- description: Brief description of what the invoice is for (in Hebrew)

Return ONLY valid JSON (no markdown, no backticks) with this structure:
{
  "invoices": [
    {
      "pages": [1],
      "companyId": "520031931",
      "invoiceNum": "241519116",
      "date": "2026-02-16",
      "amountNoVat": "8.86",
      "amountWithVat": "10.46",
      "description": "בזק - חשבון טלפון"
    }
  ]
}

Rules:
- If two consecutive pages clearly belong to the same invoice, group them: "pages": [1, 2]
- If a value cannot be found, use empty string ""
- Dates should be YYYY-MM-DD format
- Amounts should be plain numbers without commas or currency symbols
- Return JSON only, no explanation"""


def pdf_pages_to_images(pdf_bytes, dpi=150):
    """Convert PDF bytes to list of PNG image bytes (one per page)."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    images = []
    for page_num in range(doc.page_count):
        page = doc[page_num]
        pix = page.get_pixmap(dpi=dpi)
        png_bytes = pix.tobytes("png")
        images.append(png_bytes)
    doc.close()
    return images


def analyze_invoice_images(images):
    """Send page images to Claude Vision API for analysis."""
    if not ANTHROPIC_API_KEY:
        return None

    content = []
    for i, png_bytes in enumerate(images):
        b64 = base64.b64encode(png_bytes).decode("utf-8")
        content.append({"type": "text", "text": f"Page {i + 1}:"})
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": b64,
            }
        })

    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        json={
            "model": CLAUDE_MODEL,
            "max_tokens": 4096,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": content}],
        },
        timeout=60,
    )
    resp.raise_for_status()

    result = resp.json()
    text = result["content"][0]["text"]
    return _parse_response(text)


def _parse_response(raw_text):
    """Parse JSON from Claude response, stripping markdown wrappers if present."""
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()
    return json.loads(text)


def analyze_pdf(pdf_bytes):
    """Main entry point: PDF bytes in, invoice data out."""
    try:
        images = pdf_pages_to_images(pdf_bytes)
        result = analyze_invoice_images(images)
        if result is None:
            return {"ok": False, "error": "ANTHROPIC_API_KEY not configured"}
        return {
            "ok": True,
            "invoices": result.get("invoices", []),
            "page_count": len(images),
        }
    except json.JSONDecodeError as e:
        logger.error(f"LLM2000: Failed to parse Claude JSON: {e}")
        return {"ok": False, "error": f"Failed to parse AI response: {e}"}
    except requests.exceptions.HTTPError as e:
        logger.error(f"LLM2000: Claude API error: {e}")
        return {"ok": False, "error": f"AI API error: {e}"}
    except Exception as e:
        logger.error(f"LLM2000: Analysis failed: {e}")
        return {"ok": False, "error": str(e)}
