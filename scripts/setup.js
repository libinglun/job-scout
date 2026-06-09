#!/usr/bin/env node

// First-time setup for Job Scout.
// - Copies default config to ~/.job-scout/config.json (if not already present)
// - Validates that required secrets are set in ~/.job-scout/.env
// - Installs npm dependencies
// - Registers the Windows Task Scheduler entry
// - Runs a dry baseline pass (first run snapshots existing jobs; next run surfaces new ones)

import { readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const USER_DIR = join(homedir(), '.job-scout');
const CONFIG_PATH = join(USER_DIR, 'config.json');
const ENV_PATH = join(USER_DIR, '.env');
const SKILL_DIR = fileURLToPath(new URL('..', import.meta.url)).replace(/[/\\]$/, '');
const SCRIPTS_DIR = join(SKILL_DIR, 'scripts');

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf-8', stdio: 'inherit', ...opts });
}

function check(label, ok, hint) {
  const mark = ok ? '✓' : '✗';
  console.log(`  ${mark}  ${label}${ok ? '' : `\n     → ${hint}`}`);
  return ok;
}

async function main() {
  console.log('\nJob Scout — Setup\n');

  // 1. User dir
  await mkdir(USER_DIR, { recursive: true });

  // 2. Config
  if (!existsSync(CONFIG_PATH)) {
    const src = join(SKILL_DIR, 'config', 'default-config.json');
    await copyFile(src, CONFIG_PATH);
    console.log(`  Created config at ${CONFIG_PATH}`);
    console.log(`  → Open it and fill in your companies, targetRole, and delivery.email.\n`);
  } else {
    console.log(`  Config already exists at ${CONFIG_PATH}`);
  }

  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));

  // 3. .env check
  console.log('\nChecking secrets (.env):\n');
  let envContent = existsSync(ENV_PATH) ? await readFile(ENV_PATH, 'utf-8') : '';

  // Also fall back to follow-builders .env for discovery
  const fbEnvPath = join(homedir(), '.follow-builders', '.env');
  if (!envContent && existsSync(fbEnvPath)) envContent = await readFile(fbEnvPath, 'utf-8');

  const hasAnthropicKey = /ANTHROPIC_API_KEY=.+/.test(envContent);
  const hasResendKey = /RESEND_API_KEY=.+/.test(envContent);

  const ok1 = check(
    'ANTHROPIC_API_KEY',
    hasAnthropicKey,
    `Add it to ${ENV_PATH}:\n     ANTHROPIC_API_KEY=sk-ant-...`
  );
  const ok2 = check(
    'RESEND_API_KEY',
    hasResendKey,
    `Add it to ${ENV_PATH}:\n     RESEND_API_KEY=re_...`
  );

  if (!ok1 || !ok2) {
    console.log(`\nCreate ${ENV_PATH} with the missing keys, then re-run setup.\n`);
  }

  // 4. Config completeness
  console.log('\nChecking config:\n');
  check('targetRole set', Boolean(config.targetRole && !config.targetRole.startsWith('Describe')),
    'Edit targetRole in config.json to describe your ideal role.');
  check('delivery.email set', Boolean(config.delivery?.email),
    'Edit delivery.email in config.json with your email address.');
  check('companies listed', (config.companies || []).filter(c => c.name).length > 0,
    'Add at least one company to config.json.');

  // 5. npm dependencies
  console.log('\nInstalling npm dependencies...\n');
  try {
    run('npm install', { cwd: SCRIPTS_DIR });
    console.log('\n  ✓  Dependencies installed');
  } catch {
    console.log('\n  ✗  npm install failed — make sure Node.js is installed');
  }

  // 6. Task Scheduler
  console.log('\nRegistering Windows Task Scheduler entry...\n');
  try {
    run(`node "${join(SCRIPTS_DIR, 'setup-task.js')}"`, { cwd: SCRIPTS_DIR });
  } catch (err) {
    console.log(`  ✗  Task Scheduler registration failed: ${err.message}`);
    console.log(`     You can re-run it later: node ${join(SCRIPTS_DIR, 'setup-task.js')}`);
  }

  // 7. Baseline pass
  if (ok1) {
    console.log('\nRunning baseline pass (snapshots existing jobs — no email sent)...\n');
    try {
      const { execSync: exec2 } = await import('child_process');
      exec2(`node "${join(SCRIPTS_DIR, 'prepare-jobs.js')}" > nul`, {
        cwd: SCRIPTS_DIR,
        encoding: 'utf-8',
        shell: true
      });
      console.log('  ✓  Baseline complete. Next scheduled run will surface only new jobs.\n');
    } catch {
      console.log('  ✗  Baseline pass failed — check your config and API key, then re-run setup.\n');
    }
  } else {
    console.log('\n  (Skipping baseline — ANTHROPIC_API_KEY not set)\n');
  }

  console.log('\nSetup complete. Job Scout will run automatically per your schedule.');
  console.log(`Config: ${CONFIG_PATH}`);
  console.log(`Logs:   ${join(USER_DIR, 'job-scout.log')}\n`);
}

main().catch(err => {
  console.error(`\nSetup failed: ${err.message}\n`);
  process.exit(1);
});
