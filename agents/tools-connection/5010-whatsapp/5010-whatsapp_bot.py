"""
5010-WhatsApp Bot Agent (Ariel)
Connects to WhatsApp Cloud API (Meta) for the Ariel branch phone number.
Separate Meta App from 5000 (maintenance).
"""

import sys
import os
import io
import json
from pathlib import Path
from datetime import datetime

if not isinstance(sys.stdout, io.TextIOWrapper) or sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import requests

if os.environ.get("IS_LAMBDA") != "true":
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
    load_dotenv(env_path)

WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID_ARIEL", "")
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN_ARIEL", "")
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN_ARIEL", "")

API_URL = f"https://graph.facebook.com/v21.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
MEDIA_URL = f"https://graph.facebook.com/v21.0/{WHATSAPP_PHONE_NUMBER_ID}/media"


def upload_media(file_bytes, mime_type="application/pdf", filename="document.pdf"):
    """Upload media to WhatsApp Cloud API.

    Returns:
        str: media_id for use in send_document
    """
    headers = {"Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}"}
    resp = requests.post(
        MEDIA_URL,
        headers=headers,
        files={"file": (filename, file_bytes, mime_type)},
        data={"messaging_product": "whatsapp"},
    )
    resp.raise_for_status()
    return resp.json().get("id")


def send_document(phone, file_bytes, filename="document.pdf", caption=""):
    """Upload a document and send it via WhatsApp.

    Args:
        phone: Recipient phone number
        file_bytes: Document content as bytes
        filename: Display filename
        caption: Optional caption text
    """
    media_id = upload_media(file_bytes, "application/pdf", filename)

    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone,
        "type": "document",
        "document": {
            "id": media_id,
            "filename": filename,
        },
    }
    if caption:
        payload["document"]["caption"] = caption

    resp = requests.post(API_URL, json=payload, headers=headers)
    resp.raise_for_status()
    return resp.json()


def send_message(phone, text):
    """Send a text message to a WhatsApp number."""
    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone,
        "type": "text",
        "text": {"body": text},
    }
    resp = requests.post(API_URL, json=payload, headers=headers)
    resp.raise_for_status()
    return resp.json()


def send_template(phone, template_name, language="he", parameters=None):
    """Send a template message."""
    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }
    template = {
        "name": template_name,
        "language": {"code": language},
    }
    if parameters:
        template["components"] = [
            {
                "type": "body",
                "parameters": [{"type": "text", "text": str(p)} for p in parameters],
            }
        ]
    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "template",
        "template": template,
    }
    resp = requests.post(API_URL, json=payload, headers=headers)
    resp.raise_for_status()
    return resp.json()


def verify_webhook(mode, token, challenge):
    """Verify webhook subscription from Meta."""
    if mode == "subscribe" and token == WHATSAPP_VERIFY_TOKEN:
        return challenge
    return None


def handle_incoming(payload):
    """Process an incoming webhook payload from Meta.

    Returns:
        list of processed messages [{phone, name, text, type, timestamp, message_id, media_id, caption}]
    """
    messages = []

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})

            contacts = {
                c["wa_id"]: c.get("profile", {}).get("name", "")
                for c in value.get("contacts", [])
            }

            for msg in value.get("messages", []):
                phone = msg.get("from", "")
                name = contacts.get(phone, "")
                timestamp = msg.get("timestamp", "")
                msg_type = msg.get("type", "")

                text = ""
                media_id = ""
                caption = ""
                if msg_type == "text":
                    text = msg.get("text", {}).get("body", "")
                elif msg_type == "image":
                    text = "[תמונה]"
                    media_id = msg.get("image", {}).get("id", "")
                    caption = msg.get("image", {}).get("caption", "")
                elif msg_type == "document":
                    text = "[מסמך]"
                    media_id = msg.get("document", {}).get("id", "")
                elif msg_type == "audio":
                    text = "[הודעה קולית]"
                    media_id = msg.get("audio", {}).get("id", "")
                elif msg_type == "location":
                    text = "[מיקום]"
                else:
                    text = f"[{msg_type}]"

                messages.append({
                    "phone": phone,
                    "name": name,
                    "text": text,
                    "type": msg_type,
                    "timestamp": timestamp,
                    "message_id": msg.get("id", ""),
                    "media_id": media_id,
                    "caption": caption,
                })

    return messages


def mark_as_read(message_id):
    """Mark a message as read (blue checkmarks)."""
    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "status": "read",
        "message_id": message_id,
    }
    requests.post(API_URL, json=payload, headers=headers)
