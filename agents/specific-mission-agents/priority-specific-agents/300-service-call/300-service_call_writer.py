"""
300-Service Call Writer Agent
Connects to Priority Cloud OData API and creates a service call (קריאת שירות).
"""

import sys
import os
import io
import json
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta

# Israel Standard Time = UTC+2 (winter). DST (UTC+3) starts last Sunday of March.
# Priority treats datetime values as local time, so we must send Israeli time.
_ISRAEL_TZ = timezone(timedelta(hours=2))


def _israel_now():
    """Current time in Israeli timezone formatted for Priority OData.

    Priority ignores/discards the Z suffix and treats the datetime as local time,
    so we send Israeli local time with the Z format that Priority was previously
    accepting (removing Z caused Priority to reject the POST).
    """
    return datetime.now(_ISRAEL_TZ).strftime("%Y-%m-%dT%H:%M:%SZ")

# Fix Windows console encoding for Hebrew (only when running directly)
if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import requests
from requests.auth import HTTPBasicAuth
if os.environ.get("IS_LAMBDA") != "true":
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent.parent.parent.parent / ".env"
    load_dotenv(env_path)

logger = logging.getLogger("urbangroup.agent300")

PRIORITY_URL = os.getenv("PRIORITY_URL", "").rstrip("/")
PRIORITY_USERNAME = os.getenv("PRIORITY_USERNAME", "")
PRIORITY_PASSWORD = os.getenv("PRIORITY_PASSWORD", "")


def is_demo_env():
    """Check if we are running against the demo Priority environment."""
    return "demo" in PRIORITY_URL.lower()


def customer_exists(custname):
    """Check if a customer exists in Priority."""
    url = f"{PRIORITY_URL}/CUSTOMERS('{custname}')"
    headers = {"Accept": "application/json", "OData-Version": "4.0"}
    auth = HTTPBasicAuth(PRIORITY_USERNAME, PRIORITY_PASSWORD)
    try:
        resp = requests.get(url, headers=headers, auth=auth)
        return resp.status_code == 200
    except Exception:
        return False


def sernum_exists(sernum):
    """Check if a device serial number exists in Priority.

    Uses $filter instead of key URL to handle leading zeros and dashes correctly
    (e.g. '008-501' fails as a URL key but works via filter).
    """
    url = f"{PRIORITY_URL}/SERNUMBERS"
    params = {"$filter": f"SERNUM eq '{sernum}'", "$select": "SERNUM"}
    headers = {"Accept": "application/json", "OData-Version": "4.0"}
    auth = HTTPBasicAuth(PRIORITY_USERNAME, PRIORITY_PASSWORD)
    try:
        resp = requests.get(url, params=params, headers=headers, auth=auth, timeout=10)
        data = resp.json()
        return len(data.get("value", [])) > 0
    except Exception:
        return False


def create_service_call(service_call_data):
    """Create a service call in Priority via OData API.

    Args:
        service_call_data: dict with DynamoDB service call fields:
            custname, cdes, sernum, branchname, callstatuscode,
            technicianlogin, contact_name, phone, fault_text,
            internal_notes, breakstart, partname

    Returns:
        dict with full API response JSON (includes DOCNO)

    Raises:
        requests.exceptions.HTTPError on API failure
    """
    url = f"{PRIORITY_URL}/DOCUMENTS_Q"
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "OData-Version": "4.0",
    }
    auth = HTTPBasicAuth(PRIORITY_USERNAME, PRIORITY_PASSWORD)

    branchname = service_call_data.get("branchname", "001")
    custname = service_call_data.get("custname", "99999")
    if is_demo_env():
        branchname = "000"

    # Validate customer exists in Priority, fall back to 99999 if not
    if not custname or custname == "99999" or not customer_exists(custname):
        logger.info(f"Customer '{custname}' not found in Priority, using 99999")
        custname = "99999"
    else:
        logger.info(f"Customer '{custname}' found in Priority, using it")

    body = {
        "CUSTNAME": custname,
        "BRANCHNAME": branchname,
        "STARTDATE": _israel_now(),
    }

    # Call status (e.g. "מתוכנן", "ממתין לאישור")
    callstatus = service_call_data.get("callstatuscode", "")
    if callstatus:
        body["CALLSTATUSCODE"] = callstatus

    # Optional fields — only include if non-empty
    for dynamo_key, priority_key in [
        ("technicianlogin", "TECHNICIANLOGIN"),
        ("contact_name", "NAME"),
        ("phone", "PHONENUM"),
        ("partname", "PARTNAME"),
    ]:
        val = service_call_data.get(dynamo_key, "")
        if val:
            body[priority_key] = val

    # Validate SERNUM exists in Priority before including
    sernum = service_call_data.get("sernum", "")
    if sernum:
        if sernum_exists(sernum):
            body["SERNUM"] = sernum
        else:
            logger.info(f"SERNUM '{sernum}' not found in Priority, skipping")

    # BREAKSTART — set to current time when system is down
    # (do NOT include when not down — Priority ignores null on POST anyway)
    if service_call_data.get("is_system_down"):
        body["BREAKSTART"] = _israel_now()

    # Facility address in DETAILS
    location = service_call_data.get("location", "")
    if location:
        body["DETAILS"] = location

    # Build fault description text for DOCTEXT_Q_2_SUBFORM
    # fault_text already includes description, so don't add description separately
    text_parts = []
    for key in ("fault_text", "internal_notes"):
        val = service_call_data.get(key, "")
        if val:
            text_parts.append(val)
    if not text_parts:
        # fallback: no fault_text provided
        val = service_call_data.get("description", "")
        if val:
            text_parts.append(val)
    if text_parts:
        body["DOCTEXT_Q_2_SUBFORM"] = {"TEXT": "\n".join(text_parts)}

    logger.info(f"Sending service call to Priority: {json.dumps(body, indent=2, ensure_ascii=False)}")

    response = requests.post(url, json=body, headers=headers, auth=auth)
    if response.status_code >= 400:
        # Extract Priority's error message for better diagnostics
        try:
            err_data = response.json()
            err_msg = err_data.get("FORM", {}).get("InterfaceErrors", {}).get("text", "")
        except Exception:
            err_msg = response.text[:300]
        logger.error(f"Priority API error {response.status_code}: {err_msg}")
        raise RuntimeError(err_msg or f"Priority API error {response.status_code}")

    result = response.json()
    docno = result.get("DOCNO", "")
    logger.info(f"Service call created: DOCNO={docno}")

    # If system is NOT down, try OData v4 property DELETE to set BREAKSTART = null.
    # PATCH with null/empty is ignored by Priority; OData property DELETE is the standard way.
    if docno and not service_call_data.get("is_system_down"):
        try:
            delete_url = f"{PRIORITY_URL}/DOCUMENTS_Q('{docno}')/BREAKSTART"
            del_headers = {
                "Accept": "application/json",
                "OData-Version": "4.0",
                "If-Match": "*",
            }
            del_resp = requests.delete(delete_url, headers=del_headers, auth=auth, timeout=10)
            logger.info(f"BREAKSTART DELETE status={del_resp.status_code} body={del_resp.text[:400]}")
            if del_resp.status_code < 400:
                logger.info(f"BREAKSTART cleared via DELETE for {docno}")
            else:
                logger.warning(f"Failed to clear BREAKSTART via DELETE for {docno}: {del_resp.status_code} {del_resp.text[:400]}")
        except Exception as e:
            logger.warning(f"BREAKSTART clear failed for {docno}: {e}")

    return result


def main():
    print("=" * 60)
    print("  300-Service Call Writer - Priority Cloud")
    print("=" * 60)
    print()

    if not PRIORITY_URL or not PRIORITY_USERNAME:
        print("Error: Missing PRIORITY_URL or PRIORITY_USERNAME in .env")
        sys.exit(1)

    print(f"Connecting to: {PRIORITY_URL}")
    print(f"Demo mode: {is_demo_env()}")
    print()

    # Test data
    test_data = {
        "custname": "99999",
        "cdes": "לקוח בדיקה",
        "branchname": "108",
        "callstatuscode": "ממתין לאישור",
        "technicianlogin": "יוסי",
        "phone": "0542777757",
        "fault_text": "בדיקת פתיחת קריאת שירות מהבוט\nטלפון: 0542777757",
    }

    try:
        result = create_service_call(test_data)
    except requests.exceptions.HTTPError as e:
        print(f"Error: HTTP {e.response.status_code}")
        print(f"Response: {e.response.text}")
        sys.exit(1)

    print("Service call created successfully!")
    print()
    print("Response:")
    print(json.dumps(result, indent=2, ensure_ascii=False))

    # Save to output file
    output_dir = Path(__file__).resolve().parent.parent.parent.parent.parent / "output"
    output_dir.mkdir(exist_ok=True)
    output_file = output_dir / "300-service_call_write.txt"

    with open(output_file, "w", encoding="utf-8") as f:
        f.write("300-Service Call Writer - Priority Cloud\n")
        f.write(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Source: {PRIORITY_URL}\n\n")
        f.write("API Response:\n")
        f.write(json.dumps(result, indent=2, ensure_ascii=False))
        f.write("\n")

    print(f"\nSaved to: {output_file}")


if __name__ == "__main__":
    main()
