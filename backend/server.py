"""
Backend API server for Urban Group portal.
Proxies Priority ERP API calls, keeping credentials server-side.
"""

import sys
import os
import io
import json
import tempfile
import importlib.util
import logging
from pathlib import Path
from datetime import datetime

# Use logging (writes to stderr, works in Lambda where stdout is broken)
logger = logging.getLogger("urbangroup")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)

import requests as http_requests
from requests.auth import HTTPBasicAuth
import openpyxl
from flask import Flask, jsonify, send_file, request
from flask_cors import CORS

IS_LAMBDA = os.environ.get("IS_LAMBDA") == "true"

# In Lambda, code is deployed flat in lambda-backend/; locally, backend/ is one level down
if IS_LAMBDA:
    PROJECT_ROOT = Path(__file__).resolve().parent
else:
    PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Load agent 100 module
agent_100_path = PROJECT_ROOT / "agents" / "specific-mission-agents" / "priority-specific-agents" / "100-customer" / "100-customer_reader.py"
spec_100 = importlib.util.spec_from_file_location("customer_reader", agent_100_path)
customer_reader = importlib.util.module_from_spec(spec_100)
sys.modules["customer_reader"] = customer_reader
spec_100.loader.exec_module(customer_reader)

# Agents 200/210 wrap sys.stdout with UTF-8 at import time.
# Save a ref before each load to prevent GC from closing the underlying buffer.
_saved_stdout = sys.stdout

# Load agent 200 module (invoice writer)
agent_200_path = PROJECT_ROOT / "agents" / "specific-mission-agents" / "priority-specific-agents" / "200-invoices" / "200-invoice_writer.py"
spec_200 = importlib.util.spec_from_file_location("invoice_writer", agent_200_path)
invoice_writer = importlib.util.module_from_spec(spec_200)
sys.modules["invoice_writer"] = invoice_writer
spec_200.loader.exec_module(invoice_writer)

# Load agent 210 module (invoice closer)
agent_210_path = PROJECT_ROOT / "agents" / "specific-mission-agents" / "priority-specific-agents" / "210-invoice-closer" / "210-invoice_closer.py"
spec_210 = importlib.util.spec_from_file_location("invoice_closer", agent_210_path)
invoice_closer = importlib.util.module_from_spec(spec_210)
sys.modules["invoice_closer"] = invoice_closer
spec_210.loader.exec_module(invoice_closer)

# Load agent 300 module (service call writer)
agent_300_path = PROJECT_ROOT / "agents" / "specific-mission-agents" / "priority-specific-agents" / "300-service-call" / "300-service_call_writer.py"
spec_300 = importlib.util.spec_from_file_location("service_call_writer", agent_300_path)
service_call_writer = importlib.util.module_from_spec(spec_300)
sys.modules["service_call_writer"] = service_call_writer
spec_300.loader.exec_module(service_call_writer)

# Load aging report module
aging_report_path = PROJECT_ROOT / "agents" / "specific-mission-agents" / "priority-specific-agents" / "800-reports" / "aging_report.py"
spec_aging = importlib.util.spec_from_file_location("aging_report", aging_report_path)
aging_report = importlib.util.module_from_spec(spec_aging)
sys.modules["aging_report"] = aging_report
spec_aging.loader.exec_module(aging_report)

# Load AR1000 module (Ariel debt customer report)
ar1000_path = PROJECT_ROOT / "agents" / "flows" / "ariel" / "AR1000-debt-customer-report.py"
spec_ar1000 = importlib.util.spec_from_file_location("ar1000_report", ar1000_path)
ar1000_report = importlib.util.module_from_spec(spec_ar1000)
sys.modules["ar1000_report"] = ar1000_report
spec_ar1000.loader.exec_module(ar1000_report)

# Load AR10010 module (Ariel uncharged delivery notes)
ar10010_path = PROJECT_ROOT / "agents" / "flows" / "ariel" / "AR10010-uncharged-delivery.py"
spec_ar10010 = importlib.util.spec_from_file_location("ar10010_report", ar10010_path)
ar10010_report = importlib.util.module_from_spec(spec_ar10010)
sys.modules["ar10010_report"] = ar10010_report
spec_ar10010.loader.exec_module(ar10010_report)

# Load AR10020 module (Ariel consolidated invoices)
ar10020_path = PROJECT_ROOT / "agents" / "flows" / "ariel" / "AR10020-invoices.py"
spec_ar10020 = importlib.util.spec_from_file_location("ar10020_report", ar10020_path)
ar10020_report = importlib.util.module_from_spec(spec_ar10020)
sys.modules["ar10020_report"] = ar10020_report
spec_ar10020.loader.exec_module(ar10020_report)

# Load agent 5000 module (WhatsApp bot)
agent_5000_path = PROJECT_ROOT / "agents" / "tools-connection" / "5000-whatsapp" / "5000-whatsapp_bot.py"
spec_5000 = importlib.util.spec_from_file_location("whatsapp_bot", agent_5000_path)
whatsapp_bot = importlib.util.module_from_spec(spec_5000)
sys.modules["whatsapp_bot"] = whatsapp_bot
spec_5000.loader.exec_module(whatsapp_bot)

# Load agent 5010 module (Ariel WhatsApp bot)
agent_5010_path = PROJECT_ROOT / "agents" / "tools-connection" / "5010-whatsapp" / "5010-whatsapp_bot.py"
spec_5010 = importlib.util.spec_from_file_location("whatsapp_bot_ariel", agent_5010_path)
whatsapp_bot_ariel = importlib.util.module_from_spec(spec_5010)
sys.modules["whatsapp_bot_ariel"] = whatsapp_bot_ariel
spec_5010.loader.exec_module(whatsapp_bot_ariel)

# Load ALLM1000 (Ariel command parser LLM)
allm1000_path = PROJECT_ROOT / "agents" / "LLM" / "ariel" / "ALLM1000-command-parser" / "ALLM1000_command_parser.py"
spec_allm1000 = importlib.util.spec_from_file_location("allm1000_command_parser", allm1000_path)
allm1000_module = importlib.util.module_from_spec(spec_allm1000)
sys.modules["allm1000_command_parser"] = allm1000_module
spec_allm1000.loader.exec_module(allm1000_module)

# Load PDF generator for Ariel reports
pdf_gen_path = PROJECT_ROOT / "agents" / "LLM" / "ariel" / "ALLM1000-command-parser" / "pdf_generator.py"
spec_pdf_gen = importlib.util.spec_from_file_location("pdf_generator", pdf_gen_path)
pdf_gen_module = importlib.util.module_from_spec(spec_pdf_gen)
sys.modules["pdf_generator"] = pdf_gen_module
spec_pdf_gen.loader.exec_module(pdf_gen_module)

# Load A1000 bot (Ariel WhatsApp smart bot)
a1000_path = PROJECT_ROOT / "agents" / "smart-agents-and-bots" / "ariel" / "A1000-ariel-whatsapp-bot" / "A1000_bot.py"
spec_a1000 = importlib.util.spec_from_file_location("a1000_bot", a1000_path)
a1000_bot = importlib.util.module_from_spec(spec_a1000)
sys.modules["a1000_bot"] = a1000_bot
spec_a1000.loader.exec_module(a1000_bot)

# Load M1000 bot (maintenance WhatsApp smart bot)
m1000_path = PROJECT_ROOT / "agents" / "smart-agents-and-bots" / "maintenance" / "M1000-maintenance-whatsapp-bot" / "M1000_bot.py"
spec_m1000 = importlib.util.spec_from_file_location("m1000_bot", m1000_path)
m1000_bot = importlib.util.module_from_spec(spec_m1000)
sys.modules["m1000_bot"] = m1000_bot
spec_m1000.loader.exec_module(m1000_bot)

# Load M10010 bot (troubleshooting script bot)
m10010_path = PROJECT_ROOT / "agents" / "smart-agents-and-bots" / "maintenance" / "M10010-troubleshoot-bot" / "M10010_bot.py"
spec_m10010 = importlib.util.spec_from_file_location("m10010_bot", m10010_path)
m10010_bot = importlib.util.module_from_spec(spec_m10010)
sys.modules["m10010_bot"] = m10010_bot
spec_m10010.loader.exec_module(m10010_bot)

# Load agent 420 module (invoice printer / attachment downloader)
agent_420_path = PROJECT_ROOT / "agents" / "specific-mission-agents" / "priority-specific-agents" / "420-invoice-printer" / "420-invoice_printer.py"
spec_420 = importlib.util.spec_from_file_location("invoice_printer", agent_420_path)
invoice_printer = importlib.util.module_from_spec(spec_420)
sys.modules["invoice_printer"] = invoice_printer
spec_420.loader.exec_module(invoice_printer)

# Load maintenance database module
maint_db_path = PROJECT_ROOT / "database" / "maintenance" / "maintenance_db.py"
spec_maint_db = importlib.util.spec_from_file_location("maintenance_db", maint_db_path)
maintenance_db = importlib.util.module_from_spec(spec_maint_db)
sys.modules["maintenance_db"] = maintenance_db
spec_maint_db.loader.exec_module(maintenance_db)

# Load troubleshoot sessions database module
ts_db_path = PROJECT_ROOT / "database" / "maintenance" / "troubleshoot_sessions_db.py"
spec_ts_db = importlib.util.spec_from_file_location("troubleshoot_sessions_db", ts_db_path)
troubleshoot_sessions_db = importlib.util.module_from_spec(spec_ts_db)
sys.modules["troubleshoot_sessions_db"] = troubleshoot_sessions_db
spec_ts_db.loader.exec_module(troubleshoot_sessions_db)

# Load bot scripts database module
bs_db_path = PROJECT_ROOT / "database" / "maintenance" / "bot_scripts_db.py"
spec_bs_db = importlib.util.spec_from_file_location("bot_scripts_db", bs_db_path)
bot_scripts_db = importlib.util.module_from_spec(spec_bs_db)
sys.modules["bot_scripts_db"] = bot_scripts_db
spec_bs_db.loader.exec_module(bot_scripts_db)

# Load bot prompts database module
bp_db_path = PROJECT_ROOT / "database" / "maintenance" / "bot_prompts_db.py"
spec_bp_db = importlib.util.spec_from_file_location("bot_prompts_db", bp_db_path)
bot_prompts_db = importlib.util.module_from_spec(spec_bp_db)
sys.modules["bot_prompts_db"] = bot_prompts_db
spec_bp_db.loader.exec_module(bot_prompts_db)

# Load knowledge database module
kn_db_path = PROJECT_ROOT / "database" / "maintenance" / "knowledge_db.py"
spec_kn_db = importlib.util.spec_from_file_location("knowledge_db", kn_db_path)
knowledge_db = importlib.util.module_from_spec(spec_kn_db)
sys.modules["knowledge_db"] = knowledge_db
spec_kn_db.loader.exec_module(knowledge_db)

# Load RAG retrieval module
rag_path = PROJECT_ROOT / "agents" / "LLM" / "maintenance" / "rag_retrieval.py"
spec_rag = importlib.util.spec_from_file_location("rag_retrieval", rag_path)
rag_retrieval = importlib.util.module_from_spec(spec_rag)
sys.modules["rag_retrieval"] = rag_retrieval
spec_rag.loader.exec_module(rag_retrieval)

# Load LLM2000 module (invoice analyzer)
llm2000_path = PROJECT_ROOT / "agents" / "LLM" / "LLM2000-invoice-analyzer" / "LLM2000_invoice_analyzer.py"
spec_llm2000 = importlib.util.spec_from_file_location("llm2000_invoice_analyzer", llm2000_path)
llm2000_analyzer = importlib.util.module_from_spec(spec_llm2000)
sys.modules["llm2000_invoice_analyzer"] = llm2000_analyzer
spec_llm2000.loader.exec_module(llm2000_analyzer)

# Ensure stdout is usable (use the latest UTF-8 wrapper or restore original)
if sys.stdout.closed:
    sys.stdout = _saved_stdout

app = Flask(__name__)
CORS(app)

# ── Seed default bot script on startup ───────────────────────
try:
    m10010_bot.seed_default_script()
except Exception as _seed_err:
    logger.warning(f"Bot script seed skipped: {_seed_err}")

# ── Seed default LLM prompt on startup ───────────────────
try:
    existing_prompt = bot_prompts_db.get_active_prompt(use_cache=False)
    if not existing_prompt:
        # Import the hardcoded prompt from MLLM1000
        _mllm_path = PROJECT_ROOT / "agents" / "LLM" / "maintenance" / "MLLM1000-servicecall-identifier" / "MLLM1000_servicecall_identifier.py"
        _spec_mllm = importlib.util.spec_from_file_location("_mllm_seed", _mllm_path)
        _mllm_mod = importlib.util.module_from_spec(_spec_mllm)
        _spec_mllm.loader.exec_module(_mllm_mod)
        bot_prompts_db.save_prompt({
            "prompt_id": "servicecall-identifier-v1",
            "name": "Service Call Identifier - Default",
            "content": _mllm_mod.SYSTEM_PROMPT,
            "active": True,
        })
        logger.info("Seeded default LLM prompt from MLLM1000")
except Exception as _prompt_seed_err:
    logger.warning(f"Bot prompt seed skipped: {_prompt_seed_err}")

# ── Environment switching (demo / real) ──────────────────────
# Fallback to PRIORITY_URL for backward compat (e.g. Lambda with old config)
_fallback_url = os.getenv("PRIORITY_URL", "")
PRIORITY_URL_DEMO = os.getenv("PRIORITY_URL_DEMO", _fallback_url).rstrip("/")
PRIORITY_URL_REAL = os.getenv("PRIORITY_URL_REAL", "").rstrip("/")


def get_priority_url():
    """Return the Priority URL matching the request's ?env= param."""
    env = request.args.get("env", "demo")
    return PRIORITY_URL_REAL if env == "real" else PRIORITY_URL_DEMO


def set_priority_env():
    """Set PRIORITY_URL on all agent modules according to the request env."""
    url = get_priority_url()
    customer_reader.PRIORITY_URL = url
    invoice_writer.PRIORITY_URL = url
    service_call_writer.PRIORITY_URL = url
    aging_report.PRIORITY_URL = url
    ar1000_report.PRIORITY_URL = url
    ar10010_report.PRIORITY_URL = url
    ar10020_report.PRIORITY_URL = url
    invoice_printer.PRIORITY_URL = url


@app.route("/api/customers", methods=["GET"])
def get_customers():
    """Fetch customer list from Priority ERP."""
    set_priority_env()
    try:
        customers = customer_reader.fetch_customers(top=9999)
        return jsonify({"ok": True, "customers": customers})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/template", methods=["GET"])
def download_template():
    """Download the invoice template Excel file."""
    if IS_LAMBDA:
        import boto3
        s3 = boto3.client("s3")
        bucket = os.environ["TEMPLATE_BUCKET"]
        key = os.environ["TEMPLATE_KEY"]
        tmp_path = "/tmp/template.xlsx"
        s3.download_file(bucket, key, tmp_path)
        return send_file(
            tmp_path,
            as_attachment=True,
            download_name="חשבונית עמלת גבייה - טמפלט.xlsx",
        )
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
    set_priority_env()
    if "file" not in request.files:
        return jsonify({"ok": False, "error": "No file uploaded"}), 400

    uploaded = request.files["file"]
    should_finalize = request.form.get("finalize", "1") == "1"

    # Save to temp file (Lambda only allows /tmp)
    tmp = tempfile.NamedTemporaryFile(
        delete=False, suffix=".xlsx", dir="/tmp" if IS_LAMBDA else None
    )
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
    logger.info(f"Webhook received: {len(messages)} message(s)")

    # Mark each message as read
    for msg in messages:
        if msg.get("message_id"):
            whatsapp_bot.mark_as_read(msg["message_id"])

    for msg in messages:
        phone = msg.get("phone", "")
        logger.info(f"From {phone} ({msg.get('name')}): {msg.get('text', '')[:100]}")

        try:
            # Check if this phone has an active troubleshooting session
            session = m10010_bot.get_active_session(phone)
            if session:
                result = m10010_bot.process_message(
                    phone=phone,
                    text=msg.get("text", ""),
                    msg_type=msg.get("type", "text"),
                    caption=msg.get("caption", ""),
                )
                if result:
                    _send_bot_response(phone, result)
                    logger.info(f"M10010 reply sent to {phone}")
                continue

            # Normal M1000 flow
            response = m1000_bot.process_message(
                phone=phone,
                name=msg.get("name", ""),
                text=msg.get("text", ""),
                msg_type=msg.get("type", "text"),
                message_id=msg.get("message_id", ""),
                media_id=msg.get("media_id", ""),
                caption=msg.get("caption", ""),
            )

            if isinstance(response, dict) and response.get("handoff") == "M10010":
                # M1000 hands off - start troubleshooting session
                result = m10010_bot.start_session(
                    phone=phone,
                    name=msg.get("name", ""),
                    llm_result=response.get("llm_result", {}),
                    parsed_data=response.get("parsed_data", {}),
                    message_id=msg.get("message_id", ""),
                    media_id=msg.get("media_id", ""),
                    original_text=response.get("original_text", msg.get("text", "")),
                    device_number=response.get("device_number", ""),
                    customer_number=response.get("customer_number", ""),
                    customer_name=response.get("customer_name", ""),
                    script_id=response.get("script_id"),
                )
                if result:
                    _send_bot_response(phone, result)
                    logger.info(f"M10010 session started for {phone}")
            elif response:
                whatsapp_bot.send_message(phone, response)
                logger.info(f"M1000 reply sent to {phone}")

        except Exception as e:
            logger.error(f"Bot error for {phone}: {e}")

    return jsonify({"ok": True}), 200


def _send_bot_response(phone, result):
    """Send a bot response - either buttons or plain text."""
    if result.get("buttons"):
        whatsapp_bot.send_buttons(
            phone,
            result["text"],
            result["buttons"],
            header=result.get("header"),
            footer=result.get("footer"),
        )
    else:
        whatsapp_bot.send_message(phone, result["text"])


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


# ── WhatsApp Ariel Webhook Routes ────────────────────────────

@app.route("/api/whatsapp-ariel/webhook", methods=["GET"])
def whatsapp_ariel_verify():
    """Meta webhook verification for Ariel number."""
    mode = request.args.get("hub.mode", "")
    token = request.args.get("hub.verify_token", "")
    challenge = request.args.get("hub.challenge", "")

    result = whatsapp_bot_ariel.verify_webhook(mode, token, challenge)
    if result:
        return result, 200
    return "Forbidden", 403


@app.route("/api/whatsapp-ariel/webhook", methods=["POST"])
def whatsapp_ariel_incoming():
    """Receive incoming WhatsApp messages from Ariel Meta App."""
    payload = request.get_json(silent=True) or {}
    messages = whatsapp_bot_ariel.handle_incoming(payload)
    logger.info(f"Ariel webhook received: {len(messages)} message(s)")

    for msg in messages:
        if msg.get("message_id"):
            whatsapp_bot_ariel.mark_as_read(msg["message_id"])

    for msg in messages:
        logger.info(f"Ariel from {msg.get('phone')} ({msg.get('name')}): {msg.get('text', '')[:100]}")
        try:
            response = a1000_bot.process_message(
                phone=msg.get("phone", ""),
                name=msg.get("name", ""),
                text=msg.get("text", ""),
                msg_type=msg.get("type", "text"),
                message_id=msg.get("message_id", ""),
                media_id=msg.get("media_id", ""),
                caption=msg.get("caption", ""),
            )
            if response:
                whatsapp_bot_ariel.send_message(msg["phone"], response)
                logger.info(f"A1000 reply sent to {msg['phone']}")
        except Exception as e:
            logger.error(f"A1000 bot error: {e}")

    return jsonify({"ok": True}), 200


@app.route("/api/whatsapp-ariel/send", methods=["POST"])
def whatsapp_ariel_send():
    """Send a WhatsApp message from the Ariel number."""
    data = request.get_json(silent=True) or {}
    phone = data.get("phone", "")
    text = data.get("text", "")
    template_name = data.get("template")

    if not phone:
        return jsonify({"ok": False, "error": "Missing phone number"}), 400

    try:
        if template_name:
            result = whatsapp_bot_ariel.send_template(
                phone,
                template_name,
                language=data.get("language", "he"),
                parameters=data.get("parameters"),
            )
        else:
            if not text:
                return jsonify({"ok": False, "error": "Missing text"}), 400
            result = whatsapp_bot_ariel.send_message(phone, text)

        return jsonify({"ok": True, "result": result})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ── Messages (DynamoDB) ──────────────────────────────────────

@app.route("/api/messages", methods=["GET"])
def get_messages():
    """Get WhatsApp messages from DynamoDB."""
    status = request.args.get("status")
    limit = int(request.args.get("limit", "50"))
    try:
        messages = maintenance_db.get_messages(status=status, limit=limit)
        return jsonify({"ok": True, "messages": messages, "count": len(messages)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/messages/<item_id>/status", methods=["PUT"])
def update_message_status(item_id):
    """Update a message status."""
    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    if not new_status:
        return jsonify({"ok": False, "error": "Missing status"}), 400
    try:
        updated = maintenance_db.update_message_status(item_id, new_status)
        return jsonify({"ok": True, "message": updated})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ── Service Calls (DynamoDB) ─────────────────────────────────

@app.route("/api/service-calls", methods=["GET"])
def get_service_calls():
    """Get service calls from DynamoDB."""
    status = request.args.get("status")
    phone = request.args.get("phone")
    limit = int(request.args.get("limit", "50"))
    try:
        calls = maintenance_db.get_service_calls(status=status, phone=phone, limit=limit)
        return jsonify({"ok": True, "service_calls": calls, "count": len(calls)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/service-calls/<item_id>/status", methods=["PUT"])
def update_service_call_status(item_id):
    """Update a service call status."""
    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    if not new_status:
        return jsonify({"ok": False, "error": "Missing status"}), 400
    try:
        updated = maintenance_db.update_service_call_status(item_id, new_status)
        return jsonify({"ok": True, "service_call": updated})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/service-calls/<item_id>/push", methods=["POST"])
def push_service_call_to_priority(item_id):
    """Push a service call to Priority ERP via Agent 300."""
    set_priority_env()
    try:
        call = maintenance_db.get_service_call(item_id)
        if not call:
            return jsonify({"ok": False, "error": "קריאת שירות לא נמצאה"}), 404

        if call.get("priority_pushed"):
            return jsonify({"ok": False, "error": "קריאת השירות כבר נשלחה לפריוריטי"}), 400

        result = service_call_writer.create_service_call(call)
        callno = str(result.get("DOCNO", ""))
        maintenance_db.mark_service_call_pushed(item_id, callno=callno)

        return jsonify({
            "ok": True,
            "callno": callno,
            "priority_response": result,
        })
    except Exception as e:
        logger.error(f"Error pushing service call {item_id}: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500


# ── Reports ──────────────────────────────────────────────────

@app.route("/api/reports/aging", methods=["GET"])
def get_aging_report():
    """Generate aging report for consolidated invoices."""
    set_priority_env()
    branch = request.args.get("branch") or None
    try:
        report = aging_report.fetch_aging_report(branch=branch)
        return jsonify({"ok": True, **report})
    except Exception as e:
        logger.error(f"Error generating aging report: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/reports/ariel-debt", methods=["GET"])
def get_ariel_debt_report():
    """Generate AR1000 Ariel debt customer report."""
    set_priority_env()
    try:
        report = ar1000_report.generate_report()
        return jsonify({"ok": True, **report})
    except Exception as e:
        logger.error(f"Error generating Ariel debt report: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/reports/ariel-uncharged-delivery", methods=["GET"])
def get_ariel_uncharged_delivery():
    """Generate AR10010 uncharged delivery notes report."""
    set_priority_env()
    try:
        report = ar10010_report.generate_report()
        return jsonify({"ok": True, **report})
    except Exception as e:
        logger.error(f"Error generating uncharged delivery report: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/reports/ariel-invoices", methods=["GET"])
def get_ariel_invoices():
    """Generate AR10020 consolidated invoices report."""
    set_priority_env()
    days_back = int(request.args.get("days_back", "30"))
    try:
        report = ar10020_report.generate_report(days_back=days_back)
        return jsonify({"ok": True, **report})
    except Exception as e:
        logger.error(f"Error generating invoices report: {e}")
        return jsonify({"ok": False, "error": str(e)}), 500


# ── Invoice Printer ──────────────────────────────────────────

@app.route("/api/invoice-printer/download", methods=["POST"])
def download_invoice_pdf():
    """Download invoice PDF attachment from Priority."""
    set_priority_env()
    data = request.get_json(silent=True) or {}
    ivnum = data.get("ivnum", "").strip()

    if not ivnum:
        return jsonify({"error": "Missing ivnum"}), 400

    try:
        file_bytes, filename, mime_type = invoice_printer.get_invoice_attachment_bytes(ivnum)
    except Exception as e:
        logger.error(f"Error fetching invoice {ivnum}: {e}")
        return jsonify({"error": f"שגיאה בשליפת חשבונית: {e}"}), 500

    if file_bytes is None:
        return jsonify({"error": f"לא נמצא נספח לחשבונית {ivnum}"}), 404

    # Save local copy when running locally (not on Lambda)
    if os.environ.get("IS_LAMBDA") != "true":
        try:
            local_dir = Path(r"C:\Users\User\Documents\חשבוניות פריורטי")
            local_dir.mkdir(parents=True, exist_ok=True)
            local_path = local_dir / filename
            with open(local_path, "wb") as f:
                f.write(file_bytes)
            logger.info(f"Saved local copy: {local_path}")
        except Exception as e:
            logger.warning(f"Could not save local copy: {e}")

    return send_file(
        io.BytesIO(file_bytes),
        mimetype=mime_type,
        as_attachment=True,
        download_name=filename,
    )


# ── Invoice Analyzer (Claude AI) ─────────────────────────────

@app.route("/api/analyze-invoice", methods=["POST"])
def analyze_invoice_pdf():
    """Analyze supplier invoice PDF using Claude Vision AI."""
    if "file" not in request.files:
        return jsonify({"ok": False, "error": "No file uploaded"}), 400

    uploaded = request.files["file"]
    pdf_bytes = uploaded.read()

    if not pdf_bytes:
        return jsonify({"ok": False, "error": "Empty file"}), 400

    result = llm2000_analyzer.analyze_pdf(pdf_bytes)

    if not result.get("ok"):
        status = 500 if "API error" in result.get("error", "") else 400
        return jsonify(result), status

    # Enrich invoices with supplier data from cache
    cache = _load_supplier_cache()
    for inv in result.get("invoices", []):
        cid = inv.get("companyId", "")
        if cid and cid in cache:
            inv["supplier"] = cache[cid]["supname"]
            inv["supplierName"] = cache[cid]["supdes"]

    return jsonify(result)


# ── Supplier Cache ───────────────────────────────────────────
# Maps company ID (ח.פ.) → {supname, supdes} for auto-fill.
# Grows over time as users confirm supplier mappings.

_SUPPLIER_CACHE_PATH = PROJECT_ROOT / "backend" / "supplier_cache.json"


def _load_supplier_cache():
    """Load supplier cache from JSON file."""
    if _SUPPLIER_CACHE_PATH.exists():
        try:
            return json.loads(_SUPPLIER_CACHE_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _save_supplier_cache(cache):
    """Save supplier cache to JSON file."""
    _SUPPLIER_CACHE_PATH.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


@app.route("/api/supplier-mapping", methods=["POST"])
def save_supplier_mapping():
    """Save a company ID → supplier mapping for future auto-fill."""
    data = request.get_json()
    company_id = data.get("companyId", "").strip()
    supname = data.get("supname", "").strip()
    supdes = data.get("supdes", "").strip()

    if not company_id or not supname:
        return jsonify({"ok": False, "error": "companyId and supname required"}), 400

    cache = _load_supplier_cache()
    cache[company_id] = {"supname": supname, "supdes": supdes}
    _save_supplier_cache(cache)

    return jsonify({"ok": True, "saved": {company_id: cache[company_id]}})


@app.route("/api/suppliers", methods=["GET"])
def list_suppliers():
    """Fetch all unique suppliers from Priority YINVOICES for dropdown."""
    set_priority_env()
    url = get_priority_url()
    auth = HTTPBasicAuth(
        os.getenv("PRIORITY_USERNAME", ""),
        os.getenv("PRIORITY_PASSWORD", ""),
    )
    headers = {"Accept": "application/json", "OData-Version": "4.0"}

    suppliers = {}
    next_url = f"{url}/YINVOICES?$select=SUPNAME,CDES&$orderby=SUPNAME"
    pages = 0
    while next_url and pages < 30:
        resp = http_requests.get(next_url, headers=headers, auth=auth)
        if resp.status_code != 200:
            break
        data = resp.json()
        for row in data.get("value", []):
            sup = row.get("SUPNAME")
            if sup and sup not in suppliers:
                suppliers[sup] = row.get("CDES", "")
        next_url = data.get("@odata.nextLink")
        pages += 1

    result = [{"supname": k, "supdes": v} for k, v in sorted(suppliers.items())]
    return jsonify({"ok": True, "suppliers": result, "count": len(result)})


# ── Bot Scripts ──────────────────────────────────────────────

@app.route("/api/bot-scripts/generate", methods=["POST"])
def generate_bot_script():
    """Use Claude AI to generate a bot script from a plain-language description."""
    import re
    data = request.get_json(silent=True) or {}
    description = data.get("description", "").strip()
    if not description:
        return jsonify({"ok": False, "error": "description required"}), 400

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return jsonify({"ok": False, "error": "ANTHROPIC_API_KEY not configured"}), 500

    model = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")

    prompt = f"""You are building a WhatsApp bot conversation script for a Hebrew-speaking maintenance company.
Generate a bot script in JSON format based on this description:

{description}

The JSON must follow this EXACT schema:
{{
  "name": "Script name in Hebrew",
  "greeting_known": "Opening message, may use {{{{customer_name}}}} placeholder",
  "greeting_unknown": "Opening message for unknown customers",
  "first_step": "STEP_1",
  "steps": [
    {{
      "id": "STEP_1",
      "type": "text_input",
      "text": "Question text in Hebrew",
      "save_to": "field_name_in_english",
      "next_step": "STEP_2"
    }},
    {{
      "id": "STEP_2",
      "type": "buttons",
      "text": "Question text in Hebrew",
      "buttons": [
        {{"id": "btn_2_1", "title": "Button text (max 20 chars)", "next_step": "DONE_1"}},
        {{"id": "btn_2_2", "title": "Button text (max 20 chars)", "next_step": "DONE_1"}}
      ]
    }}
  ],
  "done_actions": {{
    "DONE_1": {{
      "text": "Closing message in Hebrew",
      "action": "save_service_call"
    }}
  }}
}}

Rules:
- All questions and messages must be in Hebrew
- Button titles: max 20 characters, max 3 buttons per step
- save_to field names in English (e.g. description, location, category, urgency, phone, name)
- action must be: save_service_call OR save_message
- Steps connect linearly: STEP_1 → STEP_2 → ... → DONE_1
- Return ONLY the raw JSON object, no markdown, no explanation"""

    try:
        resp = http_requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 2000,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=30,
        )
        if resp.status_code != 200:
            return jsonify({"ok": False, "error": f"AI error: {resp.status_code}"}), 500

        text = resp.json()["content"][0]["text"].strip()
        # Strip markdown code fences if present
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        script_data = json.loads(text)
        return jsonify({"ok": True, "script": script_data})
    except json.JSONDecodeError as e:
        return jsonify({"ok": False, "error": f"AI returned invalid JSON: {e}"}), 500
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/bot-scripts", methods=["GET"])
def list_bot_scripts():
    """List all bot conversation scripts."""
    try:
        scripts = bot_scripts_db.list_scripts()
        return jsonify({"ok": True, "scripts": scripts, "count": len(scripts)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/bot-scripts/<script_id>", methods=["GET"])
def get_bot_script(script_id):
    """Get a single bot script by ID."""
    try:
        script = bot_scripts_db.get_script(script_id, use_cache=False)
        if not script:
            return jsonify({"ok": False, "error": "תסריט לא נמצא"}), 404
        return jsonify({"ok": True, "script": script})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/bot-scripts", methods=["POST"])
def create_bot_script():
    """Create a new bot script."""
    data = request.get_json(silent=True) or {}
    if not data.get("script_id") or not data.get("name"):
        return jsonify({"ok": False, "error": "script_id and name are required"}), 400
    try:
        result = bot_scripts_db.save_script(data)
        return jsonify({"ok": True, **result})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/bot-scripts/<script_id>", methods=["PUT"])
def update_bot_script(script_id):
    """Update an existing bot script."""
    data = request.get_json(silent=True) or {}
    data["script_id"] = script_id
    try:
        result = bot_scripts_db.save_script(data)
        # Invalidate the M10010 engine cache too
        bot_scripts_db.invalidate_cache(script_id)
        return jsonify({"ok": True, **result})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ── Bot Prompts (LLM Training) ───────────────────────────────

@app.route("/api/bot-prompts", methods=["GET"])
def list_bot_prompts():
    """List all LLM prompts."""
    try:
        prompts = bot_prompts_db.list_prompts()
        return jsonify({"ok": True, "prompts": prompts, "count": len(prompts)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/bot-prompts/active", methods=["GET"])
def get_active_bot_prompt():
    """Get the currently active LLM prompt."""
    try:
        prompt = bot_prompts_db.get_active_prompt(use_cache=False)
        if not prompt:
            return jsonify({"ok": False, "error": "No active prompt found"}), 404
        return jsonify({"ok": True, "prompt": prompt})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/bot-prompts", methods=["POST"])
def create_bot_prompt():
    """Create a new LLM prompt."""
    data = request.get_json(silent=True) or {}
    if not data.get("prompt_id") or not data.get("content"):
        return jsonify({"ok": False, "error": "prompt_id and content are required"}), 400
    try:
        result = bot_prompts_db.save_prompt(data)
        return jsonify({"ok": True, **result})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/bot-prompts/<prompt_id>", methods=["PUT"])
def update_bot_prompt(prompt_id):
    """Update an existing LLM prompt."""
    data = request.get_json(silent=True) or {}
    data["prompt_id"] = prompt_id
    try:
        result = bot_prompts_db.save_prompt(data)
        bot_prompts_db.invalidate_cache(prompt_id)
        return jsonify({"ok": True, **result})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ── Conversation History ─────────────────────────────────────

@app.route("/api/conversations", methods=["GET"])
def get_conversations():
    """Get conversation history (service calls)."""
    try:
        status = request.args.get("status")
        phone = request.args.get("phone")
        limit = int(request.args.get("limit", 50))
        calls = maint_db.get_service_calls(status=status, phone=phone, limit=limit)
        return jsonify({"ok": True, "conversations": calls, "count": len(calls)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/conversations/<call_id>", methods=["GET"])
def get_conversation_detail(call_id):
    """Get full detail of a single conversation/service call."""
    try:
        call = maint_db.get_service_call(call_id)
        if not call:
            return jsonify({"ok": False, "error": "Conversation not found"}), 404
        return jsonify({"ok": True, "conversation": call})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ── Knowledge Base (RAG) ─────────────────────────────────────

@app.route("/api/knowledge", methods=["GET"])
def list_knowledge():
    """List all active knowledge items."""
    try:
        item_type = request.args.get("type")
        items = knowledge_db.list_items(item_type=item_type)
        return jsonify({"ok": True, "items": items, "count": len(items)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/knowledge/<item_id>", methods=["GET"])
def get_knowledge_item(item_id):
    """Get a single knowledge item."""
    try:
        item = knowledge_db.get_item(item_id)
        if not item:
            return jsonify({"ok": False, "error": "פריט ידע לא נמצא"}), 404
        # Strip embedding from response
        item.pop("embedding", None)
        return jsonify({"ok": True, "item": item})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/knowledge", methods=["POST"])
def create_knowledge_item():
    """Create a new knowledge item with auto-embedding."""
    data = request.get_json(silent=True) or {}
    if not data.get("title") or not data.get("content"):
        return jsonify({"ok": False, "error": "title and content are required"}), 400
    try:
        # Generate embedding
        embedding = rag_retrieval.generate_embedding(data["content"])
        if embedding:
            data["embedding"] = embedding
        else:
            logger.warning("Failed to generate embedding, saving without it")

        result = knowledge_db.save_item(data)
        return jsonify({"ok": True, **result, "has_embedding": embedding is not None})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/knowledge/<item_id>", methods=["PUT"])
def update_knowledge_item(item_id):
    """Update a knowledge item (re-embeds if content changed)."""
    data = request.get_json(silent=True) or {}
    data["id"] = item_id
    try:
        # Re-generate embedding if content provided
        if data.get("content"):
            embedding = rag_retrieval.generate_embedding(data["content"])
            if embedding:
                data["embedding"] = embedding

        result = knowledge_db.save_item(data)
        return jsonify({"ok": True, **result})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/knowledge/<item_id>", methods=["DELETE"])
def delete_knowledge_item(item_id):
    """Deactivate a knowledge item."""
    try:
        knowledge_db.delete_item(item_id)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/knowledge/from-call", methods=["POST"])
def create_knowledge_from_call():
    """Create a knowledge item from an existing service call conversation."""
    data = request.get_json(silent=True) or {}
    call_id = data.get("call_id")
    notes = data.get("notes", "")
    if not call_id:
        return jsonify({"ok": False, "error": "call_id is required"}), 400
    try:
        # Load the service call
        call = maint_db.get_service_call(call_id)
        if not call:
            return jsonify({"ok": False, "error": "קריאת שירות לא נמצאה"}), 404

        # Build knowledge content from call data + operator notes
        parts = []
        if call.get("issue_type"):
            parts.append(f"סוג תקלה: {call['issue_type']}")
        if call.get("description"):
            parts.append(f"תיאור: {call['description']}")
        if call.get("summary"):
            parts.append(f"תמצית: {call['summary']}")
        if call.get("location"):
            parts.append(f"מיקום: {call['location']}")
        if notes:
            parts.append(f"הערות מפעיל: {notes}")

        content = "\n".join(parts)
        title = f"{call.get('issue_type', 'שיחה')} - {call.get('cdes', call.get('name', 'לקוח'))}"

        item_data = {
            "type": "feedback",
            "title": title,
            "content": content,
            "source_call_id": call_id,
            "tags": [call.get("urgency", ""), call.get("branchname", "")],
        }

        # Generate embedding
        embedding = rag_retrieval.generate_embedding(content)
        if embedding:
            item_data["embedding"] = embedding

        result = knowledge_db.save_item(item_data)
        return jsonify({"ok": True, **result, "title": title})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ── Health ───────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "service": "urbangroup-backend"})


if __name__ == "__main__":
    print("Urban Group Backend API")
    print(f"Priority Demo: {PRIORITY_URL_DEMO}")
    print(f"Priority Real: {PRIORITY_URL_REAL}")
    print("Starting on http://localhost:5001")
    app.run(
        host="0.0.0.0",
        port=5001,
        debug=True,
        exclude_patterns=["*/WindowsApps/*", "*/encodings/*"],
    )
