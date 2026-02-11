"""
Backend API server for Urban Group portal.
Proxies Priority ERP API calls, keeping credentials server-side.
"""

import sys
import os
import io
import tempfile
import importlib.util
from pathlib import Path
from datetime import datetime

import openpyxl
from flask import Flask, jsonify, send_file, request
from flask_cors import CORS

# Project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Load agent 100 module
agent_100_path = PROJECT_ROOT / "agents" / "100-customer" / "100-customer_reader.py"
spec_100 = importlib.util.spec_from_file_location("customer_reader", agent_100_path)
customer_reader = importlib.util.module_from_spec(spec_100)
sys.modules["customer_reader"] = customer_reader
spec_100.loader.exec_module(customer_reader)

# Agents 200/210 wrap sys.stdout with UTF-8 at import time.
# Save a ref before each load to prevent GC from closing the underlying buffer.
_saved_stdout = sys.stdout

# Load agent 200 module (invoice writer)
agent_200_path = PROJECT_ROOT / "agents" / "200-invoices" / "200-invoice_writer.py"
spec_200 = importlib.util.spec_from_file_location("invoice_writer", agent_200_path)
invoice_writer = importlib.util.module_from_spec(spec_200)
sys.modules["invoice_writer"] = invoice_writer
spec_200.loader.exec_module(invoice_writer)

# Load agent 210 module (invoice closer)
agent_210_path = PROJECT_ROOT / "agents" / "210-invoice-closer" / "210-invoice_closer.py"
spec_210 = importlib.util.spec_from_file_location("invoice_closer", agent_210_path)
invoice_closer = importlib.util.module_from_spec(spec_210)
sys.modules["invoice_closer"] = invoice_closer
spec_210.loader.exec_module(invoice_closer)

# Load agent 5000 module (WhatsApp bot)
agent_5000_path = PROJECT_ROOT / "agents" / "tools-connection" / "5000-whatsapp" / "5000-whatsapp_bot.py"
spec_5000 = importlib.util.spec_from_file_location("whatsapp_bot", agent_5000_path)
whatsapp_bot = importlib.util.module_from_spec(spec_5000)
sys.modules["whatsapp_bot"] = whatsapp_bot
spec_5000.loader.exec_module(whatsapp_bot)

# Ensure stdout is usable (use the latest UTF-8 wrapper or restore original)
if sys.stdout.closed:
    sys.stdout = _saved_stdout

app = Flask(__name__)
CORS(app)


@app.route("/api/customers", methods=["GET"])
def get_customers():
    """Fetch customer list from Priority ERP."""
    try:
        customers = customer_reader.fetch_customers(top=9999)
        return jsonify({"ok": True, "customers": customers})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/template", methods=["GET"])
def download_template():
    """Download the invoice template Excel file."""
    template_path = PROJECT_ROOT / "input" / "חשבונית עמלת גבייה - טמפלט.xlsx"
    if not template_path.exists():
        return jsonify({"ok": False, "error": "Template file not found"}), 404
    return send_file(
        template_path,
        as_attachment=True,
        download_name="חשבונית עמלת גבייה - טמפלט.xlsx",
    )


def parse_excel_invoices(filepath):
    """Parse uploaded Excel file into invoice data list."""
    wb = openpyxl.load_workbook(filepath, data_only=True)
    ws = wb.active

    invoices = []
    for row in ws.iter_rows(min_row=3, max_row=ws.max_row):
        row_num = row[1].value       # B: מס
        date_val = row[2].value      # C: תאריך חשבונית
        details = row[3].value       # D: פרטים
        branch = row[4].value        # E: סניף
        custname = row[5].value      # F: מספר לקוח פריוריטי
        cust_label = row[6].value    # G: שם לקוח
        partname = row[7].value      # H: מקט
        part_desc = row[8].value     # I: תאור מוצר
        quantity = row[9].value      # J: כמות
        price_with_vat = row[11].value  # L: סכום כולל מעמ

        if not custname:
            continue

        # Format date
        if isinstance(date_val, datetime):
            date_str = date_val.strftime("%Y-%m-%d")
        elif date_val:
            date_str = str(date_val)
        else:
            date_str = datetime.now().strftime("%Y-%m-%d")

        # Always calculate price from column L (with VAT)
        price_no_vat = round(price_with_vat / 1.18, 2) if price_with_vat else 0

        item = {
            "PARTNAME": str(partname).strip(),
            "TQUANT": quantity or 1,
            "PRICE": price_no_vat,
        }
        if part_desc:
            item["PDES"] = str(part_desc).strip()

        invoices.append({
            "row": row_num,
            "CUSTNAME": str(custname).strip(),
            "CUST_LABEL": str(cust_label or "").strip(),
            "IVDATE": date_str,
            "BRANCHNAME": str(branch or "000").strip(),
            "DETAILS": str(details or "").strip(),
            "items": [item],
        })

    wb.close()
    return invoices


@app.route("/api/invoices/run", methods=["POST"])
def run_invoices():
    """Process uploaded Excel file and create invoices in Priority."""
    if "file" not in request.files:
        return jsonify({"ok": False, "error": "No file uploaded"}), 400

    uploaded = request.files["file"]
    should_finalize = request.form.get("finalize", "1") == "1"

    # Save to temp file
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    uploaded.save(tmp.name)
    tmp.close()

    try:
        invoices = parse_excel_invoices(tmp.name)
    except Exception as e:
        os.unlink(tmp.name)
        return jsonify({"ok": False, "error": f"שגיאה בקריאת הקובץ: {e}"}), 400

    os.unlink(tmp.name)

    if not invoices:
        return jsonify({"ok": False, "error": "לא נמצאו שורות נתונים בקובץ"}), 400

    results = []
    for inv in invoices:
        try:
            result = invoice_writer.create_invoice(
                inv["CUSTNAME"],
                inv["IVDATE"],
                inv["BRANCHNAME"],
                inv["items"],
                details=inv.get("DETAILS"),
            )
            ivnum = result.get("IVNUM", "")

            # Finalize the invoice (טיוטא → סופית) if requested
            finalized = False
            finalize_error = None
            if should_finalize and ivnum:
                try:
                    invoice_closer.finalize_invoice(ivnum)
                    finalized = True
                except Exception as fe:
                    finalize_error = str(fe)

            results.append({
                "row": inv["row"],
                "customer": inv["CUSTNAME"],
                "name": inv["CUST_LABEL"],
                "status": "OK",
                "ivnum": ivnum or "N/A",
                "totprice": result.get("TOTPRICE", 0),
                "finalized": finalized,
                "finalize_error": finalize_error,
            })
        except Exception as e:
            results.append({
                "row": inv["row"],
                "customer": inv["CUSTNAME"],
                "name": inv["CUST_LABEL"],
                "status": "FAILED",
                "error": str(e),
            })

    success = sum(1 for r in results if r["status"] == "OK")
    failed = sum(1 for r in results if r["status"] == "FAILED")

    return jsonify({
        "ok": True,
        "total": len(results),
        "success": success,
        "failed": failed,
        "invoices": results,
    })


# ── WhatsApp Webhook Routes ──────────────────────────────────

@app.route("/api/whatsapp/webhook", methods=["GET"])
def whatsapp_verify():
    """Meta webhook verification (subscription handshake)."""
    mode = request.args.get("hub.mode", "")
    token = request.args.get("hub.verify_token", "")
    challenge = request.args.get("hub.challenge", "")

    result = whatsapp_bot.verify_webhook(mode, token, challenge)
    if result:
        return result, 200
    return "Forbidden", 403


@app.route("/api/whatsapp/webhook", methods=["POST"])
def whatsapp_incoming():
    """Receive incoming WhatsApp messages from Meta."""
    payload = request.get_json(silent=True) or {}
    messages = whatsapp_bot.handle_incoming(payload)

    # Mark each message as read
    for msg in messages:
        if msg.get("message_id"):
            whatsapp_bot.mark_as_read(msg["message_id"])

    # Auto-reply with acknowledgment (basic echo for now)
    for msg in messages:
        if msg.get("text") and msg["type"] == "text":
            try:
                whatsapp_bot.send_message(
                    msg["phone"],
                    f"קיבלנו את ההודעה שלך: {msg['text'][:100]}"
                )
            except Exception as e:
                print(f"Auto-reply error: {e}")

    return jsonify({"ok": True}), 200


@app.route("/api/whatsapp/send", methods=["POST"])
def whatsapp_send():
    """Send a WhatsApp message (from portal or other agents)."""
    data = request.get_json(silent=True) or {}
    phone = data.get("phone", "")
    text = data.get("text", "")
    template_name = data.get("template")

    if not phone:
        return jsonify({"ok": False, "error": "Missing phone number"}), 400

    try:
        if template_name:
            result = whatsapp_bot.send_template(
                phone,
                template_name,
                language=data.get("language", "he"),
                parameters=data.get("parameters"),
            )
        else:
            if not text:
                return jsonify({"ok": False, "error": "Missing text"}), 400
            result = whatsapp_bot.send_message(phone, text)

        return jsonify({"ok": True, "result": result})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ── Health ───────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "service": "urbangroup-backend"})


if __name__ == "__main__":
    print("Urban Group Backend API")
    print(f"Priority URL: {customer_reader.PRIORITY_URL}")
    print("Starting on http://localhost:5000")
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True,
        exclude_patterns=["*/WindowsApps/*", "*/encodings/*"],
    )
