"""
M10010 - Data-Driven Bot Script Engine
Executes conversation scripts stored in DynamoDB.
Scripts define steps, buttons, text templates, skip conditions, and done actions.

The engine is generic - it reads the script JSON and executes it step by step.
No hardcoded conversation flow - everything comes from the database.

Flow:
  Message arrives → M1000 saves to DB → hands off to M10010
  M10010 loads script from DB → greets customer → follows step flow → saves result
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
_scripts_db = None

SESSION_TTL_SECONDS = 30 * 60  # 30 minutes
DEFAULT_SCRIPT_ID = "maintenance-troubleshoot"


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


def _get_scripts_db():
    global _scripts_db
    if _scripts_db is None:
        try:
            from database.maintenance import bot_scripts_db
            _scripts_db = bot_scripts_db
        except ImportError:
            import importlib.util
            db_path = os.path.join(
                os.path.dirname(__file__), "..", "..", "..", "..",
                "database", "maintenance", "bot_scripts_db.py",
            )
            db_path = os.path.normpath(db_path)
            spec = importlib.util.spec_from_file_location("bot_scripts_db", db_path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            _scripts_db = mod
    return _scripts_db


def _get_technician():
    """Return default technician login based on Priority environment."""
    url = os.environ.get("PRIORITY_URL", "")
    if "ebyael" in url:
        return "צחי"
    return "יוסי"


def _lookup_customer(phone):
    """Look up customer by phone number in DynamoDB service calls history.

    Returns:
        dict: {"name": "...", "customer_number": "...", "device_number": "..."} or empty dict
    """
    try:
        db = _get_maint_db()
        calls = db.get_service_calls(phone=phone, limit=5)
        if calls:
            latest = calls[0]
            return {
                "name": latest.get("cdes") or latest.get("name", ""),
                "customer_number": latest.get("custname", ""),
                "device_number": latest.get("sernum", ""),
            }
    except Exception as e:
        logger.error(f"[M10010] Customer lookup failed for {phone}: {e}")
    return {}


# ── Script Loading ────────────────────────────────────────────

def _load_script(script_id=None):
    """Load a bot script from DynamoDB (cached).

    Returns:
        dict: script data, or None if not found
    """
    sid = script_id or DEFAULT_SCRIPT_ID
    try:
        db = _get_scripts_db()
        script = db.get_script(sid)
        if script:
            return script
    except Exception as e:
        logger.error(f"[M10010] Failed to load script {sid}: {e}")
    return None


def _find_step(script, step_id):
    """Find a step definition in the script by ID.

    Returns:
        dict: step config, or None
    """
    for step in script.get("steps", []):
        if step.get("id") == step_id:
            return step
    return None


# ── Generic Step Message Builder ──────────────────────────────

def _build_step_message(step_id, script, session_data):
    """Build the message and optional buttons for a step, reading from script config.

    Returns:
        dict: {"text": "...", "buttons": [...] or None}
    """
    step = _find_step(script, step_id)
    if not step:
        return {"text": "שגיאה פנימית", "buttons": None}

    text = step.get("text", "")

    # For the first step, prepend greeting
    if step_id == script.get("first_step"):
        customer_name = session_data.get("customer_name", "")
        if customer_name:
            greeting = script.get("greeting_known", "שלום {customer_name}!").format(
                customer_name=customer_name
            )
        else:
            greeting = script.get("greeting_unknown", "שלום!")
        text = f"{greeting}\n{text}"

    step_type = step.get("type", "text_input")

    if step_type == "buttons":
        buttons = [
            {"id": btn["id"], "title": btn["title"]}
            for btn in step.get("buttons", [])
        ]
        return {"text": text, "buttons": buttons if buttons else None}

    # text_input type
    return {"text": text, "buttons": None}


# ── Generic Step Input Processing ─────────────────────────────

def _process_step_input(step_id, script, session_data, text, msg_type):
    """Process user input for a step, reading logic from script config.

    Returns:
        str: next step ID to advance to, or None if input is invalid.
    Updates session_data dict in-place with collected info.
    """
    step = _find_step(script, step_id)
    if not step:
        return None

    step_type = step.get("type", "text_input")

    if step_type == "buttons":
        # Match text against button IDs
        for btn in step.get("buttons", []):
            if text == btn["id"]:
                next_step = btn.get("next_step", "")
                # Check skip_if condition
                skip_if = btn.get("skip_if")
                if skip_if and _check_skip_condition(skip_if, session_data):
                    return skip_if.get("goto", next_step)
                return next_step
        return None  # No button matched

    if step_type == "text_input":
        # Accept free-text input
        if msg_type in ("text", "interactive") and text and not text.startswith("["):
            save_to = step.get("save_to")
            if save_to:
                session_data[save_to] = text
            return step.get("next_step", "")
        return None

    return None


def _check_skip_condition(skip_if, session_data):
    """Evaluate a skip_if condition against session data.

    Supports:
        {"field": "device_number", "not_empty": true}
    """
    field = skip_if.get("field", "")
    if skip_if.get("not_empty"):
        return bool(session_data.get(field))
    return False


def _is_done_step(step_id, script):
    """Check if a step ID is a terminal (done) step."""
    done_actions = script.get("done_actions", {})
    return step_id in done_actions


# ── Done Actions ──────────────────────────────────────────────

def _handle_done(done_id, script, session):
    """Execute the done action and return the completion message.

    Returns:
        dict: {"text": "..."} completion message
    """
    done_actions = script.get("done_actions", {})
    done_config = done_actions.get(done_id, {})

    action = done_config.get("action", "")
    if action == "save_message":
        _save_customer_message(session)
    elif action == "save_service_call":
        _save_completed_service_call(session)

    return {"text": done_config.get("text", "תודה!")}


# ── Public API ────────────────────────────────────────────────

def get_active_session(phone):
    """Check if phone has an active (non-expired) troubleshooting session.

    Returns:
        dict session data, or None.
    """
    db = _get_session_db()
    session = db.get_session(phone)
    if not session:
        return None

    step = session.get("step")
    # Check if step is a done step
    script = _load_script(session.get("script_id"))
    if script and _is_done_step(step, script):
        return None
    if step is None:
        return None

    if session.get("expires_at", 0) > time.time():
        return session
    return None


def start_session(phone, name, parsed_data=None, message_id="", media_id="",
                  original_text="", llm_result=None, script_id=None):
    """Start a new troubleshooting session.

    Returns:
        dict: {"text": "...", "buttons": [...]} for the greeting question.
    """
    sid = script_id or DEFAULT_SCRIPT_ID
    script = _load_script(sid)
    if not script:
        logger.error(f"[M10010] Script {sid} not found")
        return {"text": "שגיאה: תסריט לא נמצא", "buttons": None}

    db = _get_session_db()
    now = datetime.utcnow().isoformat() + "Z"

    # Look up customer by phone in service calls history
    customer_info = _lookup_customer(phone)
    customer_name = customer_info.get("name", "") or name

    first_step = script.get("first_step", "GREETING")

    session_data = {
        "phone": phone,
        "session_id": str(uuid.uuid4()),
        "script_id": sid,
        "name": name,
        "step": first_step,
        "created_at": now,
        "updated_at": now,
        "expires_at": int(time.time()) + SESSION_TTL_SECONDS,
        "customer_name": customer_name,
        "customer_number": customer_info.get("customer_number", ""),
        "device_number": customer_info.get("device_number", ""),
        "location": "",
        "description": "",
        "customer_message": "",
        "original_text": original_text,
        "original_message_id": message_id,
        "original_media_id": media_id,
        "parsed_data": parsed_data or {},
        "llm_result": llm_result or {},
    }

    db.save_session(session_data)
    logger.info(f"[M10010] Session started for {phone}, script={sid}, customer={customer_name}")

    return _build_step_message(first_step, script, session_data)


def process_message(phone, text, msg_type="text", caption=""):
    """Process an incoming message for an active troubleshooting session.

    Returns:
        dict: {"text": "...", "buttons": [...]} or {"text": "..."} or None
    """
    db = _get_session_db()
    session = db.get_session(phone)

    if not session:
        return None

    script = _load_script(session.get("script_id"))
    if not script:
        return {"text": "שגיאה: תסריט לא נמצא", "buttons": None}

    current_step = session.get("step", "")
    logger.info(f"[M10010] Processing {phone} step={current_step} input={text[:50]}")

    next_step = _process_step_input(current_step, script, session, text, msg_type)

    if next_step is None:
        # Invalid input - re-send current step prompt with a nudge
        msg = _build_step_message(current_step, script, session)
        if msg.get("buttons"):
            msg["text"] = "אנא בחר אחת מהאפשרויות:\n\n" + msg["text"]
        return msg

    if _is_done_step(next_step, script):
        result = _handle_done(next_step, script, session)
        db.update_session_step(phone, next_step)
        logger.info(f"[M10010] Done: {phone} → {next_step}")
        return result

    # Advance to next step
    session["step"] = next_step
    session["updated_at"] = datetime.utcnow().isoformat() + "Z"
    session["expires_at"] = int(time.time()) + SESSION_TTL_SECONDS
    db.update_session(phone, session)

    return _build_step_message(next_step, script, session)


# ── Done Action Implementations ───────────────────────────────

def _save_customer_message(session):
    """Save a non-fault customer message to DynamoDB as a service call record."""
    maint_db = _get_maint_db()
    phone = session.get("phone", "")
    name = session.get("customer_name", "") or session.get("name", "")
    message = session.get("customer_message", "")

    maint_db.save_service_call(
        phone=phone,
        name=name,
        issue_type="הודעה",
        description=message,
        urgency="low",
        location="",
        summary=message,
        message_id=session.get("original_message_id", ""),
        custname=session.get("customer_number", "") or "99999",
        cdes=name,
        technicianlogin=_get_technician(),
    )


def _save_completed_service_call(session):
    """Save completed fault report as a service call in DynamoDB.

    Returns:
        str: service call ID
    """
    maint_db = _get_maint_db()

    phone = session.get("phone", "")
    name = session.get("customer_name", "") or session.get("name", "")
    description = session.get("description", "")

    fault_text = f"{description}\nטלפון: {phone}"
    if session.get("location"):
        fault_text += f"\nמיקום: {session['location']}"
    if session.get("device_number"):
        fault_text += f"\nמכשיר: {session['device_number']}"

    result = maint_db.save_service_call(
        phone=phone,
        name=name,
        issue_type="תקלה",
        description=description,
        urgency="medium",
        location=session.get("location", ""),
        summary=description,
        message_id=session.get("original_message_id", ""),
        media_id=session.get("original_media_id", ""),
        custname=session.get("customer_number", "") or "99999",
        cdes=name,
        sernum=session.get("device_number", ""),
        branchname="001",
        technicianlogin=_get_technician(),
        fault_text=fault_text,
    )

    return result.get("id", "")


# ── Seed Default Script ───────────────────────────────────────

def seed_default_script():
    """Write the default maintenance-troubleshoot script to DynamoDB if it doesn't exist."""
    db = _get_scripts_db()
    existing = db.get_script(DEFAULT_SCRIPT_ID, use_cache=False)
    if existing:
        logger.info(f"[M10010] Default script already exists, skipping seed")
        return existing

    script = {
        "script_id": DEFAULT_SCRIPT_ID,
        "name": "תסריט אבחון תקלות",
        "active": True,
        "greeting_known": "שלום {customer_name}! כאן הבוט החכם של חברת האחזקה.",
        "greeting_unknown": "שלום! כאן הבוט החכם של חברת האחזקה.",
        "first_step": "GREETING",
        "steps": [
            {
                "id": "GREETING",
                "type": "buttons",
                "text": "מה תרצה לעשות?",
                "buttons": [
                    {
                        "id": "intent_fault",
                        "title": "לדווח על תקלה",
                        "next_step": "ASK_DEVICE",
                        "skip_if": {
                            "field": "device_number",
                            "not_empty": True,
                            "goto": "DESCRIBE_FAULT",
                        },
                    },
                    {
                        "id": "intent_message",
                        "title": "להשאיר הודעה",
                        "next_step": "GET_MESSAGE",
                    },
                ],
            },
            {
                "id": "GET_MESSAGE",
                "type": "text_input",
                "text": "שלח את ההודעה שלך:",
                "save_to": "customer_message",
                "next_step": "DONE_MESSAGE",
            },
            {
                "id": "ASK_DEVICE",
                "type": "buttons",
                "text": "האם יש לך את מספר המכשיר/המתקן?",
                "buttons": [
                    {"id": "device_yes", "title": "כן, יש לי", "next_step": "DEVICE_INPUT"},
                    {"id": "device_no", "title": "לא", "next_step": "ASK_ADDRESS"},
                ],
            },
            {
                "id": "DEVICE_INPUT",
                "type": "text_input",
                "text": "שלח את מספר המכשיר/המתקן:",
                "save_to": "device_number",
                "next_step": "DESCRIBE_FAULT",
            },
            {
                "id": "ASK_ADDRESS",
                "type": "text_input",
                "text": "באיזה כתובת נמצא המתקן?\n(נשתמש בכתובת כדי לאתר את המכשיר)",
                "save_to": "location",
                "next_step": "DESCRIBE_FAULT",
            },
            {
                "id": "DESCRIBE_FAULT",
                "type": "text_input",
                "text": "תאר בקצרה את התקלה:",
                "save_to": "description",
                "next_step": "DONE_FAULT",
            },
        ],
        "done_actions": {
            "DONE_MESSAGE": {
                "text": "ההודעה התקבלה, תודה! נחזור אליך בהקדם.",
                "action": "save_message",
            },
            "DONE_FAULT": {
                "text": "נפתחה קריאת שירות! ניצור איתך קשר בהקדם. תודה!",
                "action": "save_service_call",
            },
        },
    }

    db.save_script(script)
    logger.info(f"[M10010] Default script seeded: {DEFAULT_SCRIPT_ID}")
    return script
