const crypto = require('crypto');

const BASE_URL = process.env.TARGET_URL || 'http://localhost:3000';

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function log(color, prefix, msg) {
  console.log(`${color}${COLORS.bold}[${prefix}]${COLORS.reset} ${msg}`);
}

function logDim(msg) {
  console.log(`${COLORS.dim}${msg}${COLORS.reset}`);
}

function generateUUID() {
  return crypto.randomUUID();
}

function generateHmacSignature(body, secret) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function generateTwilioSignature(url, params, authToken) {
  let data = url;
  const sortedKeys = Object.keys(params).sort();
  for (const key of sortedKeys) {
    data += key + params[key];
  }
  return crypto.createHmac('sha1', authToken).update(data).digest('base64');
}

// ─── ServiceTitan ────────────────────────────────────────────────────────────

function buildServiceTitanPayload(eventType = 'EstimateUnbooked') {
  const correlationId = generateUUID();
  const timestamp = new Date().toISOString();

  const payloads = {
    EstimateUnbooked: {
      Type: 'EstimateUnbooked',
      CorrelationId: correlationId,
      Timestamp: timestamp,
      Data: {
        EstimateId: Math.floor(Math.random() * 100000) + 1,
        EstimateNumber: `EST-${Date.now()}`,
        CustomerId: Math.floor(Math.random() * 10000) + 1,
        CustomerName: 'Test Customer',
        CustomerPhone: '+15551234567',
        CustomerEmail: 'test@example.com',
        BusinessUnitId: 1,
        BusinessUnitName: 'HVAC Service',
        CreatedOn: timestamp,
        EstimateAmount: Math.floor(Math.random() * 5000) + 500,
        OpportunityStatus: 'Unbooked',
        TechnicianName: null,
        JobType: 'HVAC Repair',
        Description: 'Test estimate that was not booked',
      },
    },
    JobCompleted: {
      Type: 'JobCompleted',
      CorrelationId: correlationId,
      Timestamp: timestamp,
      Data: {
        JobId: Math.floor(Math.random() * 100000) + 1,
        JobNumber: `JOB-${Date.now()}`,
        CustomerId: Math.floor(Math.random() * 10000) + 1,
        CustomerName: 'Test Customer',
        BusinessUnitId: 1,
        CompletedOn: timestamp,
        TotalAmount: Math.floor(Math.random() * 2000) + 200,
      },
    },
    EstimateCreated: {
      Type: 'EstimateCreated',
      CorrelationId: correlationId,
      Timestamp: timestamp,
      Data: {
        EstimateId: Math.floor(Math.random() * 100000) + 1,
        EstimateNumber: `EST-${Date.now()}`,
        CustomerId: Math.floor(Math.random() * 10000) + 1,
        EstimateAmount: Math.floor(Math.random() * 5000) + 500,
      },
    },
  };

  return payloads[eventType] || payloads.EstimateUnbooked;
}

async function sendServiceTitanWebhook(options = {}) {
  const { eventType = 'EstimateUnbooked', hmacKey = null } = options;
  const payload = buildServiceTitanPayload(eventType);
  const body = JSON.stringify(payload);

  log(COLORS.cyan, 'ST', `Sending ${eventType} webhook...`);
  logDim(`  CorrelationId: ${payload.CorrelationId}`);
  logDim(`  Timestamp: ${payload.Timestamp}`);

  const headers = {
    'Content-Type': 'application/json',
    'x-st-webhook-signature': 'test-signature',
  };

  if (hmacKey) {
    const signature = generateHmacSignature(body, hmacKey);
    headers['x-st-webhook-signature'] = signature;
    logDim(`  HMAC signature: ${signature.substring(0, 16)}...`);
  }

  try {
    const response = await fetch(`${BASE_URL}/api/v1/webhooks/servicetitan`, {
      method: 'POST',
      headers,
      body,
    });

    const data = await response.json();

    if (response.ok) {
      log(COLORS.green, 'ST', `Success (${response.status})`);
      logDim(`  ingestion_event_id: ${data.ingestion_event_id}`);
      logDim(`  duplicate: ${data.duplicate}`);
    } else {
      log(COLORS.red, 'ST', `Failed (${response.status})`);
      logDim(`  error: ${data.error}`);
      logDim(`  message: ${data.message}`);
    }

    return { status: response.status, data };
  } catch (error) {
    log(COLORS.red, 'ST', `Error: ${error.message}`);
    return { status: 0, data: null, error: error.message };
  }
}

// ─── Twilio ──────────────────────────────────────────────────────────────────

function buildTwilioPayload(overrides = {}) {
  return {
    From: '+15559876543',
    To: '+15551234567',
    Body: 'I want to schedule an appointment for next week',
    MessageSid: `SM${generateUUID().replace(/-/g, '')}`,
    AccountSid: 'AC' + crypto.randomBytes(16).toString('hex'),
    NumMedia: '0',
    ...overrides,
  };
}

async function sendTwilioWebhook(options = {}) {
  const { from, body: smsBody, to } = options;
  const payload = buildTwilioPayload({
    ...(from && { From: from }),
    ...(smsBody && { Body: smsBody }),
    ...(to && { To: to }),
  });

  log(COLORS.cyan, 'TW', `Sending inbound SMS webhook...`);
  logDim(`  From: ${payload.From}`);
  logDim(`  To: ${payload.To}`);
  logDim(`  Body: ${payload.Body}`);
  logDim(`  MessageSid: ${payload.MessageSid}`);

  const formData = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    formData.append(key, value);
  }

  try {
    const response = await fetch(`${BASE_URL}/api/v1/webhooks/twilio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const text = await response.text();

    if (response.ok) {
      log(COLORS.green, 'TW', `Success (${response.status})`);
      logDim(`  Response: ${text.substring(0, 100)}...`);
    } else {
      log(COLORS.red, 'TW', `Failed (${response.status})`);
      logDim(`  Response: ${text.substring(0, 200)}`);
    }

    return { status: response.status, data: text };
  } catch (error) {
    log(COLORS.red, 'TW', `Error: ${error.message}`);
    return { status: 0, data: null, error: error.message };
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function printUsage() {
  console.log(`
${COLORS.bold}Usage:${COLORS.reset}
  node scripts/simulate-traffic.js <command> [options]

${COLORS.bold}Commands:${COLORS.reset}
  ${COLORS.cyan}st${COLORS.reset}              Send ServiceTitan webhook
  ${COLORS.cyan}tw${COLORS.reset}              Send Twilio inbound SMS webhook
  ${COLORS.cyan}both${COLORS.reset}            Send both webhooks
  ${COLORS.cyan}st-burst${COLORS.reset}       Send multiple ServiceTitan webhooks
  ${COLORS.cyan}tw-burst${COLORS.reset}       Send multiple Twilio SMS webhooks

${COLORS.bold}Options:${COLORS.reset}
  --event <type>     ServiceTitan event type (default: EstimateUnbooked)
  --hmac-key <key>   HMAC key for ServiceTitan signature
  --from <number>    Twilio sender number
  --body <text>      Twilio SMS body
  --count <n>        Number of burst messages (default: 5)
  --target <url>     Base URL (default: http://localhost:3000)

${COLORS.bold}Examples:${COLORS.reset}
  node scripts/simulate-traffic.js st --hmac-key my-secret-key
  node scripts/simulate-traffic.js tw --body "Yes I want to book"
  node scripts/simulate-traffic.js both
  node scripts/simulate-traffic.js st-burst --count 10
  `);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const command = args[0];
  const flags = {};
  for (let i = 1; i < args.length; i += 2) {
    if (args[i].startsWith('--')) {
      flags[args[i].slice(2)] = args[i + 1];
    }
  }

  if (flags.target) {
    process.env.TARGET_URL = flags.target;
  }

  console.log(`${COLORS.bold}═══════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.bold}  HVAC Revenue Recovery - Traffic Simulator${COLORS.reset}`);
  console.log(`${COLORS.bold}═══════════════════════════════════════════${COLORS.reset}`);
  logDim(`Target: ${BASE_URL}`);
  logDim(`Time: ${new Date().toISOString()}`);
  console.log('');

  switch (command) {
    case 'st':
      await sendServiceTitanWebhook({
        eventType: flags.event || 'EstimateUnbooked',
        hmacKey: flags['hmac-key'] || null,
      });
      break;

    case 'tw':
      await sendTwilioWebhook({
        from: flags.from,
        body: flags.body,
        to: flags.to,
      });
      break;

    case 'both':
      await sendServiceTitanWebhook({
        eventType: flags.event || 'EstimateUnbooked',
        hmacKey: flags['hmac-key'] || null,
      });
      console.log('');
      await sendTwilioWebhook({
        from: flags.from,
        body: flags.body || 'Yes I want to schedule an appointment',
      });
      break;

    case 'st-burst': {
      const count = parseInt(flags.count || '5', 10);
      log(COLORS.yellow, 'ST', `Burst mode: sending ${count} webhooks`);
      for (let i = 0; i < count; i++) {
        log(COLORS.dim, 'ST', `--- ${i + 1}/${count} ---`);
        await sendServiceTitanWebhook({
          eventType: flags.event || 'EstimateUnbooked',
          hmacKey: flags['hmac-key'] || null,
        });
        if (i < count - 1) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      log(COLORS.green, 'ST', `Burst complete: ${count} webhooks sent`);
      break;
    }

    case 'tw-burst': {
      const count = parseInt(flags.count || '5', 10);
      log(COLORS.yellow, 'TW', `Burst mode: sending ${count} SMS webhooks`);
      const bodies = [
        'Yes I want to book',
        'Can you call me back?',
        'What time works?',
        'Send me more info',
        'I am not interested',
        'STOP',
        'What is the price?',
        'Can you come tomorrow?',
      ];
      for (let i = 0; i < count; i++) {
        log(COLORS.dim, 'TW', `--- ${i + 1}/${count} ---`);
        await sendTwilioWebhook({
          body: bodies[i % bodies.length],
        });
        if (i < count - 1) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      log(COLORS.green, 'TW', `Burst complete: ${count} SMS webhooks sent`);
      break;
    }

    default:
      console.error(`${COLORS.red}Unknown command: ${command}${COLORS.reset}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`${COLORS.red}Fatal: ${err.message}${COLORS.reset}`);
  process.exit(1);
});
