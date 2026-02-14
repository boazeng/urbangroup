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
from datetime import datetime

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
        "STARTDATE": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    # Optional fields — only include if non-empty
    for dynamo_key, priority_key in [
        ("technicianlogin", "TECHNICIANLOGIN"),
        ("sernum", "SERNUM"),
        ("contact_name", "NAME"),
        ("phone", "PHONENUM"),
        ("partname", "PARTNAME"),
    ]:
        val = service_call_data.get(dynamo_key, "")
        if val:
            body[priority_key] = val

    # Facility address in DETAILS
    location = service_call_data.get("location", "")
    if location:
        body["DETAILS"] = location

    # Build fault description text for DOCTEXT_Q_2_SUBFORM
    text_parts = []
    for key in ("fault_text", "description", "internal_notes"):
        val = service_call_data.get(key, "")
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
        response.raise_for_status()

    result = response.json()
    logger.info(f"Service call created: DOCNO={result.get('DOCNO', 'N/A')}")
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
