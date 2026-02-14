"""
A1000 - Ariel WhatsApp Bot
Smart bot for the Ariel branch.
Accepts commands from the owner (Boaz) and runs reports.

Supported commands:
- דוח חייבים  → AR1000 debt customer report
- תעודות שלא חויבו  → AR10010 uncharged delivery notes
"""

import sys
import os
import uuid
import logging
from datetime import datetime

import boto3
from boto3.dynamodb.conditions import Key

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


def _format_debt_report(report):
    """Format AR1000 debt report as WhatsApp message."""
    lines = []
    lines.append("📊 *דוח חייבים — אריאל*")
    lines.append(f"תאריך: {datetime.utcnow().strftime('%d/%m/%Y %H:%M')}")
    lines.append(f"לקוחות עם יתרה: {report['filtered_customer_count']}")
    lines.append("")

    for c in report["customers"]:
        lines.append(f"• {c['cdes']} ({c['custname']}): *{c['balance']:,.0f}* ₪")

    lines.append("")
    lines.append(f"*סה״כ: {report['total_balance']:,.0f} ₪*")
    return "\n".join(lines)


def _format_uncharged_report(report):
    """Format AR10010 uncharged delivery report as WhatsApp message."""
    lines = []
    lines.append("📋 *תעודות משלוח שלא חויבו — אריאל*")
    lines.append(f"תאריך: {datetime.utcnow().strftime('%d/%m/%Y %H:%M')}")
    lines.append(f"תעודות: {report['document_count']}")
    lines.append("")

    for d in report["documents"]:
        lines.append(f"• ת.משלוח {d['docno']} | {d['cdes']} | {d['curdate']} | *{d['totprice']:,.0f}* ₪")

    lines.append("")
    lines.append(f"*סה״כ: {report['total_amount']:,.0f} ₪*")
    return "\n".join(lines)


def _run_debt_report():
    """Run AR1000 and return formatted text."""
    import ar1000_report
    report = ar1000_report.generate_report()
    return _format_debt_report(report)


def _run_uncharged_report():
    """Run AR10010 and return formatted text."""
    import ar10010_report
    report = ar10010_report.generate_report()
    return _format_uncharged_report(report)


def process_message(phone, name, text, msg_type="text", message_id="",
                    media_id="", caption=""):
    """Process an incoming WhatsApp message for Ariel.

    Only the owner (OWNER_PHONE) can issue commands.
    Others get a generic acknowledgment.
    """
    save_message(phone, name, text, msg_type, message_id)

    # Only owner can issue commands
    if phone != OWNER_PHONE:
        return "הודעתך התקבלה — צוות אריאל"

    # Only text messages can be commands
    if msg_type != "text":
        return "הודעתך התקבלה. שלח הודעת טקסט עם פקודה."

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

    if command == "debt_report":
        try:
            return _run_debt_report()
        except Exception as e:
            logger.error(f"AR1000 report error: {e}")
            return f"שגיאה בהפקת דוח חייבים: {e}"

    elif command == "uncharged_delivery":
        try:
            return _run_uncharged_report()
        except Exception as e:
            logger.error(f"AR10010 report error: {e}")
            return f"שגיאה בהפקת דוח תעודות: {e}"

    else:
        return parsed.get("reply", (
            "לא הבנתי את הבקשה.\n\n"
            "הפקודות הזמינות:\n"
            "• *דוח חייבים* — דוח יתרות לקוחות\n"
            "• *תעודות שלא חויבו* — תעודות משלוח פתוחות"
        ))
