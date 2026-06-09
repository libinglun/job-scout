import { config as loadEnv } from 'dotenv';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

const envPath = join(homedir(), '.job-scout', '.env');
if (existsSync(envPath)) loadEnv({ path: envPath });

import FirecrawlApp from 'firecrawl';
const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });

const companies = [
  { name: 'Anthropic', url: 'https://www.anthropic.com/careers/jobs' },
  { name: 'Mistral AI', url: 'https://jobs.lever.co/mistral' },
  { name: 'Cohere', url: 'https://jobs.ashbyhq.com/cohere' },
  { name: 'DeepMind', url: 'https://job-boards.greenhouse.io/deepmind' },
  { name: 'TikTok', url: 'https://careers.tiktok.com/position' },
  { name: 'Snapchat', url: 'https://careers.snap.com/jobs' },
  { name: 'Meta', url: 'https://www.metacareers.com/jobsearch' },
  { name: 'Spotify', url: 'https://www.lifeatspotify.com/jobs' },
];

// Keywords indicating engineering/technical departments
const techKeywords = [
  'engineer', 'software', 'technical', 'research', 'ml', 'machine learning',
  'data', 'infrastructure', 'platform', 'science', 'tech', 'product engineer'
];

function findFilterLinks(markdown, baseUrl) {
  const lines = markdown.split('\n');
  const filterLinks = [];
  const urlParams = new Set();

  for (const line of lines) {
    // Find markdown links: [text](url)
    const linkMatches = [...line.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
    for (const match of linkMatches) {
      const text = match[1].toLowerCase();
      const url = match[2];

      const isTech = techKeywords.some(kw => text.includes(kw));
      const hasParam = url.includes('?') || url.includes('department') ||
        url.includes('team') || url.includes('filter') || url.includes('category');

      if (isTech || hasParam) {
        filterLinks.push({ text: match[1], url });
      }

      // Extract query params
      if (url.includes('?')) {
        try {
          const fullUrl = url.startsWith('http') ? url : new URL(url, baseUrl).href;
          const params = new URL(fullUrl).searchParams;
          params.forEach((val, key) => urlParams.add(`${key}=${val}`));
        } catch (e) {
          // ignore malformed URLs
        }
      }
    }

    // Also look for raw URLs in text
    const rawUrls = [...line.matchAll(/https?:\/\/[^\s)"']+/g)];
    for (const match of rawUrls) {
      const url = match[0];
      if (url.includes('?')) {
        try {
          const params = new URL(url).searchParams;
          const techParam = [...params.entries()].some(([k, v]) =>
            techKeywords.some(kw => v.toLowerCase().includes(kw)) ||
            k.toLowerCase().includes('department') || k.toLowerCase().includes('team')
          );
          if (techParam) filterLinks.push({ text: 'raw-url', url });
          params.forEach((val, key) => urlParams.add(`${key}=${val}`));
        } catch (e) {}
      }
    }
  }

  return { filterLinks: filterLinks.slice(0, 20), urlParams: [...urlParams].slice(0, 30) };
}

async function scrapeCompany(company) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Scraping: ${company.name} — ${company.url}`);

  try {
    const result = await app.scrapeUrl(company.url, {
      formats: ['markdown'],
      onlyMainContent: true,
    });

    const md = result.markdown || '';
    console.log(`  Markdown length: ${md.length} chars`);

    // Print first 3000 chars for manual inspection
    console.log('\n--- MARKDOWN SNIPPET (first 3000 chars) ---');
    console.log(md.substring(0, 3000));
    console.log('--- END SNIPPET ---');

    const { filterLinks, urlParams } = findFilterLinks(md, company.url);

    console.log(`\n  Tech/filter links found (${filterLinks.length}):`);
    for (const link of filterLinks) {
      console.log(`    [${link.text}] -> ${link.url}`);
    }

    console.log(`\n  Query params found: ${urlParams.join(', ') || 'none'}`);

  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
  }
}

// Run sequentially to conserve credits
for (const company of companies) {
  await scrapeCompany(company);
  // Small delay between requests
  await new Promise(r => setTimeout(r, 1000));
}

console.log('\nDone!');
