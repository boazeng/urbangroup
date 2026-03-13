/**
 * close-transaction.js
 * Finalizes a draft journal transaction in Priority using the Web SDK.
 *
 * Usage:  node close-transaction.js <FNCNUM>
 * Output: JSON to stdout  { "ok": true, "fncnum": "T120323" }
 *                      or { "ok": false, "error": "..." }
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '..', '.env') });
const { login, formStart } = require('priority-web-sdk');

function parseConfig() {
  const raw = (process.env.PRIORITY_URL || '').replace(/\/+$/, '');
  const match = raw.match(/^(https?:\/\/[^/]+)\/odata\/Priority\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error(`Cannot parse PRIORITY_URL: ${raw}`);
  return {
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

async function finalizeTransaction(fncnum) {
  const cfg = parseConfig();

  process.stderr.write(`[close-transaction] Logging in to ${cfg.company}...\n`);
  await login({
    url: cfg.wcfUrl,
    tabulaini: cfg.tabulaini,
    language: 1,
    profile: { company: cfg.company },
    appname: 'urbangroup',
    username: cfg.username,
    password: cfg.password,
    devicename: '',
  });

  const onShowMessage = (msg) => {
    if (msg && msg.form && msg.form.warningConfirm) {
      msg.form.warningConfirm(1);
    }
  };

  const form = await formStart('FNCTRANS', onShowMessage, () => {}, cfg.company, 1);

  const rows = await form.getRows(1);
  const formData = rows && rows.FNCTRANS;
  if (!formData) {
    await form.endCurrentForm();
    throw new Error('No transaction data loaded');
  }

  let targetRow = null;
  for (const [rowIdx, row] of Object.entries(formData)) {
    if (row.FNCNUM === fncnum) {
      targetRow = parseInt(rowIdx, 10);
      break;
    }
  }

  if (targetRow === null) {
    await form.endCurrentForm();
    throw new Error(`Transaction ${fncnum} not found in loaded data (${Object.keys(formData).length} rows)`);
  }

  await form.setActiveRow(targetRow);

  process.stderr.write(`[close-transaction] Closing ${fncnum}...\n`);

  const withTimeout = (fn, label, ms = 30000) =>
    Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      )
    ]);

  await withTimeout(() => form.activateStart('CLOSEANFNCTRANS', 'P'), 'activateStart');
  await withTimeout(() => form.activateEnd(), 'activateEnd');

  await form.endCurrentForm();
  process.stderr.write(`[close-transaction] ${fncnum} closed successfully\n`);

  return { ok: true, fncnum };
}

const fncnum = process.argv[2];
if (!fncnum) {
  output({ ok: false, error: 'Usage: node close-transaction.js <FNCNUM>' });
  process.exit(1);
}

finalizeTransaction(fncnum)
  .then((result) => { output(result); process.exit(0); })
  .catch((err) => { output({ ok: false, error: err.message || String(err) }); process.exit(1); });
