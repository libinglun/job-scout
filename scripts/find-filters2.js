import { config as loadEnv } from 'dotenv';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

const envPath = join(homedir(), '.job-scout', '.env');
if (existsSync(envPath)) loadEnv({ path: envPath });

import FirecrawlApp from 'firecrawl';
const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });

// Targeted follow-up scrapes to find filter URLs

async function scrape(label, url) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${label}: ${url}`);
  try {
    const result = await app.scrapeUrl(url, {
      formats: ['markdown'],
      onlyMainContent: true,
    });
    const md = result.markdown || '';
    console.log(`Length: ${md.length}`);
    console.log(md.substring(0, 4000));
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
  }
  await new Promise(r => setTimeout(r, 800));
}

// 1. Anthropic - check if there's a team filter in the URL
await scrape('Anthropic - team filter test', 'https://www.anthropic.com/careers/jobs?team=engineering');
await scrape('Anthropic - department filter test', 'https://www.anthropic.com/careers/jobs?department=engineering');

// 2. Cohere - Ashby uses department slug in URL path
await scrape('Cohere - Ashby department filter (Modeling)', 'https://jobs.ashbyhq.com/cohere?department=Modeling');
await scrape('Cohere - Ashby with departmentId param', 'https://jobs.ashbyhq.com/cohere?departmentId=engineering');

// 3. Snapchat - try team param
await scrape('Snapchat - team=Engineering filter', 'https://careers.snap.com/jobs?team=Engineering');
await scrape('Snapchat - role=Engineering filter', 'https://careers.snap.com/jobs?role=Engineering');

// 4. Meta - try teams filter
await scrape('Meta - teams filter (Software Engineering)', 'https://www.metacareers.com/jobsearch/?teams[0]=Software%20Engineering');
await scrape('Meta - q=software engineer', 'https://www.metacareers.com/jobsearch/?q=software+engineer');

// 5. TikTok - use lifeattiktok search with category
await scrape('TikTok - search engineering', 'https://lifeattiktok.com/search?category=Engineering%20%26%20Technology');
await scrape('TikTok - careers position with keyword', 'https://careers.tiktok.com/position?keywords=engineer&category=6704215862603177224');

console.log('\nDone!');
