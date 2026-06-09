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
- Reminder links for companies without API access (TikTok, Meta, etc.)

## Quick Start

1. Install the skill in Claude Code
2. Say **"Set up job scout for me"**
3. The agent walks you through setup conversationally — no config files to edit

The agent will ask you:
- Which companies you want to track
- What kind of role you're looking for (and what you're not interested in)
- Which locations or remote
- Where to send the digest (email address)
- How often and what time

Your first digest arrives the next day. The initial run silently indexes existing
jobs so you only get notified about genuinely new openings.

### Prerequisites

You'll need two API keys in `~/.job-scout/.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
```

- **Anthropic** — [console.anthropic.com](https://console.anthropic.com/) (AI reads job descriptions)
- **Resend** — [resend.com](https://resend.com/) (sends the email digest, free tier available)

## Changing Settings

Your preferences are configurable through conversation. Just tell your agent:

- **"Add Stripe to my job scout list"** — finds the right job board API and adds it
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

## Supported Company Types

| Type | How it works | Example companies |
|------|-------------|-------------------|
| **Greenhouse** | Auto-fetches from public API | Anthropic, Stripe, Notion |
| **Lever** | Auto-fetches from public API | Mistral AI, Figma |
| **Ashby** | Auto-fetches from public API | Ramp, Linear, Labelbox |
| **Manual** | Reminder link in your digest | TikTok, Meta, Spotify, DeepMind |

When you add a company, the agent automatically detects which type to use.
Companies without a public job API are added as manual links so you don't forget
to check them.

## Installation

### Claude Code
```bash
git clone <repo-url> ~/.claude/skills/job-scout
cd ~/.claude/skills/job-scout/scripts && npm install
```

## Requirements

- Claude Code (or similar AI agent)
- Internet connection (to fetch job listings from public APIs)
- Anthropic API key (for AI-powered job relevance filtering)
- Resend API key (for email delivery — free tier available)

## How It Works

```
377 jobs at Anthropic
  → 63 match your location (London, Remote)
  → 45 pass keyword filter (engineering roles only)
  → 3 confirmed relevant by AI → emailed to you
```

1. **Fetch** — pulls live listings from company job boards (Greenhouse, Lever, Ashby APIs)
2. **Filter** — drops jobs outside your locations and non-technical roles
3. **AI review** — Claude reads each remaining job description against your role preferences
4. **Digest** — formats matches into a clean, scannable email
5. **Deliver** — sends via Resend on your schedule

Only new jobs trigger an email — you won't see the same listing twice.

See [examples/sample-digest.md](examples/sample-digest.md) for what the output looks like.

## Privacy

- Job listings are fetched directly from public company APIs — no middleman
- Your config and seen-jobs history stay on your machine (`~/.job-scout/`)
- The Anthropic API key is used only to evaluate job relevance locally
- The Resend API key is used only to send emails to your own address

## License

MIT
