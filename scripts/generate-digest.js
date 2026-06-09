#!/usr/bin/env node

// Reads the JSON blob from prepare-jobs.js, calls Claude to format the digest,
// writes digest text to stdout for deliver.js.
// Exits with code 2 (no-new-jobs signal) when there's nothing to send.

import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { config as loadEnv } from 'dotenv';

const USER_DIR = join(homedir(), '.job-scout');
const ENV_PATH = join(USER_DIR, '.env');
const SKILL_DIR = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

async function main() {
  // Try job-scout .env first, fall back to follow-builders .env
  const fbEnvPath = join(homedir(), '.follow-builders', '.env');
  if (existsSync(ENV_PATH)) loadEnv({ path: ENV_PATH });
  else if (existsSync(fbEnvPath)) loadEnv({ path: fbEnvPath });

  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf-8');

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`generate-digest: invalid JSON — ${err.message}\n`);
    process.exit(1);
  }

  if (data.status === 'error') {
    process.stderr.write(`generate-digest: prepare-jobs error — ${data.message}\n`);
    process.exit(1);
  }

  const { totalNew, isFirstRun, results = [], config: cfg = {} } = data;

  // First run: just set the baseline, nothing to send
  if (isFirstRun) {
    process.stderr.write(`generate-digest: first run — baseline snapshot taken, ${results.reduce((s, r) => s + (r.totalMatching || 0), 0)} jobs indexed. Next run will surface new ones.\n`);
    process.exit(2);
  }

  // onlyWhenNew: skip if nothing new
  if (cfg.delivery?.onlyWhenNew && totalNew === 0) {
    process.stderr.write(`generate-digest: no new jobs today, skipping.\n`);
    process.exit(2);
  }

  const promptPath = join(SKILL_DIR, 'prompts', 'format-jobs.md');
  const formatPrompt = existsSync(promptPath)
    ? await readFile(promptPath, 'utf-8')
    : 'Format the job listings as a clean digest.';

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const systemPrompt = formatPrompt;
  const userPrompt = `Produce the job digest from the data below.

Today's date: ${today}
Locations filter: ${cfg.locations?.join(', ') || 'any'}
New jobs found: ${totalNew}

## Job Data
${JSON.stringify(results, null, 2)}

Output only the digest text — no preamble.`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    process.stderr.write('generate-digest: ANTHROPIC_API_KEY not set\n');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  const digest = response.content[0]?.text;
  if (!digest) {
    process.stderr.write('generate-digest: Claude returned empty response\n');
    process.exit(1);
  }

  process.stdout.write(digest);
  if (!digest.endsWith('\n')) process.stdout.write('\n');
}

main().catch(err => {
  process.stderr.write(`generate-digest: ${err.message}\n`);
  process.exit(1);
});
