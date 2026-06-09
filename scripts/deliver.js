#!/usr/bin/env node

// Sends the digest via email (Resend) or prints to stdout.
// Reads delivery config from ~/.job-scout/config.json

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { config as loadEnv } from 'dotenv';

const USER_DIR = join(homedir(), '.job-scout');
const CONFIG_PATH = join(USER_DIR, 'config.json');
const ENV_PATH = join(USER_DIR, '.env');

async function getDigestText() {
  const args = process.argv.slice(2);
  const msgIdx = args.indexOf('--message');
  if (msgIdx !== -1 && args[msgIdx + 1]) return args[msgIdx + 1];
  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) return await readFile(args[fileIdx + 1], 'utf-8');
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

async function sendEmail(text, apiKey, toEmail) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: 'Job Scout <digest@resend.dev>',
      to: [toEmail],
      subject: `Job Scout — ${new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      })}`,
      text
    })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Resend API error: ${err.message || JSON.stringify(err)}`);
  }
}

async function main() {
  // Load env: job-scout first, fall back to follow-builders
  const fbEnvPath = join(homedir(), '.follow-builders', '.env');
  if (existsSync(ENV_PATH)) loadEnv({ path: ENV_PATH });
  else if (existsSync(fbEnvPath)) loadEnv({ path: fbEnvPath });

  let config = {};
  if (existsSync(CONFIG_PATH)) {
    config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
  }

  const delivery = config.delivery || { method: 'stdout' };
  const digestText = await getDigestText();

  if (!digestText || digestText.trim().length === 0) {
    console.log(JSON.stringify({ status: 'skipped', reason: 'Empty digest' }));
    return;
  }

  if (delivery.method === 'email') {
    const apiKey = process.env.RESEND_API_KEY;
    const toEmail = delivery.email;
    if (!apiKey) throw new Error('RESEND_API_KEY not set');
    if (!toEmail) throw new Error('delivery.email not set in config.json');
    await sendEmail(digestText, apiKey, toEmail);
    console.log(JSON.stringify({ status: 'ok', method: 'email', message: `Sent to ${toEmail}` }));
  } else {
    console.log(digestText);
  }
}

main().catch(err => {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
});
