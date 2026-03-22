/**
 * create-delivery-note.js
 * Creates a delivery note (תעודת משלוח) in Priority via OData API.
 *
 * Usage:  node create-delivery-note.js '<JSON>'
 *   JSON: {
 *     "customerNum": "1234-102",
 *     "siteName": "אתר X",
 *     "items": [{ "profNum": "101", "profName": "חשמלאי", "hours": 10, "rate": 50, "total": 500 }]
 *   }
 *
 * Output: JSON to stdout  { "ok": true, "docno": "D12345" }
 *                      or { "ok": false, "error": "..." }
 *
 * Environment variables (from .env):
 *   PRIORITY_URL       – full OData URL
 *   PRIORITY_USERNAME  – PAT key or username
 *   PRIORITY_PASSWORD  – "PAT" or password
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '..', '.env') });

function output(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function log(msg) {
  process.stderr.write(`[create-delivery-note] ${msg}\n`);
}

async function createDeliveryNote(params) {
  const { customerNum, siteName, items } = params;
  if (!customerNum) throw new Error('Missing customerNum');
  if (!items || items.length === 0) throw new Error('Missing items');

  const priorityUrl = (process.env.PRIORITY_URL || '').replace(/\/+$/, '');
  const username = process.env.PRIORITY_USERNAME || '';
  const password = process.env.PRIORITY_PASSWORD || '';

  const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

  // Build line items for TRANSORDER_D_SUBFORM
  const subformItems = items.map(item => ({
    PARTNAME: String(item.profNum || '').trim(),
    PDES: String(item.profName || '').trim(),
    TQUANT: item.hours || 0,
    PRICE: item.rate || 0,
  }));

  const body = {
    CUSTNAME: customerNum,
    DETAILS: siteName || '',
    TRANSORDER_D_SUBFORM: subformItems,
  };

  log(`Creating delivery note for customer ${customerNum} with ${subformItems.length} items...`);
  log(`Body: ${JSON.stringify(body, null, 2)}`);

  const url = `${priorityUrl}/DOCUMENTS_D`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'OData-Version': '4.0',
      'Authorization': authHeader,
    },
    body: JSON.stringify(body),
  });

  const text = await resp.text();

  if (!resp.ok) {
    log(`Error response: ${text}`);
    throw new Error(`Priority API error ${resp.status}: ${text}`);
  }

  let result;
  try {
    result = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON response: ${text}`);
  }

  const docno = result.DOCNO || result.DOCNUM || '';
  log(`Delivery note created: ${docno}`);

  return { ok: true, docno, result };
}

// Main
const jsonArg = process.argv[2];
if (!jsonArg) {
  output({ ok: false, error: 'Usage: node create-delivery-note.js \'<JSON>\'' });
  process.exit(1);
}

let params;
try {
  params = JSON.parse(jsonArg);
} catch (e) {
  output({ ok: false, error: `Invalid JSON: ${e.message}` });
  process.exit(1);
}

createDeliveryNote(params)
  .then((result) => {
    output(result);
    process.exit(0);
  })
  .catch((err) => {
    output({ ok: false, error: err.message || String(err) });
    process.exit(1);
  });
