#!/usr/bin/env node

// Registers (or re-registers) the "Job Scout" scheduled task from
// the schedule section of ~/.job-scout/config.json.
//
// Windows: uses Task Scheduler via PowerShell.
// macOS:   launchd support not yet implemented — prints manual instructions.
//
// Run this whenever you change schedule.time or schedule.days in config.json.

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const USER_DIR = join(homedir(), '.job-scout');
const CONFIG_PATH = join(USER_DIR, 'config.json');
const TASK_NAME = 'Job Scout';

// Resolve the bat file relative to this script
const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');
const BAT_PATH = join(SCRIPT_DIR, 'run-jobs.bat');

const DAY_MAP = {
  mon: 'MON', monday: 'MON',
  tue: 'TUE', tuesday: 'TUE',
  wed: 'WED', wednesday: 'WED',
  thu: 'THU', thursday: 'THU',
  fri: 'FRI', friday: 'FRI',
  sat: 'SAT', saturday: 'SAT',
  sun: 'SUN', sunday: 'SUN'
};

const ALL_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function parseDays(days) {
  if (!days || days.length === 0) return ALL_DAYS;
  const mapped = days.map(d => {
    const key = d.toLowerCase();
    if (!DAY_MAP[key]) throw new Error(`Unknown day: "${d}". Use Mon/Tue/Wed/Thu/Fri/Sat/Sun.`);
    return DAY_MAP[key];
  });
  // Deduplicate, preserve week order
  return ALL_DAYS.filter(d => mapped.includes(d));
}

function ps(cmd) {
  return execSync(`powershell -NonInteractive -Command "${cmd.replace(/"/g, '\\"')}"`, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  }).trim();
}

async function main() {
  if (process.platform === 'darwin') {
    const config = existsSync(CONFIG_PATH)
      ? JSON.parse(await readFile(CONFIG_PATH, 'utf-8'))
      : {};
    const { time = '09:05', days } = config.schedule || {};
    const resolvedDays = parseDays(days);
    const label = resolvedDays.length === 7 ? 'daily' : resolvedDays.join('/');

    console.log('macOS scheduled task setup is not yet automated.');
    console.log('To schedule Job Scout manually, create a launchd plist:');
    console.log(`  Schedule: ${label} at ${time}`);
    console.log(`  Script:   ${BAT_PATH.replace('run-jobs.bat', 'run-jobs.sh')}`);
    console.log('');
    console.log('See SKILL.md → macOS section for full launchd instructions.');
    return;
  }

  if (!existsSync(CONFIG_PATH)) {
    console.error(`Config not found at ${CONFIG_PATH}. Run job-scout setup first.`);
    process.exit(1);
  }

  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
  const { time = '09:05', days } = config.schedule || {};

  // Validate time format HH:MM
  if (!/^\d{2}:\d{2}$/.test(time)) {
    console.error(`Invalid schedule.time "${time}" — must be HH:MM (e.g. "09:05")`);
    process.exit(1);
  }

  const resolvedDays = parseDays(days);
  const isDaily = resolvedDays.length === 7;

  if (!existsSync(BAT_PATH)) {
    console.error(`run-jobs.bat not found at ${BAT_PATH}`);
    process.exit(1);
  }

  const scheduleDesc = isDaily
    ? `daily at ${time}`
    : `${resolvedDays.join('/')} at ${time}`;

  console.log(`Registering "Job Scout" task: ${scheduleDesc}`);

  // Build schtasks command via PowerShell to avoid quoting issues with spaces in paths
  const sc = isDaily ? 'DAILY' : 'WEEKLY';
  const dayArg = isDaily ? '' : `/d ${resolvedDays.join(',')}`;

  // Delete existing task silently (ignore error if not found)
  try {
    ps(`Unregister-ScheduledTask -TaskName '${TASK_NAME}' -Confirm:$false -ErrorAction SilentlyContinue`);
  } catch { /* not found, that's fine */ }

  // Register fresh
  const action = `New-ScheduledTaskAction -Execute '${BAT_PATH}'`;
  let trigger;
  if (isDaily) {
    trigger = `New-ScheduledTaskTrigger -Daily -At '${time}'`;
  } else {
    const psdays = resolvedDays.map(d => {
      const map = { MON:'Monday',TUE:'Tuesday',WED:'Wednesday',THU:'Thursday',FRI:'Friday',SAT:'Saturday',SUN:'Sunday' };
      return map[d];
    }).join("','");
    trigger = `New-ScheduledTaskTrigger -Weekly -DaysOfWeek '${psdays}' -At '${time}'`;
  }

  const settings = `New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)`;

  const registerCmd = [
    `$a = ${action}`,
    `$t = ${trigger}`,
    `$s = ${settings}`,
    `Register-ScheduledTask -TaskName '${TASK_NAME}' -Description 'Daily job openings digest from tracked companies' -Action $a -Trigger $t -Settings $s -Force | Out-Null`,
    `Write-Output 'OK'`
  ].join('; ');

  const result = ps(registerCmd);
  if (result === 'OK') {
    console.log(`Task "${TASK_NAME}" registered successfully: ${scheduleDesc}`);
  } else {
    console.error(`Unexpected output: ${result}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`setup-task: ${err.message}`);
  process.exit(1);
});
