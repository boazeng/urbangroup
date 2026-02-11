"""
100-Customer Reader Agent
Connects to Priority Cloud OData API and reads the customer list.
"""

import sys
import os
import io
from pathlib import Path
from datetime import datetime

# Fix Windows console encoding for Hebrew (only when running directly)
if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import requests
from requests.auth import HTTPBasicAuth
if os.environ.get("IS_LAMBDA") != "true":
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    load_dotenv(env_path)

PRIORITY_URL = os.getenv("PRIORITY_URL", "").rstrip("/")
PRIORITY_USERNAME = os.getenv("PRIORITY_USERNAME", "")
PRIORITY_PASSWORD = os.getenv("PRIORITY_PASSWORD", "")


def validate_config():
    missing = []
    if not PRIORITY_URL:
        missing.append("PRIORITY_URL")
    if not PRIORITY_USERNAME:
        missing.append("PRIORITY_USERNAME")
    if not PRIORITY_PASSWORD:
        missing.append("PRIORITY_PASSWORD")

    if missing:
        print(f"Error: Missing environment variables: {', '.join(missing)}")
        print(f"Please fill in the .env file at: {env_path}")
        sys.exit(1)


def fetch_customers(top=100):
    """Fetch customers from Priority OData API."""
    url = f"{PRIORITY_URL}/CUSTOMERS"
    params = {
        "$top": top,
        "$select": "CUSTNAME,CUSTDES",
    }
    headers = {
        "Accept": "application/json",
        "OData-Version": "4.0",
    }
    auth = HTTPBasicAuth(PRIORITY_USERNAME, PRIORITY_PASSWORD)

    response = requests.get(url, params=params, headers=headers, auth=auth)
    response.raise_for_status()

    data = response.json()
    return data.get("value", [])


def main():
    print("=" * 60)
    print("  100-Customer Reader - Priority Cloud")
    print("=" * 60)
    print()

    validate_config()

    print(f"Connecting to: {PRIORITY_URL}")
    print(f"User: {PRIORITY_USERNAME}")
    print()

    try:
        customers = fetch_customers(top=100)
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            print("Error: Authentication failed. Check your username and password.")
        elif e.response.status_code == 403:
            print("Error: Access denied. Check your user permissions in Priority.")
        elif e.response.status_code == 404:
            print("Error: API endpoint not found. Check your PRIORITY_URL.")
        else:
            print(f"Error: HTTP {e.response.status_code} - {e.response.text}")
        sys.exit(1)
    except requests.exceptions.ConnectionError:
        print("Error: Could not connect to Priority server. Check your URL and network.")
        sys.exit(1)

    if not customers:
        print("No customers found.")
        return

    # Build output lines
    lines = []
    lines.append(f"Found {len(customers)} customers:")
    lines.append("-" * 50)
    lines.append(f"{'#':<5} {'Customer Code':<20} {'Customer Name'}")
    lines.append("-" * 50)

    for i, cust in enumerate(customers, 1):
        code = cust.get("CUSTNAME", "N/A")
        name = cust.get("CUSTDES", "N/A")
        lines.append(f"{i:<5} {code:<20} {name}")

    lines.append("-" * 50)
    lines.append(f"Total: {len(customers)} customers")

    # Print to console
    for line in lines:
        print(line)

    # Save to output file
    output_dir = Path(__file__).resolve().parent.parent / "output"
    output_dir.mkdir(exist_ok=True)

    output_file = output_dir / "100-customer_list.txt"

    with open(output_file, "w", encoding="utf-8") as f:
        f.write(f"100-Customer Reader - Priority Cloud\n")
        f.write(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Source: {PRIORITY_URL}\n")
        f.write("\n")
        f.write("\n".join(lines))
        f.write("\n")

    print()
    print(f"Saved to: {output_file}")


if __name__ == "__main__":
    main()
