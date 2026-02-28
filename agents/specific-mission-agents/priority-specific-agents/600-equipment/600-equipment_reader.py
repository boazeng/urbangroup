"""
600-Equipment Reader Agent
Connects to Priority Cloud OData API and reads equipment (SERNUMBERS) data.
Used by M1000 bot to identify customer devices by phone number.
"""

import sys
import os
import io
import re
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

logger = logging.getLogger("urbangroup.agent600")

PRIORITY_URL = os.getenv("PRIORITY_URL", "").rstrip("/")
PRIORITY_USERNAME = os.getenv("PRIORITY_USERNAME", "")
PRIORITY_PASSWORD = os.getenv("PRIORITY_PASSWORD", "")

EQUIPMENT_FIELDS = (
    "SERNUM,PARTNAME,PARTDES,CUSTNAME,CDES,PHONENUM,"
    "STATUSNAME,FAMILYNAME,FAMILYDES,FACILITYNAME,FACILITYDES"
)


def _phone_variants(phone):
    """Return all formats to try when matching a phone number in Priority.

    Priority stores numbers in various formats:
      +972542777757   (international with +)
      0542777757      (local without dash)
      054-2777757     (local with dash after 3 digits)

    WhatsApp sends: '972542777757' (no + or spaces)
    """
    digits = re.sub(r"[^0-9]", "", phone)
    # Strip country code to get 9-digit local number (e.g. 542777757)
    if digits.startswith("972") and len(digits) > 9:
        local9 = digits[3:]
    elif digits.startswith("0") and len(digits) >= 9:
        local9 = digits[1:]
    else:
        local9 = digits

    variants = set()
    if len(local9) == 9:
        variants.add(f"+972{local9}")         # +972542777757
        variants.add(f"0{local9}")            # 0542777757
        variants.add(f"0{local9[:2]}-{local9[2:]}")  # 054-2777757
    variants.add(digits)                      # original digits as fallback
    return variants


def fetch_equipment_by_phone(phone):
    """Find equipment/devices in Priority by customer phone number.

    Tries multiple phone formats since Priority stores numbers inconsistently.

    Args:
        phone: Phone number in any format (WhatsApp, local, etc.)

    Returns:
        list of dicts with equipment info, filtered to active devices only.
        Each dict: {sernum, partname, partdes, custname, cdes, phonenum,
                     statusname, familyname, familydes, facilityname, facilitydes}
    """
    variants = _phone_variants(phone)
    if not variants:
        logger.warning(f"[600] Could not build phone variants for: {phone}")
        return []

    # Build filter with OR across all format variants
    or_clauses = " or ".join(f"PHONENUM eq '{v}'" for v in variants)
    filter_expr = f"({or_clauses})"

    url = f"{PRIORITY_URL}/SERNUMBERS"
    params = {
        "$filter": filter_expr,
        "$select": EQUIPMENT_FIELDS,
    }
    headers = {
        "Accept": "application/json",
        "OData-Version": "4.0",
    }
    auth = HTTPBasicAuth(PRIORITY_USERNAME, PRIORITY_PASSWORD)

    try:
        response = requests.get(url, params=params, headers=headers, auth=auth, timeout=15)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        logger.error(f"[600] Priority API error: {e}")
        return []

    data = response.json()
    records = data.get("value", [])

    # Convert to lowercase keys and filter active devices
    devices = []
    for rec in records:
        status = rec.get("STATUSNAME", "")
        if status == "Reject":
            continue  # skip disabled/rejected equipment
        devices.append({
            "sernum": rec.get("SERNUM", ""),
            "partname": rec.get("PARTNAME", ""),
            "partdes": rec.get("PARTDES", ""),
            "custname": rec.get("CUSTNAME", ""),
            "cdes": rec.get("CDES", ""),
            "phonenum": rec.get("PHONENUM", ""),
            "statusname": status,
            "familyname": rec.get("FAMILYNAME", ""),
            "familydes": rec.get("FAMILYDES", ""),
            "facilityname": rec.get("FACILITYNAME", ""),
            "facilitydes": rec.get("FACILITYDES", ""),
        })

    logger.info(f"[600] Found {len(devices)} active device(s) for phone {phone}")
    return devices


def fetch_equipment_by_sernum(sernum):
    """Look up a specific device by serial number in Priority.

    Uses $filter instead of OData key lookup to handle leading zeros correctly.
    e.g. SERNUM='00008' works via filter but may fail as a URL key.

    Args:
        sernum: Device serial number (e.g. '00008')

    Returns:
        dict with device info, or None if not found.
    """
    if not sernum:
        return None

    url = f"{PRIORITY_URL}/SERNUMBERS"
    params = {
        "$filter": f"SERNUM eq '{sernum}'",
        "$select": EQUIPMENT_FIELDS,
    }
    headers = {
        "Accept": "application/json",
        "OData-Version": "4.0",
    }
    auth = HTTPBasicAuth(PRIORITY_USERNAME, PRIORITY_PASSWORD)

    try:
        response = requests.get(url, params=params, headers=headers, auth=auth, timeout=15)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        logger.error(f"[600] Priority API error for SERNUM {sernum}: {e}")
        return None

    records = response.json().get("value", [])
    if not records:
        logger.info(f"[600] Device {sernum} not found in Priority")
        return None

    rec = records[0]
    device = {
        "sernum": rec.get("SERNUM", ""),
        "partname": rec.get("PARTNAME", ""),
        "partdes": rec.get("PARTDES", ""),
        "custname": rec.get("CUSTNAME", ""),
        "cdes": rec.get("CDES", ""),
        "phonenum": rec.get("PHONENUM", ""),
        "statusname": rec.get("STATUSNAME", ""),
        "familyname": rec.get("FAMILYNAME", ""),
        "familydes": rec.get("FAMILYDES", ""),
        "facilityname": rec.get("FACILITYNAME", ""),
        "facilitydes": rec.get("FACILITYDES", ""),
    }
    logger.info(f"[600] Device {sernum} found: customer={device['custname']} ({device['cdes']})")
    return device


def main():
    print("=" * 60)
    print("  600-Equipment Reader - Priority Cloud")
    print("=" * 60)
    print()

    if not PRIORITY_URL or not PRIORITY_USERNAME:
        print("Error: Missing PRIORITY_URL or PRIORITY_USERNAME in .env")
        sys.exit(1)

    print(f"Connecting to: {PRIORITY_URL}")
    print()

    # Fetch all equipment (limited)
    url = f"{PRIORITY_URL}/SERNUMBERS"
    params = {
        "$top": 20,
        "$select": EQUIPMENT_FIELDS,
    }
    headers = {"Accept": "application/json", "OData-Version": "4.0"}
    auth = HTTPBasicAuth(PRIORITY_USERNAME, PRIORITY_PASSWORD)

    try:
        response = requests.get(url, params=params, headers=headers, auth=auth, timeout=15)
        response.raise_for_status()
    except requests.exceptions.HTTPError as e:
        print(f"Error: HTTP {e.response.status_code} - {e.response.text[:300]}")
        sys.exit(1)
    except requests.exceptions.ConnectionError:
        print("Error: Could not connect to Priority server.")
        sys.exit(1)

    data = response.json()
    records = data.get("value", [])

    if not records:
        print("No equipment found.")
        return

    print(f"Found {len(records)} equipment records:")
    print("-" * 80)
    print(f"{'SERNUM':<12} {'CUSTNAME':<10} {'CDES':<30} {'PHONENUM':<15} {'STATUS'}")
    print("-" * 80)

    for rec in records:
        print(
            f"{rec.get('SERNUM', ''):<12} "
            f"{rec.get('CUSTNAME', ''):<10} "
            f"{rec.get('CDES', ''):<30} "
            f"{rec.get('PHONENUM', ''):<15} "
            f"{rec.get('STATUSNAME', '')}"
        )

    print("-" * 80)
    print(f"Total: {len(records)} records")

    # Test phone lookup
    print()
    test_phone = input("Enter phone to test lookup (or press Enter to skip): ").strip()
    if test_phone:
        print(f"\nLooking up devices for phone: {test_phone}")
        devices = fetch_equipment_by_phone(test_phone)
        if devices:
            for d in devices:
                print(f"  SERNUM={d['sernum']} CUST={d['custname']} ({d['cdes']}) STATUS={d['statusname']}")
        else:
            print("  No active devices found.")


if __name__ == "__main__":
    main()
