"""
5100-SharePoint Connector Agent
Connects to SharePoint via Microsoft Graph API for reading/writing Excel files and documents.
"""

import sys
import os
import io
import json
import logging
from pathlib import Path
from datetime import datetime, timedelta

if not isinstance(sys.stdout, io.TextIOWrapper) or sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import requests

if os.environ.get("IS_LAMBDA") != "true":
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
    load_dotenv(env_path)

logger = logging.getLogger("urbangroup.5100")

SHAREPOINT_TENANT_ID = os.getenv("SHAREPOINT_TENANT_ID", "")
SHAREPOINT_CLIENT_ID = os.getenv("SHAREPOINT_CLIENT_ID", "")
SHAREPOINT_CLIENT_SECRET = os.getenv("SHAREPOINT_CLIENT_SECRET", "")
SHAREPOINT_SITE_URL = os.getenv("SHAREPOINT_SITE_URL", "")

GRAPH_BASE = "https://graph.microsoft.com/v1.0"

# Token cache
_token_cache = {"token": None, "expires_at": None}


def validate_config():
    """Check that all required SharePoint env vars are set."""
    missing = []
    if not SHAREPOINT_TENANT_ID:
        missing.append("SHAREPOINT_TENANT_ID")
    if not SHAREPOINT_CLIENT_ID:
        missing.append("SHAREPOINT_CLIENT_ID")
    if not SHAREPOINT_CLIENT_SECRET:
        missing.append("SHAREPOINT_CLIENT_SECRET")
    if missing:
        logger.error(f"[5100] Missing env vars: {', '.join(missing)}")
        return False
    return True


def get_token():
    """Get a valid Microsoft Graph access token (cached until expiry).

    Returns:
        str: Access token
    """
    now = datetime.now()
    if _token_cache["token"] and _token_cache["expires_at"] and now < _token_cache["expires_at"]:
        return _token_cache["token"]

    resp = requests.post(
        f"https://login.microsoftonline.com/{SHAREPOINT_TENANT_ID}/oauth2/v2.0/token",
        data={
            "grant_type": "client_credentials",
            "client_id": SHAREPOINT_CLIENT_ID,
            "client_secret": SHAREPOINT_CLIENT_SECRET,
            "scope": "https://graph.microsoft.com/.default",
        },
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    _token_cache["token"] = data["access_token"]
    _token_cache["expires_at"] = now + timedelta(seconds=data.get("expires_in", 3600) - 60)
    logger.info("[5100] Graph API token acquired")
    return _token_cache["token"]


def _headers():
    """Return auth headers for Graph API calls."""
    return {"Authorization": f"Bearer {get_token()}"}


# ── Site & Drive discovery ───────────────────────────────────


def get_site(site_path=""):
    """Get a SharePoint site by relative path.

    Args:
        site_path: Relative path (e.g. 'Realestateproject'). Empty = root site.

    Returns:
        dict: Site info (id, displayName, webUrl)
    """
    if site_path:
        hostname = SHAREPOINT_SITE_URL.replace("https://", "").rstrip("/")
        url = f"{GRAPH_BASE}/sites/{hostname}:/{site_path}"
    else:
        hostname = SHAREPOINT_SITE_URL.replace("https://", "").rstrip("/")
        url = f"{GRAPH_BASE}/sites/{hostname}"
    resp = requests.get(url, headers=_headers(), timeout=15)
    resp.raise_for_status()
    return resp.json()


def list_sites(search="*"):
    """Search for SharePoint sites.

    Args:
        search: Search query (default '*' = all sites)

    Returns:
        list of site dicts
    """
    resp = requests.get(
        f"{GRAPH_BASE}/sites?search={search}",
        headers=_headers(), timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("value", [])


def get_drives(site_id):
    """List document libraries (drives) for a site.

    Args:
        site_id: SharePoint site ID

    Returns:
        list of drive dicts
    """
    resp = requests.get(
        f"{GRAPH_BASE}/sites/{site_id}/drives",
        headers=_headers(), timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("value", [])


def list_files(drive_id, folder_path=""):
    """List files in a drive folder.

    Args:
        drive_id: Drive ID
        folder_path: Folder path (e.g. 'General/Reports'). Empty = root.

    Returns:
        list of item dicts (name, id, size, webUrl)
    """
    if folder_path:
        url = f"{GRAPH_BASE}/drives/{drive_id}/root:/{folder_path}:/children"
    else:
        url = f"{GRAPH_BASE}/drives/{drive_id}/root/children"
    resp = requests.get(url, headers=_headers(), timeout=15)
    resp.raise_for_status()
    return resp.json().get("value", [])


def resolve_share_link(share_url):
    """Resolve a SharePoint sharing link to a drive item.

    Args:
        share_url: SharePoint sharing URL

    Returns:
        dict: Drive item info (id, name, driveId, path)
    """
    import base64
    encoded = base64.b64encode(share_url.encode()).decode().rstrip("=").replace("/", "_").replace("+", "-")
    share_token = f"u!{encoded}"
    resp = requests.get(
        f"{GRAPH_BASE}/shares/{share_token}/driveItem",
        headers=_headers(), timeout=15,
    )
    resp.raise_for_status()
    item = resp.json()
    return {
        "id": item.get("id"),
        "name": item.get("name"),
        "size": item.get("size"),
        "webUrl": item.get("webUrl"),
        "driveId": item.get("parentReference", {}).get("driveId"),
        "path": item.get("parentReference", {}).get("path"),
    }


# ── Excel operations ─────────────────────────────────────────


def list_worksheets(drive_id, item_id):
    """List worksheets in an Excel file.

    Args:
        drive_id: Drive ID
        item_id: File item ID

    Returns:
        list of worksheet dicts (name, id, visibility)
    """
    resp = requests.get(
        f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}/workbook/worksheets",
        headers=_headers(), timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get("value", [])


def read_excel_range(drive_id, item_id, sheet_name, cell_range=None):
    """Read a range from an Excel worksheet.

    Args:
        drive_id: Drive ID
        item_id: File item ID
        sheet_name: Worksheet name (e.g. '2.26')
        cell_range: Cell range (e.g. 'A1:Z10'). None = usedRange.

    Returns:
        dict with 'address', 'values' (2D list), 'rowCount', 'columnCount'
    """
    sheet_encoded = requests.utils.quote(sheet_name, safe="")
    if cell_range:
        url = f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}/workbook/worksheets('{sheet_encoded}')/range(address='{cell_range}')"
    else:
        url = f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}/workbook/worksheets('{sheet_encoded}')/usedRange"

    resp = requests.get(url, headers=_headers(), timeout=60)
    resp.raise_for_status()
    data = resp.json()
    return {
        "address": data.get("address", ""),
        "values": data.get("values", []),
        "rowCount": data.get("rowCount", 0),
        "columnCount": data.get("columnCount", 0),
    }


def write_excel_range(drive_id, item_id, sheet_name, cell_range, values):
    """Write values to an Excel range.

    Args:
        drive_id: Drive ID
        item_id: File item ID
        sheet_name: Worksheet name
        cell_range: Cell range (e.g. 'A1:C3')
        values: 2D list of values to write

    Returns:
        dict: Updated range info
    """
    sheet_encoded = requests.utils.quote(sheet_name, safe="")
    url = f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}/workbook/worksheets('{sheet_encoded}')/range(address='{cell_range}')"

    resp = requests.patch(
        url,
        headers={**_headers(), "Content-Type": "application/json"},
        json={"values": values},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    return {
        "address": data.get("address", ""),
        "rowCount": data.get("rowCount", 0),
        "columnCount": data.get("columnCount", 0),
    }


def add_excel_rows(drive_id, item_id, sheet_name, table_name, values):
    """Add rows to an Excel table.

    Args:
        drive_id: Drive ID
        item_id: File item ID
        sheet_name: Worksheet name
        table_name: Table name in the worksheet
        values: 2D list of row values to add

    Returns:
        dict: Result info
    """
    url = f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}/workbook/tables('{table_name}')/rows/add"

    resp = requests.post(
        url,
        headers={**_headers(), "Content-Type": "application/json"},
        json={"values": values},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


# ── Convenience: work with a file by sharing link ────────────


class SharePointExcel:
    """Convenience wrapper for working with a specific Excel file."""

    def __init__(self, share_url):
        """Initialize from a SharePoint sharing URL.

        Args:
            share_url: SharePoint sharing URL (the :x:/g/... link)
        """
        # Strip query params for resolution
        clean_url = share_url.split("?")[0]
        info = resolve_share_link(clean_url)
        self.drive_id = info["driveId"]
        self.item_id = info["id"]
        self.name = info["name"]
        self.path = info["path"]
        logger.info(f"[5100] Excel file: {self.name} (drive={self.drive_id[:20]}..., item={self.item_id})")

    def sheets(self):
        """List worksheet names."""
        ws = list_worksheets(self.drive_id, self.item_id)
        return [s["name"] for s in ws]

    def read(self, sheet_name, cell_range=None):
        """Read a range or the full used range."""
        return read_excel_range(self.drive_id, self.item_id, sheet_name, cell_range)

    def write(self, sheet_name, cell_range, values):
        """Write values to a range."""
        return write_excel_range(self.drive_id, self.item_id, sheet_name, cell_range, values)
