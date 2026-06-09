#!/usr/bin/env node

// Two-stage job filtering pipeline:
//   Stage 1 (coarse): broad category keywords drop obvious non-tech roles cheaply
//   Stage 2 (LLM):    Claude reads actual job descriptions + user's targetRole
//                     description and decides relevance, returning a reason per job
//
// Outputs JSON to stdout for generate-digest.js.

import Anthropic from '@anthropic-ai/sdk';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { config as loadEnv } from 'dotenv';

const USER_DIR = join(homedir(), '.job-scout');
const CONFIG_PATH = join(USER_DIR, 'config.json');
const SEEN_PATH = join(USER_DIR, 'seen-jobs.json');
const SKILL_DIR = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

// -- Config / state ----------------------------------------------------------

async function loadConfig() {
  if (existsSync(CONFIG_PATH)) {
    return JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
  }
  const defaultPath = join(SKILL_DIR, 'config', 'default-config.json');
  const defaults = JSON.parse(await readFile(defaultPath, 'utf-8'));
  await mkdir(USER_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(defaults, null, 2));
  return defaults;
}

async function loadSeen() {
  if (existsSync(SEEN_PATH)) return new Set(JSON.parse(await readFile(SEEN_PATH, 'utf-8')));
  return new Set();
}

async function saveSeen(seen) {
  await writeFile(SEEN_PATH, JSON.stringify([...seen], null, 2));
}

// -- HTML stripping ----------------------------------------------------------

function stripHtml(html = '') {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// -- ATS fetchers ------------------------------------------------------------

async function fetchGreenhouse(slug) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Greenhouse ${slug}: HTTP ${res.status}`);
  const data = await res.json();
  return (data.jobs || []).map(j => ({
    id: `gh-${j.id}`,
    title: j.title,
    location: j.location?.name || '',
    department: j.departments?.[0]?.name || '',
    description: stripHtml(j.content || '').slice(0, 800),
    url: j.absolute_url,
    postedAt: j.updated_at || null
  }));
}

async function fetchLever(slug) {
  const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Lever ${slug}: HTTP ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map(j => {
    const description = [
      j.descriptionPlain || '',
      j.openingPlain || '',
      j.additionalPlain || ''
    ].filter(Boolean).join('\n').slice(0, 800);
    return {
      id: `lv-${j.id}`,
      title: j.text,
      location: j.categories?.location || '',
      department: j.categories?.team || '',
      description,
      url: j.hostedUrl,
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null
    };
  });
}

// -- Stage 1: coarse category filter ----------------------------------------
// Drops obvious non-tech roles (sales, marketing, legal, etc.) cheaply,
// before spending tokens on LLM evaluation.

function coarseFilter(jobs, categories) {
  if (!categories || categories.length === 0) return jobs;
  return jobs.filter(j => {
    const text = `${j.title} ${j.department}`.toLowerCase();
    return categories.some(kw => text.includes(kw.toLowerCase()));
  });
}

function locationFilter(jobs, locations) {
  if (!locations || locations.length === 0) return jobs;
  return jobs.filter(j => {
    const loc = j.location.toLowerCase();
    return locations.some(l => {
      const ll = l.toLowerCase();
      if (ll === 'remote') return loc.includes('remote') || loc === '';
      return loc.includes(ll);
    });
  });
}

// -- Stage 2: LLM relevance filter -------------------------------------------
// Claude reads each job's actual title + description and the user's targetRole,
// then returns {id, relevant, reason} for each.

async function llmFilter(jobs, targetRole, apiKey) {
  if (jobs.length === 0) return [];

  const client = new Anthropic({ apiKey });

  const jobList = jobs.map(j => ({
    id: j.id,
    title: j.title,
    department: j.department || '(not specified)',
    location: j.location || '(not specified)',
    description: j.description || '(no description available)'
  }));

  const prompt = `You are evaluating job postings for a candidate. Decide if each job is relevant to their target role.

TARGET ROLE DESCRIPTION:
${targetRole}

JOBS TO EVALUATE:
${JSON.stringify(jobList, null, 2)}

Return a JSON array — one entry per job — in this exact format:
[{"id":"...","relevant":true,"reason":"one concise sentence explaining why it matches or doesn't"}]

Rules:
- Base your decision on technical fit with the target role description
- Read the actual job description content carefully — titles alone can be misleading
- If the job content clearly matches the candidate's background and interests: relevant: true
- If the role is in a different function (sales, marketing, legal, finance, HR, design): relevant: false
- When genuinely uncertain, lean toward including (relevant: true)
- Return JSON only, no other text`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }]
  });

  let decisions;
  try {
    const text = response.content[0]?.text?.trim() || '[]';
    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    decisions = JSON.parse(cleaned);
  } catch {
    process.stderr.write('prepare-jobs: LLM returned non-JSON, including all jobs as fallback\n');
    return jobs.map(j => ({ ...j, relevanceReason: 'included (LLM parse error)' }));
  }

  const decisionMap = new Map(decisions.map(d => [d.id, d]));
  return jobs
    .filter(j => decisionMap.get(j.id)?.relevant !== false)
    .map(j => ({ ...j, relevanceReason: decisionMap.get(j.id)?.reason || '' }));
}

// -- Main --------------------------------------------------------------------

async function main() {
  const fbEnvPath = join(homedir(), '.follow-builders', '.env');
  if (existsSync(join(USER_DIR, '.env'))) loadEnv({ path: join(USER_DIR, '.env') });
  else if (existsSync(fbEnvPath)) loadEnv({ path: fbEnvPath });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(JSON.stringify({ status: 'error', message: 'ANTHROPIC_API_KEY not set' }));
    process.exit(1);
  }

  const errors = [];
  const config = await loadConfig();
  const seen = await loadSeen();

  const { coarseCategories = [], locations = [] } = config.filters || {};
  const targetRole = config.targetRole || 'Technical engineering or research role';
  const companies = config.companies || [];

  const results = [];
  const allCurrentIds = new Set();

  for (const company of companies) {
    if (!company.name || !company.ats) continue;

    if (company.ats === 'manual') {
      results.push({ company: company.name, ats: 'manual', careers_url: company.careers_url, newJobs: [] });
      continue;
    }

    let jobs = [];
    try {
      if (company.ats === 'greenhouse') jobs = await fetchGreenhouse(company.slug);
      else if (company.ats === 'lever') jobs = await fetchLever(company.slug);
      else { errors.push(`${company.name}: unknown ATS "${company.ats}"`); continue; }
    } catch (err) {
      errors.push(`${company.name}: ${err.message}`);
      continue;
    }

    // Stage 1: location + coarse category filter
    const locationFiltered = locationFilter(jobs, locations);
    const coarseFiltered = coarseFilter(locationFiltered, coarseCategories);

    // Track all coarse-filtered IDs as seen (prevents re-sending known jobs)
    for (const j of coarseFiltered) allCurrentIds.add(j.id);

    const isFirstRun = seen.size === 0;
    const unseenJobs = isFirstRun ? [] : coarseFiltered.filter(j => !seen.has(j.id));

    // Stage 2: LLM relevance filter on unseen jobs only
    let relevantNew = [];
    if (unseenJobs.length > 0) {
      process.stderr.write(`prepare-jobs: ${company.name} — ${unseenJobs.length} new candidate(s), sending to LLM...\n`);
      relevantNew = await llmFilter(unseenJobs, targetRole, apiKey);
    }

    results.push({
      company: company.name,
      ats: company.ats,
      newJobs: relevantNew,
      stats: {
        total: jobs.length,
        afterLocation: locationFiltered.length,
        afterCoarse: coarseFiltered.length,
        unseen: unseenJobs.length,
        relevant: relevantNew.length
      }
    });
  }

  await saveSeen(new Set([...seen, ...allCurrentIds]));

  const totalNew = results.reduce((s, r) => s + r.newJobs.length, 0);
  const isFirstRun = seen.size === 0;

  const output = {
    status: 'ok',
    generatedAt: new Date().toISOString(),
    isFirstRun,
    totalNew,
    targetRole,
    config: { locations, delivery: config.delivery || {} },
    results,
    errors: errors.length > 0 ? errors : undefined
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
});
