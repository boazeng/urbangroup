/**
 * Bot 810 — Aging Report (גיול חובות מפורט בשקלים)
 * Runs Priority's built-in detailed aging report via Web SDK procStart.
 *
 * Usage:
 *   node 810-aging-report.js
 *
 * Environment variables (from .env):
 *   PRIORITY_URL, PRIORITY_USERNAME, PRIORITY_PASSWORD
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '..', '.env') });
const { login, procStart } = require('priority-web-sdk');

const PROC_NAME = 'AGEDEBTCUST2';

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

async function runAgingReport() {
  const cfg = parseConfig();
  console.log(`Connecting to: ${cfg.wcfUrl}`);
  console.log(`Company: ${cfg.company}`);

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
  } catch (err) {
    throw new Error(`Login failed: ${err.message || err.text || JSON.stringify(err)}`);
  }

  console.log('Login successful');
  console.log(`Starting procedure: ${PROC_NAME}`);

  let step = await procStart(PROC_NAME, 'R', cfg.company);
  console.log('procStart result:', JSON.stringify(step, null, 2));

  // Walk through the procedure steps
  const MAX_STEPS = 20;
  for (let i = 0; i < MAX_STEPS; i++) {
    if (!step || !step.proc) {
      console.log('No more steps (proc is null)');
      break;
    }

    const type = step.type;
    console.log(`\n--- Step ${i + 1}, type: "${type}" ---`);
    console.log('Step data:', JSON.stringify(step, null, 2));

    if (type === 'end') {
      console.log('Procedure ended');
      break;
    }

    if (type === 'inputOptions') {
      // Auto-select first option (confirm)
      console.log('inputOptions — selecting option 1');
      step = await step.proc.inputOptions(1, 1);
    } else if (type === 'inputFields') {
      // Input fields step — send empty to accept defaults
      const fields = step.input && step.input.EditFields;
      console.log('inputFields — fields:', JSON.stringify(fields, null, 2));

      // Accept defaults by sending back the same fields with no changes
      const data = { EditFields: [] };
      if (fields && fields.length > 0) {
        for (const f of fields) {
          data.EditFields.push({
            field: f.field,
            op: 0,
            value: f.value || '',
          });
        }
      }
      console.log('Sending inputFields data:', JSON.stringify(data, null, 2));
      step = await step.proc.inputFields(1, data);
    } else if (type === 'reportOptions') {
      // Report format selection — choose HTML (format 1 = HTML)
      console.log('reportOptions — selecting format');
      step = await step.proc.reportOptions(1);
    } else if (type === 'displayUrl') {
      // Report URL is available
      console.log('Report URL(s):', JSON.stringify(step.Urls || step.urls, null, 2));
      if (step.proc && step.proc.continueProc) {
        step = await step.proc.continueProc();
      } else {
        break;
      }
    } else if (type === 'message') {
      // Confirmation/warning message — confirm
      console.log('Message:', step.message || step.text);
      if (step.proc && step.proc.messageConfirm) {
        step = await step.proc.messageConfirm(1);
      } else if (step.proc && step.proc.continueProc) {
        step = await step.proc.continueProc();
      } else {
        break;
      }
    } else {
      console.log(`Unknown step type: "${type}" — attempting continueProc`);
      if (step.proc && step.proc.continueProc) {
        step = await step.proc.continueProc();
      } else {
        break;
      }
    }
  }

  console.log('\nDone.');
  return step;
}

// Run standalone
if (require.main === module) {
  runAgingReport()
    .then((result) => {
      console.log('\nFinal result:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error:', err.message || err);
      process.exit(1);
    });
}

module.exports = { runAgingReport };
