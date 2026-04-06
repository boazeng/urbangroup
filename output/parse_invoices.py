import fitz, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
doc = fitz.open("input/חשבוניות ספק/bavli 21.25/תנועה אחרון/חשבוניות תנועה מעודכן.pdf")

invoices = []
for p in range(len(doc)):
    text = doc[p].get_text()

    # Invoice number: '84412 מס חשבונית'
    m_inv = re.search(r"(\d{4,6})\s*מס חשבונית", text)
    inv_num = m_inv.group(1) if m_inv else "?"

    # Date: '31/12/2025 עד'
    m_date = re.search(r"(\d{2}/\d{2}/\d{4})\s*(?:עד|תאריך)", text)
    date_str = m_date.group(1) if m_date else "?"

    # Amount before VAT: first כ"סה₪
    m_total = re.findall(r'סה₪([\d,]+\.\d{2})', text)
    amount_excl = m_total[0].replace(",", "") if m_total else "?"

    # Amount with VAT: לתשלום כ"סה₪
    m_incl = re.search(r'לתשלום.*?סה₪([\d,]+\.\d{2})', text)
    amount_incl = m_incl.group(1).replace(",", "") if m_incl else "?"

    # Description: line starting with '1' containing 'עבור' and '₪'
    desc = "?"
    for line in text.split("\n"):
        if line.startswith("1") and "₪" in line and "עבור" in line:
            d = re.search(r"^1(.+?)₪", line)
            if d:
                desc = d.group(1).strip()
                break

    invoices.append({
        "page": p + 1,
        "inv_num": inv_num,
        "date": date_str,
        "amount_excl": amount_excl,
        "amount_incl": amount_incl,
        "desc_raw": desc,
    })

for inv in invoices:
    print(f"p{inv['page']}: num={inv['inv_num']} date={inv['date']} excl={inv['amount_excl']} incl={inv['amount_incl']} desc={inv['desc_raw']}")

doc.close()
