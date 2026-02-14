"""
ALLM1000 - Ariel Command Parser
Analyzes WhatsApp messages using ChatGPT to identify commands for the Ariel bot.

Returns structured command data:
  - command: debt_report / uncharged_delivery / unknown
  - confidence: high / medium / low
  - reply: text reply if command is unknown
"""

import os
import json
import logging
from pathlib import Path

import requests

if os.environ.get("IS_LAMBDA") != "true":
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent.parent.parent.parent / ".env"
    load_dotenv(env_path)

logger = logging.getLogger("urbangroup.ALLM1000")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")

SYSTEM_PROMPT = """אתה עוזר חכם של חברת אריאל (סניף 102 של Urban Group).
תפקידך לזהות מה המשתמש רוצה מתוך הודעת WhatsApp, כולל סינונים אם צוינו.

התאריך היום: {today}

הפקודות הזמינות:
1. **debt_report** — דוח חייבים / יתרות לקוחות. דוגמאות: "דוח חייבים", "מה היתרות", "מי חייב לנו", "חובות", "מצב חייבים", "תראה לי את החובות"
2. **uncharged_delivery** — תעודות משלוח שלא חויבו. דוגמאות: "תעודות שלא חויבו", "תעודות פתוחות", "משלוחים שלא חויבו", "מה לא חויב", "תעודות משלוח"

אם ההודעה לא מתאימה לאף פקודה, החזר command=unknown.

החזר תמיד JSON בלבד (בלי markdown ובלי backticks) עם המבנה:
{
  "command": "debt_report" / "uncharged_delivery" / "unknown",
  "confidence": "high" / "medium" / "low",
  "reply": "תשובה קצרה בעברית אם command=unknown, אחרת ריק",
  "filters": {
    "customer_name": null,
    "min_amount": null,
    "date_from": null,
    "date_to": null
  }
}

הסבר על filters:
- customer_name: שם לקוח או מספר לקוח אם המשתמש ציין (טקסט חופשי). דוגמאות: "דוח חייבים ללקוח גרינברג", "תעודות של לקוח 1003"
- min_amount: סכום מינימלי אם צוין (מספר). דוגמאות: "חובות מעל 10000", "תעודות מעל 5000 שקל"
- date_from: תאריך התחלה בפורמט YYYY-MM-DD אם צוין. דוגמאות: "מינואר" = "{year}-01-01", "מהחודש האחרון" = חודש אחורה מהיום, "מתחילת השנה" = "{year}-01-01"
- date_to: תאריך סיום בפורמט YYYY-MM-DD אם צוין. דוגמאות: "עד דצמבר" = "{year}-12-31"
- אם המשתמש לא ציין סינון ספציפי — השאר את השדה null

כללים:
- אם אתה לא בטוח לגמרי אבל זה נשמע קשור — תן confidence=medium ותבחר את הפקודה הכי מתאימה
- אם זה לא קשור בכלל לאף פקודה — command=unknown ובשדה reply תכתוב הודעה ידידותית שמסבירה מה אתה יכול לעשות
- בשדה reply כשcommand=unknown, תזכיר את שתי הפקודות הזמינות ואת אפשרויות הסינון
- החזר JSON תקין בלבד"""


def _get_system_prompt():
    """Build system prompt with current date."""
    from datetime import datetime
    today = datetime.utcnow().strftime("%Y-%m-%d")
    year = datetime.utcnow().strftime("%Y")
    return SYSTEM_PROMPT.replace("{today}", today).replace("{year}", year)


def _call_openai(text):
    """Call ChatGPT to parse a command."""
    if not OPENAI_API_KEY:
        logger.error("OPENAI_API_KEY not set")
        return None

    resp = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": OPENAI_MODEL,
            "messages": [
                {"role": "system", "content": _get_system_prompt()},
                {"role": "user", "content": text},
            ],
            "max_tokens": 300,
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def _parse_response(raw_text):
    """Parse JSON from LLM response."""
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()
    return json.loads(text)


def parse_command(text):
    """Parse a user message and identify the command.

    Args:
        text: User message text

    Returns:
        dict: {command, confidence, reply} or None on failure
    """
    try:
        logger.info(f"ALLM1000: Parsing command from text ({len(text)} chars)")
        raw = _call_openai(text)
        result = _parse_response(raw)
        logger.info(f"ALLM1000: Result: {result}")
        return result
    except json.JSONDecodeError as e:
        logger.error(f"ALLM1000: Failed to parse LLM JSON: {e}")
        return None
    except Exception as e:
        logger.error(f"ALLM1000: Command parsing failed: {e}")
        return None
