import fitz, requests, sys, io, os, base64, subprocess, time
from requests.auth import HTTPBasicAuth
from dotenv import load_dotenv
import pandas as pd

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
load_dotenv()

BASE = "https://p.priority-connect.online/odata/Priority/tabz0qun.ini/ebyael"
user = os.getenv("PRIORITY_USERNAME")
pw = os.getenv("PRIORITY_PASSWORD")
auth = HTTPBasicAuth(user, pw)
headers = {"Content-Type": "application/json", "Accept": "application/json", "OData-Version": "4.0"}

pdf_path = "input/חשבוניות ספק/bavli 21.25/תנועה אחרון/חשבוניות תנועה מעודכן.pdf"
doc = fitz.open(pdf_path)

df = pd.read_excel("input/חשבוניות ספק/bavli 21.25/תנועה אחרון/חשבוניות ספק תנועה מעודכן.xlsx", header=None, skiprows=2)
cols = ["idx", "num", "filename", "page", "ivnum_created", "supcode", "date", "booknum",
        "branch", "details", "alloc_num", "partname", "pdes", "expense_acct",
        "amount_excl_vat", "amount_incl_vat", "col17", "uniqueid"]
df.columns = cols[:len(df.columns)]

closer_dir = "agents/specific-mission-agents/priority-specific-agents/410-supplier-invoice-closer"
env_for_closer = os.environ.copy()
env_for_closer["PRIORITY_URL"] = "https://p.priority-connect.online/odata/Priority/tabz0qun.ini/ebyael/"

ok_list = []
error_list = []

# Start from index 2 (invoice 3) since 1-2 already done
for i in range(2, 36):
    row = df.iloc[i]
    booknum = str(int(row["booknum"]))
    pdes = row["pdes"]
    price = float(row["amount_excl_vat"])
    page = int(row["page"]) - 1
    num = i + 1

    print(f"[{num}/36] {booknum}...", end=" ", flush=True)

    # Step 1: Create draft (with retry on 502)
    ivnum = None
    for attempt in range(3):
        body = {
            "SUPNAME": "60471",
            "IVDATE": "2025-12-31",
            "BRANCHNAME": "015",
            "BOOKNUM": booknum,
            "YINVOICEITEMS_SUBFORM": [{"PARTNAME": "000", "TQUANT": 1, "PRICE": price}],
        }
        resp = requests.post(f"{BASE}/YINVOICES", json=body, headers=headers, auth=auth)
        if resp.status_code < 400:
            ivnum = resp.json().get("IVNUM", "")
            break
        elif resp.status_code in (502, 503):
            time.sleep(3)
            continue
        else:
            break

    if not ivnum:
        try:
            err_text = resp.json().get("FORM", {}).get("InterfaceErrors", {}).get("text", resp.text[:200])
        except:
            err_text = resp.text[:200]
        print(f"CREATE FAIL")
        error_list.append({"num": num, "booknum": booknum, "step": "create", "error": err_text})
        continue

    # Step 2: PATCH PDES + ACCNAME
    patch_url = f"{BASE}/YINVOICES(IVNUM='{ivnum}',IVTYPE='Y',DEBIT='D')/YINVOICEITEMS_SUBFORM(KLINE=1)"
    r2 = requests.patch(patch_url, json={"PDES": pdes, "ACCNAME": "2112-015"}, headers=headers, auth=auth)
    acc = r2.json().get("ACCNAME", "?") if r2.status_code < 400 else "?"
    if r2.status_code >= 400:
        error_list.append({"num": num, "booknum": booknum, "ivnum": ivnum, "step": "patch", "error": r2.text[:200]})

    # Step 3: Attach PDF page
    single_doc = fitz.open()
    single_doc.insert_pdf(doc, from_page=page, to_page=page)
    pdf_bytes = single_doc.tobytes()
    single_doc.close()
    encoded = base64.b64encode(pdf_bytes).decode()
    attach_url = f"{BASE}/YINVOICES(IVNUM='{ivnum}',IVTYPE='Y',DEBIT='D')/EXTFILES_SUBFORM"
    attach_body = {"EXTFILEDES": f"חשבונית {booknum}", "EXTFILENAME": f"data:application/pdf;base64,{encoded}", "SUFFIX": ".pdf"}
    r3 = requests.post(attach_url, json=attach_body, headers=headers, auth=auth)
    attach_ok = r3.status_code < 400
    if not attach_ok:
        error_list.append({"num": num, "booknum": booknum, "ivnum": ivnum, "step": "attach", "error": r3.text[:200]})

    # Step 4: Close invoice
    proc = subprocess.run(
        ["node", "close-supplier-invoice.js", ivnum],
        capture_output=True, timeout=60,
        cwd=closer_dir, env=env_for_closer,
    )
    stdout = proc.stdout.decode("utf-8", errors="replace").strip()
    close_ok = '"ok":true' in stdout
    if not close_ok:
        error_list.append({"num": num, "booknum": booknum, "ivnum": ivnum, "step": "close", "error": stdout[:150]})

    status = "OK" if (acc == "2112-015" and attach_ok and close_ok) else "PARTIAL"
    print(f"{ivnum} acc={acc} attach={'Y' if attach_ok else 'N'} close={'Y' if close_ok else 'N'} -> {status}")
    ok_list.append({"num": num, "booknum": booknum, "ivnum": ivnum, "acc": acc, "attach": attach_ok, "close": close_ok})

doc.close()

print()
print("=" * 60)
print(f"SUMMARY: {len(ok_list)} processed, {len(error_list)} errors")
print("=" * 60)
if error_list:
    print()
    print("ERRORS:")
    for e in error_list:
        print(f"  #{e['num']} {e['booknum']} [{e['step']}]: {e.get('error','')[:120]}")
else:
    print("No errors!")
print()
failed_create = [e for e in error_list if e["step"] == "create"]
failed_close = [e for e in error_list if e["step"] == "close"]
failed_attach = [e for e in error_list if e["step"] == "attach"]
failed_patch = [e for e in error_list if e["step"] == "patch"]
print(f"Not created: {len(failed_create)}")
print(f"Not patched: {len(failed_patch)}")
print(f"Not attached: {len(failed_attach)}")
print(f"Not closed: {len(failed_close)}")
