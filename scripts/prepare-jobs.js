#!/usr/bin/env node

// Two-stage job filtering pipeline:
//   Stage 1 (scrape + extract): Firecrawl renders career pages → Claude extracts structured jobs
//   Stage 2 (filter):           coarse keywords + location filter → LLM relevance evaluation
//
// Outputs JSON to stdout for generate-digest.js.

import Anthropic from '@anthropic-ai/sdk';
import FirecrawlApp from 'firecrawl';
import { createHash } from 'crypto';
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

// -- Stable ID generation ----------------------------------------------------

function jobId(company, title, location) {
  return createHash('md5')
    .update(`${company}|${title}|${location}`)
    .digest('hex')
    .slice(0, 12);
}

// -- Firecrawl scraping + LLM extraction -------------------------------------

async function scrapeAndExtract(company, firecrawl, anthropic) {
  const url = company.careers_url;
  if (!url) throw new Error(`${company.name}: no careers_url configured`);

  process.stderr.write(`prepare-jobs: ${company.name} — scraping ${url}\n`);

  const scrapeResult = await firecrawl.scrapeUrl(url, {
    formats: ['markdown'],
    timeout: 30000
  });

  if (!scrapeResult.success) {
    throw new Error(`${company.name}: Firecrawl scrape failed — ${scrapeResult.error || 'unknown error'}`);
  }

  const markdown = scrapeResult.markdown || '';
  if (markdown.length < 50) {
    process.stderr.write(`prepare-jobs: ${company.name} — page returned very little content (${markdown.length} chars)\n`);
    return [];
  }

  const truncated = markdown.slice(0, 60000);

  process.stderr.write(`prepare-jobs: ${company.name} — ${truncated.length} chars, extracting jobs via LLM...\n`);

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    messages: [{
      role: 'user',
      content: `Extract all job postings visible on this careers page.
Company: ${company.name}
Page URL: ${url}

Return a JSON array. Each job object must have:
- title: exact job title as listed
- location: location(s) as listed (include all if multiple)
- department: department or team if visible, otherwise empty string
- url: the apply or detail link (absolute URL — if relative, prefix with the page's base domain)

If no jobs are found on the page, return an empty array [].
Return ONLY the JSON array, no other text.

Page content:
${truncated}`
    }]
  });

  let jobs;
  try {
    const text = response.content[0]?.text?.trim() || '[]';
    const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    jobs = JSON.parse(cleaned);
  } catch {
    if (response.stop_reason === 'max_tokens') {
      // Output was truncated — salvage complete objects from the partial JSON
      const text = response.content[0]?.text?.trim() || '';
      const cleaned = text.replace(/^```(?:json)?\n?/, '');
      const lastComplete = cleaned.lastIndexOf('},');
      if (lastComplete > 0) {
        try {
          jobs = JSON.parse(cleaned.slice(0, lastComplete + 1) + ']');
          process.stderr.write(`prepare-jobs: ${company.name} — output truncated, salvaged ${jobs.length} jobs\n`);
        } catch {
          process.stderr.write(`prepare-jobs: ${company.name} — output truncated and unsalvageable, skipping\n`);
          return [];
        }
      } else {
        process.stderr.write(`prepare-jobs: ${company.name} — output truncated, no complete entries, skipping\n`);
        return [];
      }
    } else {
      process.stderr.write(`prepare-jobs: ${company.name} — LLM returned non-JSON, skipping\n`);
      return [];
    }
  }

  if (!Array.isArray(jobs)) return [];

  return jobs.map(j => ({
    id: jobId(company.name, j.title || '', j.location || ''),
    title: j.title || '(untitled)',
    location: j.location || '',
    department: j.department || '',
    description: '',
    url: j.url || url,
    postedAt: null
  }));
}

// -- Stage 1: coarse category filter ----------------------------------------

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

async function llmFilter(jobs, targetRole, anthropic) {
  if (jobs.length === 0) return [];

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
- Read the actual job title and any description carefully
- If the job content clearly matches the candidate's background and interests: relevant: true
- If the role is in a different function (sales, marketing, legal, finance, HR, design): relevant: false
- When genuinely uncertain, lean toward including (relevant: true)
- Return JSON only, no other text`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }]
  });

  let decisions;
  try {
    const text = response.content[0]?.text?.trim() || '[]';
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
  if (existsSync(fbEnvPath)) loadEnv({ path: fbEnvPath, override: false });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(JSON.stringify({ status: 'error', message: 'ANTHROPIC_API_KEY not set' }));
    process.exit(1);
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) {
    console.error(JSON.stringify({ status: 'error', message: 'FIRECRAWL_API_KEY not set' }));
    process.exit(1);
  }

  const errors = [];
  const config = await loadConfig();

  if (config.paused) {
    console.log(JSON.stringify({ status: 'paused', message: 'Job Scout is paused. Set "paused": false in config to resume.' }));
    return;
  }

  const seen = await loadSeen();

  const { coarseCategories = [], locations = [] } = config.filters || {};
  const targetRole = config.targetRole || 'Technical engineering or research role';
  const companies = config.companies || [];

  const firecrawl = new FirecrawlApp({ apiKey: firecrawlKey });
  const anthropic = new Anthropic({ apiKey });

  const results = [];
  const allCurrentIds = new Set();

  for (const company of companies) {
    if (!company.name || !company.careers_url) continue;

    let jobs = [];
    try {
      jobs = await scrapeAndExtract(company, firecrawl, anthropic);
    } catch (err) {
      errors.push(`${company.name}: ${err.message}`);
      continue;
    }

    const locationFiltered = locationFilter(jobs, locations);
    const coarseFiltered = coarseFilter(locationFiltered, coarseCategories);

    for (const j of coarseFiltered) allCurrentIds.add(j.id);

    const isFirstRun = seen.size === 0;
    const unseenJobs = isFirstRun ? [] : coarseFiltered.filter(j => !seen.has(j.id));

    let relevantNew = [];
    if (unseenJobs.length > 0) {
      process.stderr.write(`prepare-jobs: ${company.name} — ${unseenJobs.length} new candidate(s), evaluating relevance...\n`);
      relevantNew = await llmFilter(unseenJobs, targetRole, anthropic);
    }

    results.push({
      company: company.name,
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
