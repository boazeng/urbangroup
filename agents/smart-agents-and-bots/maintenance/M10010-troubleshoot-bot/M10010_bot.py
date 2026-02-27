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
_equipment_reader = None
_service_call_writer = None

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


def _get_equipment_reader():
    global _equipment_reader
    if _equipment_reader is None:
        try:
            from agents.specific_mission_agents.priority_specific_agents import equipment_reader_600
            _equipment_reader = equipment_reader_600
        except ImportError:
            import importlib.util
            eq_path = os.path.join(
                os.path.dirname(__file__), "..", "..", "..",
                "specific-mission-agents", "priority-specific-agents",
                "600-equipment", "600-equipment_reader.py",
            )
            eq_path = os.path.normpath(eq_path)
            spec = importlib.util.spec_from_file_location("equipment_reader_600", eq_path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            _equipment_reader = mod
    return _equipment_reader


def _get_service_call_writer():
    global _service_call_writer
    if _service_call_writer is None:
        try:
            from agents.specific_mission_agents.priority_specific_agents import service_call_writer_300
            _service_call_writer = service_call_writer_300
        except ImportError:
            import importlib.util
            sc_path = os.path.join(
                os.path.dirname(__file__), "..", "..", "..",
                "specific-mission-agents", "priority-specific-agents",
                "300-service-call", "300-service_call_writer.py",
            )
            sc_path = os.path.normpath(sc_path)
            spec = importlib.util.spec_from_file_location("service_call_writer_300", sc_path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            _service_call_writer = mod
    return _service_call_writer


def _is_demo_env():
    """Check if running against demo Priority environment."""
    return "demo" in os.environ.get("PRIORITY_URL", "").lower()


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


def _enrich_from_device(session):
    """When device_number is set but customer info is missing, look up in Priority."""
    sernum = session.get("device_number", "")
    if not sernum or session.get("customer_number"):
        return
    try:
        eq = _get_equipment_reader()
        device = eq.fetch_equipment_by_sernum(sernum)
        if device:
            session["customer_number"] = device["custname"]
            session["customer_name"] = device["cdes"]
            logger.info(f"[M10010] Enriched from device {sernum}: "
                        f"customer={device['custname']} ({device['cdes']})")
    except Exception as e:
        logger.error(f"[M10010] Device enrichment failed for {sernum}: {e}")


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
        # Add device identification info if auto-detected
        device_number = session_data.get("device_number", "")
        if device_number:
            greeting += f"\nזיהינו את מכשיר מספר {device_number}."
        text = f"{greeting}\n{text}"

    step_type = step.get("type", "text_input")

    if step_type == "buttons":
        buttons = [
            {"id": btn["id"], "title": btn["title"]}
            for btn in step.get("buttons", [])
        ]
        return {"text": text, "buttons": buttons if buttons else None}

    if step_type == "action":
        # Action steps are auto-executed and should not be sent to the user
        logger.warning(f"[M10010] _build_step_message called on action step {step_id} — "
                       "should have been resolved by _resolve_skip_chain")
        return {"text": "מתבצעת בדיקה...", "buttons": None}

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
                # Save value if button has save_to/save_value
                if btn.get("save_to"):
                    session_data[btn["save_to"]] = btn.get("save_value", btn["id"])
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

    if step_type == "action":
        # Action steps are auto-executed, not driven by user input
        return _execute_action_step(step, session_data)

    return None


def _check_skip_condition(skip_if, session_data):
    """Evaluate a skip_if condition against session data.

    Supports:
        {"field": "device_number", "not_empty": true}
        {"field": "device_number", "empty": true}
        {"field": "is_system_down", "equals": "yes"}
    """
    field = skip_if.get("field", "")
    value = session_data.get(field, "")
    if skip_if.get("not_empty"):
        return bool(value)
    if skip_if.get("empty"):
        return not bool(value)
    if "equals" in skip_if:
        return str(value) == str(skip_if["equals"])
    return False


def _execute_action_step(step, session_data):
    """Execute an action step and return the next step ID based on result.

    Currently supported action_types:
        check_equipment — looks up device by field value in Priority.
            on_success: step to go to if device found (also enriches customer info)
            on_failure: step to go to if device not found or field is empty
    """
    action_type = step.get("action_type", "")

    if action_type == "check_equipment":
        field = step.get("field", "device_number")
        value = session_data.get(field, "")
        if not value:
            logger.info(f"[M10010] Action check_equipment: field '{field}' is empty → failure")
            return step.get("on_failure", "")
        try:
            eq = _get_equipment_reader()
            device = eq.fetch_equipment_by_sernum(value)
            if device:
                session_data["customer_number"] = device.get("custname", "")
                session_data["customer_name"] = device.get("cdes", "")
                logger.info(f"[M10010] Action check_equipment: {value} found "
                            f"→ customer={device.get('custname')} ({device.get('cdes')})")
                return step.get("on_success", "")
            else:
                logger.info(f"[M10010] Action check_equipment: {value} not found → failure")
                return step.get("on_failure", "")
        except Exception as e:
            logger.error(f"[M10010] Action check_equipment failed for {value}: {e}")
            return step.get("on_failure", "")

    logger.warning(f"[M10010] Unknown action_type: {action_type}")
    return None


def _resolve_skip_chain(step_id, script, session_data, max_depth=10):
    """Resolve automatic steps (skip_if and action) without waiting for user input.

    When the engine reaches a step that has a skip_if condition and the condition is true,
    or a step of type 'action', it executes/jumps automatically.
    This chains until a step that requires user input (text_input or buttons).

    Args:
        step_id: Starting step ID
        script: Full script dict
        session_data: Current session data (fields to check against)
        max_depth: Safety limit to prevent infinite loops

    Returns:
        str: Final step ID after resolving all auto steps
    """
    current = step_id
    for _ in range(max_depth):
        if _is_done_step(current, script):
            break
        step = _find_step(script, current)
        if not step:
            break

        # Auto-execute action steps (no user input needed)
        if step.get("type") == "action":
            target = _execute_action_step(step, session_data)
            if target and target != current:
                logger.info(f"[M10010] Action step: {current} → {target} "
                            f"(action_type={step.get('action_type')})")
                current = target
                continue
            break

        # Resolve step-level skip_if conditions
        skip_if = step.get("skip_if")
        if skip_if and _check_skip_condition(skip_if, session_data):
            target = skip_if.get("goto", "")
            if target and target != current:
                logger.info(f"[M10010] Step skip: {current} → {target} "
                            f"(field={skip_if.get('field')} matched)")
                current = target
                continue
        break
    return current


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
                  original_text="", llm_result=None, script_id=None,
                  device_number="", customer_number="", customer_name=""):
    """Start a new troubleshooting session.

    Args:
        device_number: Device serial number from Priority (via M1000 equipment lookup)
        customer_number: Customer code from Priority
        customer_name: Customer name from Priority

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

    # Use Priority data from M1000 if provided, otherwise fall back to DynamoDB history
    if not customer_name and not device_number:
        customer_info = _lookup_customer(phone)
        customer_name = customer_info.get("name", "") or name
        customer_number = customer_info.get("customer_number", "")
        device_number = customer_info.get("device_number", "")
    else:
        customer_name = customer_name or name

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
        "customer_number": customer_number,
        "device_number": device_number,
        "is_system_down": "",
        "location": "",
        "description": "",
        "customer_message": "",
        "original_text": original_text,
        "original_message_id": message_id,
        "original_media_id": media_id,
        "parsed_data": parsed_data or {},
        "llm_result": llm_result or {},
    }

    # Resolve step-level skip_if on first step
    first_step = _resolve_skip_chain(first_step, script, session_data)
    session_data["step"] = first_step

    db.save_session(session_data)
    logger.info(f"[M10010] Session started for {phone}, script={sid}, "
                f"customer={customer_name}, device={device_number}")

    # Check if skip chain landed on a done step
    if _is_done_step(first_step, script):
        return _handle_done(first_step, script, session_data)

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

    # If device_number was just entered, enrich customer info from Priority
    if session.get("device_number") and not session.get("customer_number"):
        _enrich_from_device(session)

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

    # Resolve step-level skip_if chain
    next_step = _resolve_skip_chain(next_step, script, session)

    # Check if skip chain landed on a done step
    if _is_done_step(next_step, script):
        result = _handle_done(next_step, script, session)
        db.update_session_step(phone, next_step)
        logger.info(f"[M10010] Done (after skip): {phone} → {next_step}")
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

    is_system_down = session.get("is_system_down") == "yes"

    fault_text = f"{description}\nטלפון: {phone}"
    if session.get("location"):
        fault_text += f"\nמיקום: {session['location']}"
    if session.get("device_number"):
        fault_text += f"\nמכשיר: {session['device_number']}"
    if is_system_down:
        fault_text += "\nמערכת מושבתת: כן"

    call_data = dict(
        phone=phone,
        name=name,
        issue_type="תקלה",
        description=description,
        urgency="high" if is_system_down else "medium",
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
        is_system_down=is_system_down,
    )

    result = maint_db.save_service_call(**call_data)
    call_id = result.get("id", "")

    # Auto-push to Priority in demo environment
    if _is_demo_env():
        try:
            writer = _get_service_call_writer()
            call_data["callstatuscode"] = "ממתין לאישור"
            priority_result = writer.create_service_call(call_data)
            callno = str(priority_result.get("DOCNO", ""))
            maint_db.mark_service_call_pushed(call_id, callno=callno)
            logger.info(f"[M10010] Auto-pushed to Priority: DOCNO={callno}")
        except Exception as e:
            logger.error(f"[M10010] Auto-push to Priority failed: {e}")

    return call_id


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
                            "goto": "ASK_SYSTEM_DOWN",
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
                "next_step": "ASK_SYSTEM_DOWN",
            },
            {
                "id": "ASK_ADDRESS",
                "type": "text_input",
                "text": "באיזה כתובת נמצא המתקן?\n(נשתמש בכתובת כדי לאתר את המכשיר)",
                "save_to": "location",
                "next_step": "ASK_SYSTEM_DOWN",
            },
            {
                "id": "ASK_SYSTEM_DOWN",
                "type": "buttons",
                "text": "האם המערכת מושבתת?",
                "buttons": [
                    {
                        "id": "system_down_yes",
                        "title": "כן, מושבתת",
                        "next_step": "DESCRIBE_FAULT",
                        "save_to": "is_system_down",
                        "save_value": "yes",
                    },
                    {
                        "id": "system_down_no",
                        "title": "לא, פעילה",
                        "next_step": "DESCRIBE_FAULT",
                        "save_to": "is_system_down",
                        "save_value": "no",
                    },
                ],
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
