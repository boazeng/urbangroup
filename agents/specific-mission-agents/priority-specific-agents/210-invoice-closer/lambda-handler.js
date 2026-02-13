/**
 * Lambda handler for closing invoices in Priority via Web SDK.
 * Receives: { "ivnum": "T99" }
 * Returns:  { "ok": true, "ivnum": "T99" } or { "ok": false, "error": "..." }
 */

const { login, formStart } = require('priority-web-sdk');

function parseConfig() {
  const raw = (process.env.PRIORITY_URL || '').replace(/\/+$/, '');
  const match = raw.match(/^(https?:\/\/[^/]+)\/odata\/Priority\/([^/]+)\/([^/]+)/);
  if (!match) {
    throw new Error(`Cannot parse PRIORITY_URL: ${raw}`);
  }
  return {
    wcfUrl: match[1] + '/wcf/service.svc',
    tabulaini: match[2],
    company: match[3],
    username: process.env.PRIORITY_USERNAME || '',
    password: process.env.PRIORITY_PASSWORD || '',
  };
}

async function finalizeInvoice(ivnum) {
  const cfg = parseConfig();

  const loginCfg = {
    url: cfg.wcfUrl,
    tabulaini: cfg.tabulaini,
    language: 1,
    profile: { company: cfg.company },
    appname: 'urbangroup',
    username: cfg.username,
    password: cfg.password,
    devicename: '',
  };

  try {
    await login(loginCfg);
  } catch (loginErr) {
    throw new Error(loginErr.message || loginErr.text || JSON.stringify(loginErr));
  }

  const onShowMessage = (msg) => {
    if (msg && msg.form && msg.form.warningConfirm) {
      msg.form.warningConfirm(1);
    }
  };

  const form = await formStart('AINVOICES', onShowMessage, () => {}, cfg.company, 1);

  const rows = await form.getRows(1);
  const formData = rows && rows.AINVOICES;
  if (!formData) {
    await form.endCurrentForm();
    throw new Error('No invoice data loaded');
  }

  let targetRow = null;
  for (const [rowIdx, row] of Object.entries(formData)) {
    if (row.IVNUM === ivnum) {
      targetRow = parseInt(rowIdx, 10);
      break;
    }
  }

  if (targetRow === null) {
    await form.endCurrentForm();
    throw new Error(`Invoice ${ivnum} not found in loaded data (${Object.keys(formData).length} rows)`);
  }

  await form.setActiveRow(targetRow);

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
  return { ok: true, ivnum };
}

exports.handler = async (event) => {
  const ivnum = event.ivnum;
  if (!ivnum) {
    return { ok: false, error: 'Missing ivnum in event payload' };
  }

  try {
    return await finalizeInvoice(ivnum);
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
};
