"""
420-Invoice Printer Agent
Downloads invoice attachment (PDF) from Priority AINVOICES EXTFILES_SUBFORM
and saves it locally.
"""

import sys
import os
import io
import json
import base64
from pathlib import Path

if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import requests
from requests.auth import HTTPBasicAuth

if os.environ.get("IS_LAMBDA") != "true":
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent.parent.parent.parent / ".env"
    load_dotenv(env_path)

PRIORITY_URL = os.getenv("PRIORITY_URL_REAL", os.getenv("PRIORITY_URL", "")).rstrip("/")
PRIORITY_USERNAME = os.getenv("PRIORITY_USERNAME", "")
PRIORITY_PASSWORD = os.getenv("PRIORITY_PASSWORD", "")

OUTPUT_DIR = Path(r"C:\Users\User\Documents\חשבוניות פריורטי")


def download_invoice_attachment(ivnum, output_dir=None):
    """Download attachment from an AINVOICES invoice.

    Args:
        ivnum: Invoice number (e.g. '015-25-1000093')
        output_dir: Where to save the file (default: OUTPUT_DIR)

    Returns:
        Path to saved file, or None if no attachment found
    """
    if output_dir is None:
        output_dir = OUTPUT_DIR
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    auth = HTTPBasicAuth(PRIORITY_USERNAME, PRIORITY_PASSWORD)
    headers = {"Accept": "application/json"}

    # Get attachment from EXTFILES_SUBFORM
    url = f"{PRIORITY_URL}/AINVOICES(IVNUM='{ivnum}',IVTYPE='A',DEBIT='D')/EXTFILES_SUBFORM"
    print(f"Fetching attachments for invoice {ivnum}...")

    response = requests.get(url, headers=headers, auth=auth)
    response.raise_for_status()

    attachments = response.json().get("value", [])
    if not attachments:
        print(f"No attachments found for invoice {ivnum}")
        return None

    print(f"Found {len(attachments)} attachment(s)")

    # Take the first attachment
    att = attachments[0]
    desc = att.get("EXTFILEDES", "")
    raw = att.get("EXTFILENAME", "")
    suffix = att.get("SUFFIX", ".pdf")

    print(f"  Description: {desc}")
    print(f"  Suffix: {suffix}")

    # Parse data URI: data:application/pdf;base64,XXXX
    if raw.startswith("data:"):
        # Strip "data:mime;base64," prefix
        b64_data = raw.split(",", 1)[1] if "," in raw else raw
    else:
        b64_data = raw

    file_bytes = base64.b64decode(b64_data)
    print(f"  Size: {len(file_bytes):,} bytes")

    # Save file
    safe_name = ivnum.replace("/", "-").replace("\\", "-")
    ext = suffix if suffix.startswith(".") else f".{suffix}"
    out_path = output_dir / f"{safe_name}{ext}"

    with open(out_path, "wb") as f:
        f.write(file_bytes)

    print(f"  Saved to: {out_path}")
    return out_path


def get_invoice_attachment_bytes(ivnum):
    """Get invoice attachment as raw bytes (for API use).

    Args:
        ivnum: Invoice number (e.g. '015-25-1000093')

    Returns:
        tuple (file_bytes, filename, mime_type) or (None, None, None)
    """
    auth = HTTPBasicAuth(PRIORITY_USERNAME, PRIORITY_PASSWORD)
    headers = {"Accept": "application/json"}

    url = f"{PRIORITY_URL}/AINVOICES(IVNUM='{ivnum}',IVTYPE='A',DEBIT='D')/EXTFILES_SUBFORM"
    response = requests.get(url, headers=headers, auth=auth)
    response.raise_for_status()

    attachments = response.json().get("value", [])
    if not attachments:
        return None, None, None

    att = attachments[0]
    raw = att.get("EXTFILENAME", "")
    suffix = att.get("SUFFIX", "pdf")

    # Parse data URI
    mime_type = "application/pdf"
    if raw.startswith("data:"):
        header, b64_data = raw.split(",", 1) if "," in raw else ("", raw)
        if ";" in header:
            mime_type = header.split(":")[1].split(";")[0]
    else:
        b64_data = raw

    file_bytes = base64.b64decode(b64_data)
    safe_name = ivnum.replace("/", "-").replace("\\", "-")
    ext = suffix if suffix.startswith(".") else f".{suffix}"
    filename = f"{safe_name}{ext}"

    return file_bytes, filename, mime_type


def main():
    print("=" * 60)
    print("  420-Invoice Printer - Priority Cloud")
    print("=" * 60)
    print()

    print(f"Priority URL: {PRIORITY_URL}")
    print(f"Output dir: {OUTPUT_DIR}")
    print()

    # Download invoice attachment
    ivnum = "015-25-1000093"
    result = download_invoice_attachment(ivnum)

    if result:
        print(f"\nDone! Invoice saved to: {result}")
    else:
        print(f"\nNo attachment found for invoice {ivnum}")


if __name__ == "__main__":
    main()
