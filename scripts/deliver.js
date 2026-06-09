#!/usr/bin/env node

// Sends the digest via email (Resend), prints to terminal, or both.
// Reads delivery config from ~/.job-scout/config.json
//
// Delivery methods (config.delivery.method):
//   "email"    — send via Resend (default)
//   "terminal" — print to stdout
//   "both"     — email + print to stdout
//
// Flags:
//   --dry-run  — override to terminal output regardless of config
//   --message  — pass digest text as argument instead of stdin
//   --file     — read digest text from a file instead of stdin
//   --test     — send a test email to verify delivery is working

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { config as loadEnv } from 'dotenv';

const USER_DIR = join(homedir(), '.job-scout');
const CONFIG_PATH = join(USER_DIR, 'config.json');
const ENV_PATH = join(USER_DIR, '.env');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isTest = args.includes('--test');

async function getDigestText() {
  if (isTest) {
    const now = new Date().toLocaleString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    let config = {};
    if (existsSync(CONFIG_PATH)) config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
    const companies = (config.companies || []).map(c => {
      if (c.ats === 'manual') return `  - ${c.name} (manual) — ${c.careers_url}`;
      return `  - ${c.name} (${c.ats})`;
    }).join('\n');
    return `Job Scout — Test Email — ${now}\n\nThis is a test to verify delivery is working.\n\nYour tracked companies:\n${companies}\n\nLocations: ${(config.filters?.locations || []).join(', ') || 'any'}\nSchedule: ${config.schedule?.time || '09:05'} on ${(config.schedule?.days || []).join(', ') || 'every day'}\n\nIf you received this, your Job Scout setup is working correctly.`;
  }
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
  const fbEnvPath = join(homedir(), '.follow-builders', '.env');
  if (existsSync(ENV_PATH)) loadEnv({ path: ENV_PATH });
  if (existsSync(fbEnvPath)) loadEnv({ path: fbEnvPath, override: false });

  let config = {};
  if (existsSync(CONFIG_PATH)) {
    config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
  }

  const delivery = config.delivery || { method: 'terminal' };
  const method = isDryRun ? 'terminal' : (delivery.method || 'terminal');
  const digestText = await getDigestText();

  if (!digestText || digestText.trim().length === 0) {
    console.log(JSON.stringify({ status: 'skipped', reason: 'Empty digest' }));
    return;
  }

  if (method === 'email' || method === 'both') {
    const apiKey = process.env.RESEND_API_KEY;
    const toEmail = delivery.email;
    if (!apiKey) throw new Error('RESEND_API_KEY not set');
    if (!toEmail) throw new Error('delivery.email not set in config.json');
    await sendEmail(digestText, apiKey, toEmail);

    if (method === 'both') {
      console.log(digestText);
      console.log(JSON.stringify({ status: 'ok', method: 'both', message: `Sent to ${toEmail} + printed to terminal` }));
    } else {
      console.log(JSON.stringify({ status: 'ok', method: 'email', message: `Sent to ${toEmail}` }));
    }
  } else {
    console.log(digestText);
  }
}

main().catch(err => {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
});
