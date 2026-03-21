/**
 * read-parts.js
 * Reads LOGPART (parts catalog) from Priority via Web SDK.
 * Filters parts with PARTNAME starting 100-199.
 *
 * Usage:  node read-parts.js
 * Output: JSON to stdout  { "ok": true, "parts": [...] }
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '..', '.env') });
const { login, formStart } = require('priority-web-sdk');

function parseConfig() {
  const raw = (process.env.PRIORITY_URL_REAL || process.env.PRIORITY_URL || '').replace(/\/+$/, '');
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

async function readParts() {
  const cfg = parseConfig();
  process.stderr.write(`[read-parts] Logging in to ${cfg.company}...\n`);

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

  process.stderr.write('[read-parts] Login OK, opening LOGPART...\n');

  const form = await formStart('LOGPART', () => {}, () => {}, cfg.company, 1);

  // Set search filter for parts 100-199
  await form.setSearchFilter({ or: 0, ignorecase: 1, QueryValues: [
    { field: 'PARTNAME', fromval: '100', toval: '199', op: 0, sort: 0, isdesc: 0 },
  ]});

  const rows = await form.getRows(1);
  const formData = rows && rows.LOGPART;

  const parts = [];
  if (formData) {
    for (const row of Object.values(formData)) {
      const name = row.PARTNAME || '';
      if (name >= '100' && name < '200') {
        parts.push({
          code: name,
          name: row.PARTDES || '',
          family: row.FAMILYNAME || row.FAMILYDES || '',
        });
      }
    }
  }

  await form.endCurrentForm();

  parts.sort((a, b) => a.code.localeCompare(b.code));
  process.stdout.write(JSON.stringify({ ok: true, parts }) + '\n');
}

readParts().catch(err => {
  process.stdout.write(JSON.stringify({ ok: false, error: err.message || String(err) }) + '\n');
  process.exit(1);
});
