import { config as loadEnv } from 'dotenv';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

const envPath = join(homedir(), '.job-scout', '.env');
if (existsSync(envPath)) loadEnv({ path: envPath });

import FirecrawlApp from 'firecrawl';
const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });

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
    console.log(md.substring(0, 5000));
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
  }
  await new Promise(r => setTimeout(r, 800));
}

// 1. Check Anthropic /careers page for team filter links (the jobs page seems to not have filters)
await scrape('Anthropic - main careers page (for team links)', 'https://www.anthropic.com/careers');

// 2. TikTok - try the lifeattiktok.com/teams/technology which links directly to eng jobs
await scrape('TikTok - engineering team page', 'https://lifeattiktok.com/teams/technology');

// 3. Cohere - check if Ashby supports specific named departments
// Based on their dept list: Agentic Platform, Modeling, Inference, Embeddings & Search are the tech ones
// Try URL encoding for their department filter
await scrape('Cohere - Modeling dept', 'https://jobs.ashbyhq.com/cohere?department=Modeling&department=Inference&department=Agentic+Platform');

// 4. Meta - confirm which team values work for Engineering filter
await scrape('Meta - Software Engineering + AI Research teams', 'https://www.metacareers.com/jobsearch/?teams[0]=Software%20Engineering&teams[1]=Artificial%20Intelligence');

// 5. DeepMind - find if there's a department filter via Greenhouse
await scrape('DeepMind - Greenhouse dept filter test', 'https://job-boards.greenhouse.io/deepmind?department=Research+Engineering');

console.log('\nDone!');
