"""
5000-WhatsApp Bot Agent
Connects to WhatsApp Cloud API (Meta) for 1:1 messaging with customers and technicians.
"""

import sys
import os
import io
import json
from pathlib import Path
from datetime import datetime

# Fix Windows console encoding for Hebrew
if not isinstance(sys.stdout, io.TextIOWrapper) or sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import requests

if os.environ.get("IS_LAMBDA") != "true":
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
    load_dotenv(env_path)

WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "")
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN", "")

API_URL = f"https://graph.facebook.com/v21.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"


def validate_config():
    missing = []
    if not WHATSAPP_PHONE_NUMBER_ID:
        missing.append("WHATSAPP_PHONE_NUMBER_ID")
    if not WHATSAPP_ACCESS_TOKEN:
        missing.append("WHATSAPP_ACCESS_TOKEN")
    if missing:
        print(f"Error: Missing environment variables: {', '.join(missing)}")
        print(f"Please fill in the .env file at: {env_path}")
        return False
    return True


def send_message(phone, text):
    """Send a text message to a WhatsApp number.

    Args:
        phone: Phone number with country code (e.g. '972501234567')
        text: Message text

    Returns:
        dict with API response
    """
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

    print(f"Sending message to {phone}: {text[:50]}...")
    resp = requests.post(API_URL, json=payload, headers=headers)
    resp.raise_for_status()

    result = resp.json()
    msg_id = result.get("messages", [{}])[0].get("id", "N/A")
    print(f"Message sent → ID: {msg_id}")
    return result


def send_template(phone, template_name, language="he", parameters=None):
    """Send a template message (required for first contact with a user).

    Args:
        phone: Phone number with country code
        template_name: Name of the approved template
        language: Language code (default 'he' for Hebrew)
        parameters: Optional list of parameter values for the template

    Returns:
        dict with API response
    """
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
                "parameters": [
                    {"type": "text", "text": str(p)} for p in parameters
                ],
            }
        ]

    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "template",
        "template": template,
    }

    print(f"Sending template '{template_name}' to {phone}...")
    resp = requests.post(API_URL, json=payload, headers=headers)
    resp.raise_for_status()

    result = resp.json()
    msg_id = result.get("messages", [{}])[0].get("id", "N/A")
    print(f"Template sent → ID: {msg_id}")
    return result


def verify_webhook(mode, token, challenge):
    """Verify webhook subscription from Meta.

    Args:
        mode: hub.mode from query string
        token: hub.verify_token from query string
        challenge: hub.challenge from query string

    Returns:
        challenge string if valid, None otherwise
    """
    if mode == "subscribe" and token == WHATSAPP_VERIFY_TOKEN:
        print("Webhook verified successfully")
        return challenge
    print(f"Webhook verification failed: mode={mode}, token mismatch")
    return None


def handle_incoming(payload):
    """Process an incoming webhook payload from Meta.

    Args:
        payload: The JSON body from Meta's webhook POST

    Returns:
        list of processed messages [{phone, name, text, timestamp}]
    """
    messages = []

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})

            # Extract contact info
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
                if msg_type == "text":
                    text = msg.get("text", {}).get("body", "")
                elif msg_type == "image":
                    text = "[תמונה]"
                elif msg_type == "document":
                    text = "[מסמך]"
                elif msg_type == "audio":
                    text = "[הודעה קולית]"
                elif msg_type == "location":
                    text = "[מיקום]"
                else:
                    text = f"[{msg_type}]"

                print(f"Incoming from {phone} ({name}): {text[:80]}")

                messages.append({
                    "phone": phone,
                    "name": name,
                    "text": text,
                    "type": msg_type,
                    "timestamp": timestamp,
                    "message_id": msg.get("id", ""),
                })

    return messages


def mark_as_read(message_id):
    """Mark a message as read (blue checkmarks).

    Args:
        message_id: The wamid of the message to mark as read
    """
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


def main():
    print("=" * 60)
    print("  5000-WhatsApp Bot - Meta Cloud API")
    print("=" * 60)
    print()

    if not validate_config():
        sys.exit(1)

    print(f"Phone Number ID: {WHATSAPP_PHONE_NUMBER_ID}")
    print()

    if len(sys.argv) < 3:
        print("Usage:")
        print("  python 5000-whatsapp_bot.py send <phone> <message>")
        print("  python 5000-whatsapp_bot.py template <phone> <template_name>")
        print()
        print("Examples:")
        print('  python 5000-whatsapp_bot.py send 972501234567 "שלום!"')
        print('  python 5000-whatsapp_bot.py template 972501234567 hello_world')
        sys.exit(1)

    command = sys.argv[1]
    phone = sys.argv[2]

    if command == "send":
        text = sys.argv[3] if len(sys.argv) > 3 else "שלום מ-Urban Group!"
        try:
            result = send_message(phone, text)
            print(f"OK: {json.dumps(result, indent=2)}")
        except requests.exceptions.HTTPError as e:
            print(f"Error: HTTP {e.response.status_code}")
            print(f"Response: {e.response.text}")

    elif command == "template":
        template_name = sys.argv[3] if len(sys.argv) > 3 else "hello_world"
        try:
            result = send_template(phone, template_name, language="en_US")
            print(f"OK: {json.dumps(result, indent=2)}")
        except requests.exceptions.HTTPError as e:
            print(f"Error: HTTP {e.response.status_code}")
            print(f"Response: {e.response.text}")

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
