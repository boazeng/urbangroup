"""
A1000 - Ariel WhatsApp Bot
Smart bot for the Ariel branch.
Accepts commands from the owner (Boaz) and runs reports as PDF.

Supported commands:
- דוח חייבים  → AR1000 debt customer report (PDF)
- תעודות שלא חויבו  → AR10010 uncharged delivery notes (PDF)
"""

import os
import uuid
import logging
from datetime import datetime

import boto3

logger = logging.getLogger("urbangroup.A1000")

_dynamodb = boto3.resource("dynamodb", region_name=os.environ.get("AWS_REGION", "us-east-1"))

ARIEL_MESSAGES_TABLE_NAME = os.environ.get("ARIEL_MESSAGES_TABLE", "urbangroup-ariel-messages-prod")
_ariel_messages_table = _dynamodb.Table(ARIEL_MESSAGES_TABLE_NAME)

OWNER_PHONE = "972542777757"


def save_message(phone, name, text, msg_type="text", message_id=""):
    """Save an incoming message to the Ariel messages table."""
    now = datetime.utcnow().isoformat() + "Z"
    item_id = str(uuid.uuid4())

    item = {
        "id": item_id,
        "phone": phone,
        "name": name,
        "text": text,
        "msg_type": msg_type,
        "message_id": message_id,
        "status": "new",
        "created_at": now,
    }

    _ariel_messages_table.put_item(Item=item)
    logger.info(f"Ariel message saved: {item_id} from {phone}")
    return item_id


def _set_real_env():
    """Set Priority URL to real (ebyael) for Ariel reports."""
    real_url = os.environ.get("PRIORITY_URL_REAL", "").rstrip("/")
    if real_url:
        import ar1000_report
        import ar10010_report
        ar1000_report.PRIORITY_URL = real_url
        ar10010_report.PRIORITY_URL = real_url


def _create_task(description):
    """Create a task in the delivery notes DB."""
    _dn_db = None
    try:
        import delivery_notes_db
        _dn_db = delivery_notes_db
    except ImportError:
        import importlib.util
        db_path = os.path.normpath(os.path.join(
            os.path.dirname(__file__), "..", "..", "..", "..",
            "database", "maintenance", "delivery_notes_db.py",
        ))
        spec = importlib.util.spec_from_file_location("delivery_notes_db", db_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _dn_db = mod
    _dn_db.save_task(description)
    logger.info(f"Task created from WhatsApp: {description}")


def _run_debt_report_pdf(phone, filters=None):
    """Run AR1000, generate PDF, send via WhatsApp."""
    _set_real_env()
    import ar1000_report
    import pdf_generator
    import whatsapp_bot_ariel

    report = ar1000_report.generate_report(filters=filters)
    pdf_bytes = pdf_generator.generate_debt_report_pdf(report)

    now = datetime.utcnow().strftime("%Y%m%d_%H%M")
    filename = f"debt_report_{now}.pdf"
    caption = f"דוח חייבים — {report['filtered_customer_count']} לקוחות, סה״כ {report['total_balance']:,.0f} ₪"

    whatsapp_bot_ariel.send_document(phone, pdf_bytes, filename, caption)
    logger.info(f"Debt report PDF sent to {phone}: {filename}")


def _run_uncharged_report_pdf(phone, filters=None):
    """Run AR10010, generate PDF, send via WhatsApp."""
    _set_real_env()
    import ar10010_report
    import pdf_generator
    import whatsapp_bot_ariel

    report = ar10010_report.generate_report(filters=filters)
    pdf_bytes = pdf_generator.generate_uncharged_report_pdf(report)

    now = datetime.utcnow().strftime("%Y%m%d_%H%M")
    filename = f"uncharged_delivery_{now}.pdf"
    caption = f"תעודות משלוח שלא חויבו — {report['document_count']} תעודות, סה״כ {report['total_amount']:,.0f} ₪"

    whatsapp_bot_ariel.send_document(phone, pdf_bytes, filename, caption)
    logger.info(f"Uncharged delivery PDF sent to {phone}: {filename}")


def process_message(phone, name, text, msg_type="text", message_id="",
                    media_id="", caption=""):
    """Process an incoming WhatsApp message for Ariel.

    Only the owner (OWNER_PHONE) can issue commands.
    Others get a generic acknowledgment.

    Returns:
        str: Text reply, or None if a PDF was sent instead.
    """
    save_message(phone, name, text, msg_type, message_id)

    # Only owner can issue commands
    if phone != OWNER_PHONE:
        return "הודעתך התקבלה — צוות אריאל"

    # Only text messages can be commands
    if msg_type != "text":
        return "הודעתך התקבלה. שלח הודעת טקסט עם פקודה."

    # Task creation: message starting with "מטלה"
    stripped = text.strip()
    if stripped.startswith("מטלה"):
        task_text = stripped[len("מטלה"):].strip().lstrip("-").lstrip(":").strip()
        if task_text:
            try:
                _create_task(task_text)
                return f"מטלה נוספה: {task_text} ✓"
            except Exception as e:
                logger.error(f"Task creation failed: {e}")
                return f"שגיאה ביצירת מטלה: {e}"
        else:
            return "שלח: מטלה <תיאור המטלה>"

    # Use LLM to parse command
    import allm1000_command_parser
    parsed = allm1000_command_parser.parse_command(text)

    if not parsed:
        return (
            "לא הצלחתי לעבד את הבקשה.\n\n"
            "הפקודות הזמינות:\n"
            "• *דוח חייבים* — דוח יתרות לקוחות\n"
            "• *תעודות שלא חויבו* — תעודות משלוח פתוחות"
        )

    command = parsed.get("command")
    filters = parsed.get("filters") or {}
    # Remove null/None values from filters
    filters = {k: v for k, v in filters.items() if v is not None}

    if command == "debt_report":
        try:
            _run_debt_report_pdf(phone, filters)
            return "דוח חייבים נשלח בהצלחה ✓"
        except Exception as e:
            logger.error(f"AR1000 report error: {e}")
            return f"שגיאה בהפקת דוח חייבים: {e}"

    elif command == "uncharged_delivery":
        try:
            _run_uncharged_report_pdf(phone, filters)
            return "דוח תעודות משלוח נשלח בהצלחה ✓"
        except Exception as e:
            logger.error(f"AR10010 report error: {e}")
            return f"שגיאה בהפקת דוח תעודות: {e}"

    else:
        return parsed.get("reply", (
            "קיבלתי את ההודעה, לא נדרשת פעולה מצידי.\n\n"
            "הפקודות הזמינות:\n"
            "• *דוח חייבים* — דוח יתרות לקוחות\n"
            "• *תעודות שלא חויבו* — תעודות משלוח פתוחות"
        ))
