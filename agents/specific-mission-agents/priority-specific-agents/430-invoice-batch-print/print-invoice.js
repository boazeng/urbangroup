/**
 * print-invoice.js
 * Triggers print (WWWSHOWHTM) on an AINVOICES record via Web SDK.
 * This generates a PDF attachment on the invoice.
 *
 * Usage:  node print-invoice.js <IVNUM> [FORMAT_NAME]
 * Output: JSON to stdout  { "ok": true, "ivnum": "..." }
 *                      or { "ok": false, "error": "..." }
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '..', '.env') });
const { login, formStart, procStart } = require('priority-web-sdk');

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

function output(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }
function log(msg) { process.stderr.write(`[print-invoice] ${msg}\n`); }

const withTimeout = (fn, label, ms = 60000) =>
  Promise.race([
    fn(),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))
  ]);

async function printInvoice(ivnum, formatName) {
  const cfg = parseConfig();

  log(`Logging in to ${cfg.company}...`);
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
    log(`Message: ${msg.message || JSON.stringify(msg)}`);
    if (msg && msg.form && msg.form.warningConfirm) {
      msg.form.warningConfirm(1);
    }
  };

  log(`Opening AINVOICES form...`);
  const form = await formStart('AINVOICES', onShowMessage, () => {}, cfg.company, 1);

  // Find the invoice
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
    // Try with search filter
    log(`Invoice ${ivnum} not in first page, trying search...`);
    try {
      await form.setSearchFilter({
        or: 0,
        ignorecase: 1,
        QueryValues: [
          { field: 'IVNUM', fromval: ivnum, toval: '', op: 0, sort: 0, isdesc: 0 },
        ],
      });
      const rows2 = await form.getRows(1);
      const formData2 = rows2 && rows2.AINVOICES;
      if (formData2) {
        for (const [rowIdx, row] of Object.entries(formData2)) {
          if (row.IVNUM === ivnum) {
            targetRow = parseInt(rowIdx, 10);
            break;
          }
        }
      }
    } catch (e) {
      log(`Search filter failed: ${e.message}`);
    }
  }

  if (targetRow === null) {
    await form.endCurrentForm();
    throw new Error(`Invoice ${ivnum} not found`);
  }

  await form.setActiveRow(targetRow);
  log(`Found invoice ${ivnum} at row ${targetRow}`);

  // Activate print procedure (WWWSHOWHTM)
  log(`Activating print procedure...`);

  let pdfUrl = '';

  const procPromise = new Promise((resolve) => {
    form.activateStart('WWWSHOWAIV', 'P', (data) => {
      log(`activateStart callback: ${JSON.stringify(Object.keys(data || {}))}`);
      resolve(data);
    });
  });

  // Use the proc approach with step-by-step handling
  const startResult = await withTimeout(
    () => form.activateStart('WWWSHOWAIV', 'P'),
    'activateStart'
  );

  log(`activateStart result type: ${typeof startResult}`);
  log(`activateStart result keys: ${startResult ? Object.keys(startResult) : 'null'}`);

  // The procedure may return steps that need interaction
  async function handleProcStep(step) {
    if (!step) return;

    const type = step.type || '';
    log(`Proc step: type=${type}`);

    if (type === 'inputOptions') {
      log(`inputOptions: choosing format...`);
      // Choose format — try to find by name, default to last (usually the custom one)
      let choice = -1; // -1 = last option
      if (step.Options && Array.isArray(step.Options)) {
        log(`Options: ${JSON.stringify(step.Options.map(o => o.title || o.name || o))}`);
        if (formatName) {
          const idx = step.Options.findIndex(o =>
            (o.title || o.name || '').includes(formatName)
          );
          if (idx >= 0) choice = idx + 1;
        }
        if (choice === -1) choice = step.Options.length; // last option
      }
      const next = await step.proc.inputOptions(choice, 1);
      await handleProcStep(next);
    } else if (type === 'inputFields') {
      const next = await step.proc.inputFields(1, 1);
      await handleProcStep(next);
    } else if (type === 'reportOptions') {
      const next = await step.proc.reportOptions(2); // 2 = PDF output
      await handleProcStep(next);
    } else if (type === 'displayUrl') {
      if (step.Urls && step.Urls.length > 0) {
        const urlObj = step.Urls[0];
        pdfUrl = urlObj.url || '';
        if (urlObj.datauri) {
          // Save the document data
          const dataUri = urlObj.datauri;
          const commaIdx = dataUri.indexOf(',');
          if (commaIdx > 0) {
            const b64 = dataUri.substring(commaIdx + 1);
            const buf = Buffer.from(b64, 'base64');
            const fs = require('fs');
            const outFile = `invoice_${ivnum.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
            fs.writeFileSync(outFile, buf);
            log(`Saved invoice HTML: ${outFile} (${buf.length} bytes)`);
          }
        }
        log(`Invoice URL: ${pdfUrl}`);
      }
    } else if (type === 'message') {
      log(`Message: ${step.message || ''}`);
      log(`Message type: ${step.messagetype || ''}`);
      log(`Message keys: ${JSON.stringify(Object.keys(step))}`);
      try {
        const next = await step.proc.message(1); // 1 = OK
        await handleProcStep(next);
      } catch (e) {
        log(`message confirm error: ${e.message}`);
      }
    } else if (type === 'end') {
      log(`Procedure ended`);
    } else {
      if (type === 'client') {
        // Override PRINTORIG to get original (מקור) instead of copy (העתק)
        log(`Client params before: ${JSON.stringify(step.data)}`);
        if (step.data && Array.isArray(step.data)) {
          for (const param of step.data) {
            if (param.NAM && param.NAM.includes('PRINTORIG')) {
              param.VAL = '1'; // 1 = original (מקור)
              log(`Set PRINTORIG to 0 (מקור)`);
            }
          }
        }
        log(`Client params after: ${JSON.stringify(step.data)}`);
        try {
          const next = await step.proc.clientContinue();
          await handleProcStep(next);
        } catch (e) {
          log(`clientContinue error: ${e.message}`);
        }
      } else if (type === 'documentOptions') {
        // Choose print format and output type
        log(`Formats: ${JSON.stringify(step.formats)}`);
        log(`PDF: ${step.pdf}, hasAutoMail: ${step.hasAutoMail}`);

        // Find the format with "תאור מוצר מורחב" or use last one
        let chosenFormat = -1;
        if (step.formats && Array.isArray(step.formats)) {
          for (let fi = 0; fi < step.formats.length; fi++) {
            const f = step.formats[fi];
            const title = f.title || f.name || f.text || '';
            log(`  Format ${fi}: ${title} (${f.name || f.entity || ''})`);
            if (title === 'עם תאור מוצר מורחב' || (formatName && title.includes(formatName))) {
              chosenFormat = fi;
            }
          }
          if (chosenFormat === -1) chosenFormat = step.formats.length - 1;
        }

        const formatVal = step.formats[chosenFormat]?.format ?? chosenFormat;
        log(`Choosing format: index=${chosenFormat}, value=${formatVal}`);
        try {
          // Try quick email (מייל מהיר) — should generate original + save to attachments
          // documentOptions(format, action, email, wordTemplate)
          // action: 0=display, 1=pdf, 2=print, 3=email, 4=quickmail
          // documentOptions(format, pdf, email_address, wordTemplate)
          // pdf=1 means generate PDF, email=address triggers quick email
          const emailAddr = process.env.GMAIL_USER || 'arielmpinvoice@gmail.com';
          log(`Trying documentOptions: format=${formatVal}, email=${emailAddr}`);
          const next = await step.proc.documentOptions(formatVal, 1, emailAddr, 0);
          await handleProcStep(next);
        } catch (e) {
          log(`documentOptions error: ${e.message}`);
        }
      } else {
        log(`Unknown step: ${type}, keys: ${JSON.stringify(Object.keys(step))}`);
      }
    }
  }

  await handleProcStep(startResult);

  try {
    await withTimeout(() => form.activateEnd(), 'activateEnd');
  } catch (e) {
    log(`activateEnd: ${e.message}`);
  }

  await form.endCurrentForm();
  log(`Print completed for ${ivnum}`);

  return { ok: true, ivnum };
}

// Main
const ivnum = process.argv[2];
const formatName = process.argv[3] || '';

if (!ivnum) {
  output({ ok: false, error: 'Usage: node print-invoice.js <IVNUM> [FORMAT_NAME]' });
  process.exit(1);
}

printInvoice(ivnum, formatName)
  .then(result => { output(result); process.exit(0); })
  .catch(err => { output({ ok: false, error: err.message || String(err) }); process.exit(1); });
