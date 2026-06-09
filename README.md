# Job Scout

An AI-powered job alert system that tracks companies you care about and emails
you when relevant new positions appear — filtered by your location, role
preferences, and an AI that actually reads each job description.

**Philosophy:** Don't waste time scrolling career pages. Let AI read hundreds of
job descriptions and surface only the ones that match what you're looking for.

## What You Get

A daily email digest with:

- New job openings from your tracked companies, filtered to your role and location
- AI-evaluated relevance — Claude reads each job description and decides if it fits your background
- Direct apply links for every matched position

## Quick Start

1. Install the skill in Claude Code
2. Say **"Set up job scout for me"**
3. The agent walks you through setup conversationally — no config files to edit

The agent will ask you:
- Which companies you want to track (just the name and careers page URL)
- What kind of role you're looking for (and what you're not interested in)
- Which locations or remote
- Where to send the digest (email address)
- How often and what time

> **Tip:** Most career sites let you filter by department or role category.
> Use the filtered URL instead of the base careers page — for example,
> `https://careers.snap.com/jobs?role=Engineering` instead of
> `https://careers.snap.com/jobs`. This way you only scrape relevant roles
> and get better results.

Your first digest arrives the next day. The initial run silently indexes existing
jobs so you only get notified about genuinely new openings.

### Prerequisites

You'll need three API keys in `~/.job-scout/.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
FIRECRAWL_API_KEY=fc-...
```

- **Anthropic** — [console.anthropic.com](https://console.anthropic.com/) (AI reads job descriptions)
- **Resend** — [resend.com](https://resend.com/) (sends the email digest, free tier available)
- **Firecrawl** — [firecrawl.dev](https://www.firecrawl.dev/) (renders JS-heavy career pages, free tier: 500 credits/month)

## Changing Settings

Your preferences are configurable through conversation. Just tell your agent:

- **"Add Stripe to my job scout list"** — adds it with the careers page URL
- **"Remove Cohere from job scout"** — removes a company
- **"Change my target role to senior backend engineer"** — updates what the AI looks for
- **"Add Berlin to my locations"** — expands your location filter
- **"Switch to weekdays only at 8am"** — changes the schedule
- **"Pause job scout"** / **"Resume job scout"** — temporarily stop/start scanning
- **"Send me a test email"** — verifies delivery is working
- **"Show me my current job scout config"** — displays your settings

Or edit `~/.job-scout/config.json` directly if you prefer.

## Customizing the Digest

The skill uses a plain-English prompt file to control how the digest is formatted.
You can customize it two ways:

**Through conversation (recommended):**
Tell your agent what you want — "Make the digest shorter," "Add a section for
internships," "Group jobs by department instead of company."

**Direct editing (power users):**
Edit the file in the `prompts/` folder:
- `format-jobs.md` — how the digest is structured, what to include, tone

This is a plain English instruction, not code. Changes take effect on the next digest.

## How It Works

```
377 jobs on Anthropic's careers page
  → Firecrawl renders the page and extracts content
  → Claude extracts structured job data from the page
  → 63 match your location (London, Remote)
  → 45 pass keyword filter (engineering roles only)
  → 3 confirmed relevant by AI → emailed to you
```

1. **Scrape** — Firecrawl renders each company's careers page (handles JS/SPA sites)
2. **Extract** — Claude reads the page content and extracts structured job listings
3. **Filter** — drops jobs outside your locations and non-technical roles
4. **AI review** — Claude evaluates each remaining job against your role preferences
5. **Digest** — formats matches into a clean, scannable email
6. **Deliver** — sends via Resend on your schedule

Only new jobs trigger an email — you won't see the same listing twice.

See [examples/sample-digest.md](examples/sample-digest.md) for what the output looks like.

## Installation

### Claude Code
```bash
git clone <repo-url> ~/.claude/skills/job-scout
cd ~/.claude/skills/job-scout/scripts && npm install
```

## Requirements

- Claude Code (or similar AI agent)
- Internet connection (to scrape career pages)
- Anthropic API key (for AI-powered job extraction and relevance filtering)
- Firecrawl API key (for rendering JS-heavy career pages)
- Resend API key (for email delivery — free tier available)

## Privacy

- Job listings are scraped directly from company career pages — no middleman
- Your config and seen-jobs history stay on your machine (`~/.job-scout/`)
- The Anthropic API key is used only to extract and evaluate jobs
- The Firecrawl API key is used only to render career pages
- The Resend API key is used only to send emails to your own address

## License

MIT
