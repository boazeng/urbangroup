"""
M10010 - Troubleshooting Script Bot
Conducts structured WhatsApp conversations to collect service call details.
Uses interactive buttons for structured questions and free-text for details.

Flow: M1000 detects service call → hands off to M10010 → M10010 asks questions
     → collects data → saves enriched service call to DynamoDB.
"""

import os
import uuid
import time
import logging
from datetime import datetime

logger = logging.getLogger("urbangroup.M10010")

# Lazy-load DB modules
_session_db = None
_maint_db = None

SESSION_TTL_SECONDS = 30 * 60  # 30 minutes

# ── Step Definitions ──────────────────────────────────────────

STEPS = [
    "CONFIRM_ISSUE",
    "LOCATION_TYPE",
    "LOCATION_DETAIL",
    "DEVICE_ID",
    "DEVICE_ID_INPUT",
    "PROBLEM_DETAIL",
    "URGENCY",
    "SUMMARY",
    "DONE",
]

BRANCH_MAP = {
    "energy": "108",
    "parking": "026",
    "unknown": "001",
}

URGENCY_MAP = {
    "low": "נמוכה",
    "medium": "בינונית",
    "high": "גבוהה",
    "critical": "קריטית",
}

BRANCH_DISPLAY = {
    "energy": "מתקן טעינה",
    "parking": "מתקן חניה",
    "unknown": "אחר",
}


def _get_session_db():
    global _session_db
    if _session_db is None:
        try:
            from database.maintenance import troubleshoot_sessions_db
            _session_db = troubleshoot_sessions_db
        except ImportError:
            import importlib.util
            db_path = os.path.join(
                os.path.dirname(__file__), "..", "..", "..", "..",
                "database", "maintenance", "troubleshoot_sessions_db.py",
            )
            db_path = os.path.normpath(db_path)
            spec = importlib.util.spec_from_file_location("troubleshoot_sessions_db", db_path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            _session_db = mod
    return _session_db


def _get_maint_db():
    global _maint_db
    if _maint_db is None:
        try:
            from database.maintenance import maintenance_db
            _maint_db = maintenance_db
        except ImportError:
            import importlib.util
            db_path = os.path.join(
                os.path.dirname(__file__), "..", "..", "..", "..",
                "database", "maintenance", "maintenance_db.py",
            )
            db_path = os.path.normpath(db_path)
            spec = importlib.util.spec_from_file_location("maintenance_db", db_path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            _maint_db = mod
    return _maint_db


def _get_technician():
    """Return default technician login based on Priority environment."""
    url = os.environ.get("PRIORITY_URL", "")
    if "ebyael" in url:
        return "צחי"
    return "יוסי"


# ── Skip Logic ────────────────────────────────────────────────

def _should_skip_step(step, data):
    """Determine if a step can be skipped based on existing data."""
    if step == "LOCATION_TYPE":
        return data.get("branch_context", "unknown") != "unknown"
    if step == "LOCATION_DETAIL":
        return bool(data.get("location"))
    if step == "DEVICE_ID":
        return bool(data.get("device_number"))
    if step == "PROBLEM_DETAIL":
        return len(data.get("description", "")) > 20
    if step == "URGENCY":
        return data.get("urgency") == "critical"
    return False


def _get_next_step(current_step, data):
    """Get the next step, skipping any that have sufficient data."""
    idx = STEPS.index(current_step)
    for next_step in STEPS[idx + 1:]:
        if next_step == "DEVICE_ID_INPUT":
            continue  # Only reached via DEVICE_ID button
        if next_step == "DONE":
            return "SUMMARY"
        if not _should_skip_step(next_step, data):
            return next_step
        skipped = data.get("skipped_steps", [])
        if next_step not in skipped:
            skipped.append(next_step)
            data["skipped_steps"] = skipped
    return "SUMMARY"


# ── Step Message Builders ─────────────────────────────────────

def _build_step_message(step, data):
    """Build the message and optional buttons for a given step.

    Returns:
        dict: {"text": "...", "buttons": [...] or None, "header": "..."}
    """
    if step == "CONFIRM_ISSUE":
        issue = data.get("issue_type", "לא ידוע")
        return {
            "text": f"שלום! זיהינו שיש לך תקלה.\nסוג התקלה: {issue}\n\nהאם זה מתאר נכון את הבעיה?",
            "header": "אבחון תקלה",
            "buttons": [
                {"id": "confirm_yes", "title": "כן, נכון"},
                {"id": "confirm_no", "title": "לא, אחר"},
                {"id": "cancel", "title": "ביטול"},
            ],
        }

    if step == "LOCATION_TYPE":
        return {
            "text": "היכן ממוקם המתקן/המכשיר?",
            "buttons": [
                {"id": "loc_parking", "title": "מתקן חניה"},
                {"id": "loc_energy", "title": "מתקן טעינה"},
                {"id": "loc_other", "title": "אחר"},
            ],
        }

    if step == "LOCATION_DETAIL":
        return {
            "text": "באיזה כתובת/מיקום נמצא המתקן?\n(שלח הודעת טקסט עם הכתובת)",
            "buttons": None,
        }

    if step == "DEVICE_ID":
        return {
            "text": "האם יש לך מספר מכשיר/מתקן?",
            "buttons": [
                {"id": "device_yes", "title": "כן, יש"},
                {"id": "device_no", "title": "לא יודע"},
                {"id": "device_none", "title": "אין מספר"},
            ],
        }

    if step == "DEVICE_ID_INPUT":
        return {
            "text": "שלח את מספר המכשיר/מתקן:",
            "buttons": None,
        }

    if step == "PROBLEM_DETAIL":
        return {
            "text": "תאר בקצרה את הבעיה:\n(לדוגמה: \"לא נדלק\", \"יש רעש\", \"נזילת מים\")",
            "buttons": None,
        }

    if step == "URGENCY":
        return {
            "text": "מה רמת הדחיפות?",
            "buttons": [
                {"id": "urgency_low", "title": "לא דחוף"},
                {"id": "urgency_high", "title": "דחוף"},
                {"id": "urgency_critical", "title": "מערכת מושבתת"},
            ],
        }

    if step == "SUMMARY":
        issue = data.get("issue_type", "לא ידוע")
        branch = BRANCH_DISPLAY.get(data.get("branch_context", "unknown"), "לא ידוע")
        location = data.get("location", "") or "לא צוין"
        device = data.get("device_number", "") or "לא צוין"
        description = data.get("description", "") or "לא צוין"
        urgency = URGENCY_MAP.get(data.get("urgency", "medium"), "בינונית")

        summary = (
            f"סיכום קריאת השירות:\n\n"
            f"סוג: {issue}\n"
            f"מיקום: {branch} - {location}\n"
            f"מכשיר: {device}\n"
            f"תיאור: {description}\n"
            f"דחיפות: {urgency}\n\n"
            f"לאשר פתיחת קריאת שירות?"
        )
        return {
            "text": summary,
            "buttons": [
                {"id": "summary_confirm", "title": "אישור ושליחה"},
                {"id": "summary_cancel", "title": "ביטול"},
                {"id": "summary_edit", "title": "תיקון פרט"},
            ],
        }

    return {"text": "שגיאה פנימית", "buttons": None}


# ── Step Input Processing ─────────────────────────────────────

def _process_step_input(step, data, text, msg_type):
    """Process user input for the current step.

    Returns:
        str: next step to advance to, or None if input is invalid.
    Updates data dict in-place with collected info.
    """
    if step == "CONFIRM_ISSUE":
        if text == "confirm_yes":
            return _get_next_step(step, data)
        if text == "confirm_no":
            data["issue_type"] = ""
            return "PROBLEM_DETAIL"
        if text == "cancel":
            return "CANCELLED"
        return None

    if step == "LOCATION_TYPE":
        mapping = {
            "loc_parking": "parking",
            "loc_energy": "energy",
            "loc_other": "unknown",
        }
        if text in mapping:
            data["branch_context"] = mapping[text]
            return _get_next_step(step, data)
        return None

    if step == "LOCATION_DETAIL":
        if msg_type in ("text", "interactive") and text and not text.startswith("["):
            data["location"] = text
            return _get_next_step(step, data)
        return None

    if step == "DEVICE_ID":
        if text == "device_yes":
            return "DEVICE_ID_INPUT"
        if text in ("device_no", "device_none"):
            return _get_next_step(step, data)
        return None

    if step == "DEVICE_ID_INPUT":
        if msg_type in ("text", "interactive") and text and not text.startswith("["):
            data["device_number"] = text
            return _get_next_step("DEVICE_ID", data)
        return None

    if step == "PROBLEM_DETAIL":
        if msg_type in ("text", "interactive") and text and not text.startswith("["):
            data["description"] = text
            return _get_next_step(step, data)
        return None

    if step == "URGENCY":
        mapping = {
            "urgency_low": "low",
            "urgency_high": "high",
            "urgency_critical": "critical",
        }
        if text in mapping:
            data["urgency"] = mapping[text]
            if text == "urgency_critical":
                data["is_system_down"] = True
            return _get_next_step(step, data)
        return None

    if step == "SUMMARY":
        if text == "summary_confirm":
            return "DONE"
        if text == "summary_cancel":
            return "CANCELLED"
        if text == "summary_edit":
            return "LOCATION_TYPE"
        return None

    return None


# ── Public API ────────────────────────────────────────────────

def get_active_session(phone):
    """Check if phone has an active (non-expired) troubleshooting session.

    Returns:
        dict session data, or None.
    """
    db = _get_session_db()
    session = db.get_session(phone)
    if session and session.get("step") not in ("DONE", None):
        if session.get("expires_at", 0) > time.time():
            return session
    return None


def start_session(phone, name, llm_result, parsed_data, message_id="", media_id=""):
    """Start a new troubleshooting session.

    Returns:
        dict: {"text": "...", "buttons": [...]} for the first question.
    """
    db = _get_session_db()
    now = datetime.utcnow().isoformat() + "Z"

    session_data = {
        "phone": phone,
        "session_id": str(uuid.uuid4()),
        "name": name,
        "step": "CONFIRM_ISSUE",
        "created_at": now,
        "updated_at": now,
        "expires_at": int(time.time()) + SESSION_TTL_SECONDS,
        "issue_type": llm_result.get("issue_type", ""),
        "branch_context": llm_result.get("branch_context", "unknown"),
        "location": llm_result.get("location", ""),
        "device_number": (
            llm_result.get("device_number", "")
            or parsed_data.get("מספר מכשיר", "")
        ),
        "description": llm_result.get("description", ""),
        "urgency": llm_result.get("urgency", "medium"),
        "customer_number": (
            parsed_data.get("מספר מנוי", "")
            or llm_result.get("customer_number", "")
        ),
        "customer_name": (
            parsed_data.get("שם הלקוח", "")
            or llm_result.get("customer_name", "")
        ),
        "contact_name": (
            parsed_data.get("שם איש קשר", "")
            or llm_result.get("contact_name", "")
        ),
        "is_system_down": bool(llm_result.get("is_system_down")),
        "llm_result": llm_result,
        "parsed_data": parsed_data,
        "skipped_steps": [],
        "original_message_id": message_id,
        "original_media_id": media_id,
    }

    db.save_session(session_data)
    logger.info(f"[M10010] Session started for {phone}, issue={session_data['issue_type']}")

    return _build_step_message("CONFIRM_ISSUE", session_data)


def process_message(phone, text, msg_type="text", caption=""):
    """Process an incoming message for an active troubleshooting session.

    Returns:
        dict: {"text": "...", "buttons": [...]} or {"text": "..."} or None
    """
    db = _get_session_db()
    session = db.get_session(phone)

    if not session:
        return None

    current_step = session.get("step", "CONFIRM_ISSUE")
    logger.info(f"[M10010] Processing {phone} step={current_step} input={text[:50]}")

    next_step = _process_step_input(current_step, session, text, msg_type)

    if next_step is None:
        # Invalid input - re-send current step prompt with a nudge
        msg = _build_step_message(current_step, session)
        if msg.get("buttons"):
            msg["text"] = "אנא בחר אחת מהאפשרויות:\n\n" + msg["text"]
        return msg

    if next_step == "CANCELLED":
        db.delete_session(phone)
        logger.info(f"[M10010] Session cancelled by {phone}")
        return {"text": "הפנייה בוטלה. אם תרצה לפתוח קריאת שירות, שלח הודעה חדשה."}

    if next_step == "DONE":
        service_call_id = _save_completed_service_call(session)
        db.update_session_step(phone, "DONE")
        logger.info(f"[M10010] Session completed for {phone}, service_call={service_call_id}")
        return {"text": "קריאת השירות נפתחה בהצלחה!\nניצור איתך קשר בהקדם. תודה!"}

    # Advance to next step
    session["step"] = next_step
    session["updated_at"] = datetime.utcnow().isoformat() + "Z"
    session["expires_at"] = int(time.time()) + SESSION_TTL_SECONDS
    db.update_session(phone, session)

    return _build_step_message(next_step, session)


def _save_completed_service_call(session):
    """Save completed troubleshooting data as a service call in DynamoDB.

    Returns:
        str: service call ID
    """
    maint_db = _get_maint_db()

    phone = session.get("phone", "")
    name = session.get("name", "")
    description = session.get("description", "")
    branch_context = session.get("branch_context", "unknown")
    branchname = BRANCH_MAP.get(branch_context, "001")

    fault_text = f"{description}\nטלפון: {phone}"
    if session.get("location"):
        fault_text += f"\nמיקום: {session['location']}"

    breakstart = ""
    if session.get("is_system_down"):
        breakstart = datetime.utcnow().strftime("%Y-%m-%d %H:%M")

    result = maint_db.save_service_call(
        phone=phone,
        name=name,
        issue_type=session.get("issue_type", ""),
        description=description,
        urgency=session.get("urgency", "medium"),
        location=session.get("location", ""),
        summary=session.get("description", ""),
        message_id=session.get("original_message_id", ""),
        media_id=session.get("original_media_id", ""),
        custname=session.get("customer_number", "") or "99999",
        cdes=session.get("customer_name", "") or name,
        sernum=session.get("device_number", ""),
        branchname=branchname,
        technicianlogin=_get_technician(),
        contact_name=session.get("contact_name", ""),
        fault_text=fault_text,
        breakstart=breakstart,
        is_system_down=bool(session.get("is_system_down")),
    )

    return result.get("id", "")
