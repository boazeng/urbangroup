/**
 * close-supplier-invoice.js
 * Finalizes a draft supplier invoice in Priority using the Web SDK.
 *
 * Usage:  node close-supplier-invoice.js <IVNUM>
 * Output: JSON to stdout  { "ok": true, "ivnum": "T98" }
 *                      or { "ok": false, "error": "..." }
 *
 * Environment variables (from .env):
 *   PRIORITY_URL       – full OData URL (parsed for host/tabulaini/company)
 *   PRIORITY_USERNAME  – PAT key or username
 *   PRIORITY_PASSWORD  – "PAT" or password
 */

const path = require('path');

// Load .env from project root
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '..', '.env') });

const { login, formStart } = require('priority-web-sdk');

// Parse OData URL to extract tabulaini and company, build WCF URL
// OData: https://p.priority-connect.online/odata/Priority/tabz0qun.ini/demo/
// WCF:   https://p.priority-connect.online/wcf/service.svc
function parseConfig() {
  const raw = (process.env.PRIORITY_URL || '').replace(/\/+$/, '');
  const match = raw.match(/^(https?:\/\/[^/]+)\/odata\/Priority\/([^/]+)\/([^/]+)/);
  if (!match) {
    throw new Error(`Cannot parse PRIORITY_URL: ${raw}`);
  }
  return {
    host: match[1],
    wcfUrl: match[1] + '/wcf/service.svc',
    tabulaini: match[2],
    company: match[3],
    username: process.env.PRIORITY_USERNAME || '',
    password: process.env.PRIORITY_PASSWORD || '',
  };
}

function output(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

async function finalizeSupplierInvoice(ivnum) {
  const cfg = parseConfig();

  const loginCfg = {
    url: cfg.wcfUrl,
    tabulaini: cfg.tabulaini,
    language: 1, // 1=Hebrew
    profile: { company: cfg.company },
    appname: 'urbangroup',
    username: cfg.username,
    password: cfg.password,
    devicename: '',
  };

  process.stderr.write(`[close-supplier-invoice] Logging in to ${cfg.company}...\n`);
  try {
    await login(loginCfg);
  } catch (loginErr) {
    throw new Error(loginErr.message || loginErr.text || JSON.stringify(loginErr));
  }

  // Auto-confirm any warning dialogs from the server
  const onShowMessage = (msg) => {
    if (msg && msg.form && msg.form.warningConfirm) {
      msg.form.warningConfirm(1);
    }
  };

  // Open YINVOICES form (supplier invoices) with autoRetrieveFirstRows=1
  const form = await formStart('YINVOICES', onShowMessage, () => {}, cfg.company, 1);

  const rows = await form.getRows(1);
  const formData = rows && rows.YINVOICES;
  if (!formData) {
    await form.endCurrentForm();
    throw new Error('No supplier invoice data loaded');
  }

  // Find the target invoice in loaded rows
  let targetRow = null;
  for (const [rowIdx, row] of Object.entries(formData)) {
    if (row.IVNUM === ivnum) {
      targetRow = parseInt(rowIdx, 10);
      break;
    }
  }

  if (targetRow === null) {
    await form.endCurrentForm();
    throw new Error(`Supplier invoice ${ivnum} not found in loaded data (${Object.keys(formData).length} rows)`);
  }

  await form.setActiveRow(targetRow);

  // Run CLOSEANINVOICE procedure (טיוטא → סופית)
  process.stderr.write(`[close-supplier-invoice] Closing ${ivnum}...\n`);

  const withTimeout = (fn, label, ms = 30000) =>
    Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      )
    ]);

  await withTimeout(() => form.activateStart('CLOSEANINVOICE', 'P'), 'activateStart');
  await withTimeout(() => form.activateEnd(), 'activateEnd');

  await form.endCurrentForm();
  process.stderr.write(`[close-supplier-invoice] ${ivnum} closed successfully\n`);

  return { ok: true, ivnum };
}

// Main
const ivnum = process.argv[2];
if (!ivnum) {
  output({ ok: false, error: 'Usage: node close-supplier-invoice.js <IVNUM>' });
  process.exit(1);
}

finalizeSupplierInvoice(ivnum)
  .then((result) => {
    output(result);
    process.exit(0);
  })
  .catch((err) => {
    output({ ok: false, error: err.message || String(err) });
    process.exit(1);
  });
