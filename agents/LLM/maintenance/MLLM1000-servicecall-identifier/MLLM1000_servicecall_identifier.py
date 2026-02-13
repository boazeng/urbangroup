"""
MLLM1000 - Service Call Identifier
Analyzes WhatsApp messages and images using ChatGPT to identify maintenance issues.

Returns structured service call data:
  - issue_type: סוג התקלה
  - description: תיאור
  - urgency: דחיפות (low/medium/high/critical)
  - is_service_call: bool - האם זו קריאת שירות
  - summary: תמצית לשליחה ללקוח
"""

import os
import json
import base64
import logging
from pathlib import Path

import requests

if os.environ.get("IS_LAMBDA") != "true":
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent.parent.parent.parent / ".env"
    load_dotenv(env_path)

logger = logging.getLogger("urbangroup.MLLM1000")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")

WHATSAPP_ACCESS_TOKEN = os.getenv("WHATSAPP_ACCESS_TOKEN", "")

SYSTEM_PROMPT = """אתה מנתח קריאות שירות של חברת Urban Group - חברה לאחזקת מבנים ומתקני חניה.
תפקידך לנתח הודעות ותמונות שמגיעות מלקוחות דרך WhatsApp ולזהות קריאות שירות.

עליך להחזיר תמיד JSON בלבד (בלי טקסט נוסף) עם המבנה הבא:
{
  "is_service_call": true/false,
  "issue_type": "סוג התקלה (נזילה/שבר/תקלת חשמל/בעיית חניה/תחזוקה שוטפת/אחר)",
  "description": "תיאור קצר של הבעיה",
  "urgency": "low/medium/high/critical",
  "location": "מיקום אם ניתן לזהות מהתמונה או הטקסט",
  "summary": "תמצית קצרה בעברית לשליחה חזרה ללקוח"
}

כללים:
- אם התמונה או ההודעה מתארת תקלה - סמן is_service_call=true
- אם זו שאלה כללית או הודעה שלא קשורה לתקלה - סמן is_service_call=false
- urgency: low=תחזוקה שוטפת, medium=תקלה לא דחופה, high=תקלה שמשפיעה על שימוש, critical=סכנה בטיחותית
- החזר JSON תקין בלבד, בלי markdown ובלי backticks"""


def download_whatsapp_media(media_id):
    """Download media from WhatsApp Cloud API.

    Args:
        media_id: The WhatsApp media ID

    Returns:
        tuple: (image_bytes, mime_type) or (None, None) on failure
    """
    if not WHATSAPP_ACCESS_TOKEN:
        logger.error("WHATSAPP_ACCESS_TOKEN not set")
        return None, None

    headers = {"Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}"}

    # Step 1: Get the media URL
    url_resp = requests.get(
        f"https://graph.facebook.com/v21.0/{media_id}",
        headers=headers,
    )
    url_resp.raise_for_status()
    media_url = url_resp.json().get("url")
    mime_type = url_resp.json().get("mime_type", "image/jpeg")

    if not media_url:
        logger.error(f"No URL returned for media_id {media_id}")
        return None, None

    # Step 2: Download the actual media
    media_resp = requests.get(media_url, headers=headers)
    media_resp.raise_for_status()

    logger.info(f"Downloaded media {media_id}: {len(media_resp.content)} bytes, {mime_type}")
    return media_resp.content, mime_type


def _parse_llm_response(raw_text):
    """Parse JSON from LLM response, handling markdown code blocks.

    Args:
        raw_text: Raw text from ChatGPT

    Returns:
        dict: Parsed service call data
    """
    text = raw_text.strip()
    # Strip markdown code block if present
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first line (```json) and last line (```)
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()

    return json.loads(text)


def _call_openai(messages):
    """Make a ChatGPT API call.

    Args:
        messages: List of message dicts for the API

    Returns:
        str: Raw response text from ChatGPT
    """
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
            "messages": messages,
            "max_tokens": 500,
        },
        timeout=30,
    )
    resp.raise_for_status()
    result = resp.json()
    return result["choices"][0]["message"]["content"]


def analyze_image(image_bytes, mime_type="image/jpeg", caption=""):
    """Analyze an image using ChatGPT Vision.

    Returns:
        dict: Structured service call data
    """
    b64_image = base64.b64encode(image_bytes).decode("utf-8")

    user_content = []
    if caption:
        user_content.append({"type": "text", "text": f"הודעה מהלקוח: {caption}"})
    user_content.append({
        "type": "image_url",
        "image_url": {
            "url": f"data:{mime_type};base64,{b64_image}",
        },
    })

    raw = _call_openai([
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ])
    return _parse_llm_response(raw)


def analyze_text(text):
    """Analyze a text message using ChatGPT.

    Returns:
        dict: Structured service call data
    """
    raw = _call_openai([
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": text},
    ])
    return _parse_llm_response(raw)


def process(msg_type, text="", media_id="", caption=""):
    """Main entry point - analyze a message and return structured service call data.

    Args:
        msg_type: Message type (text, image, audio, etc.)
        text: Message text (for text messages)
        media_id: WhatsApp media ID (for image/document/audio)
        caption: Image caption if provided

    Returns:
        dict: Structured service call data, or None if analysis failed.
              Keys: is_service_call, issue_type, description, urgency, location, summary
    """
    try:
        if msg_type == "image" and media_id:
            logger.info(f"MLLM1000: Analyzing image (media_id={media_id})")
            image_bytes, mime_type = download_whatsapp_media(media_id)
            if not image_bytes:
                logger.error("MLLM1000: Failed to download image")
                return None
            result = analyze_image(image_bytes, mime_type, caption)

        elif msg_type == "text" and text:
            logger.info(f"MLLM1000: Analyzing text ({len(text)} chars)")
            result = analyze_text(text)

        else:
            return None

        logger.info(f"MLLM1000: Analysis result: {result}")
        return result

    except json.JSONDecodeError as e:
        logger.error(f"MLLM1000: Failed to parse LLM JSON: {e}")
        return None
    except Exception as e:
        logger.error(f"MLLM1000: Analysis failed: {e}")
        return None
