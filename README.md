# Job Scout

Daily email digest of new job openings at companies you care about. Two-stage filtering: broad keyword pre-filter, then Claude reads actual job descriptions and evaluates fit against your natural-language role description.

```
Anthropic (377 jobs) → location filter → 63 → keyword filter → 45 → LLM filter → 3 relevant → email
```

## How it works

1. **Fetch** — pulls live job listings from Greenhouse and Lever public APIs
2. **Location filter** — keeps only jobs matching your city/remote preferences
3. **Keyword filter** — drops obvious non-tech roles cheaply (sales, marketing, etc.)
4. **LLM filter** — Claude reads each job description and compares it to your `targetRole` description, returning a relevance decision + one-sentence reason
5. **Digest** — formats matched jobs into a clean email grouped by company
6. **Deliver** — sends via [Resend](https://resend.com) on your configured schedule

Only *new* jobs are evaluated — already-seen IDs are tracked in `~/.job-scout/seen-jobs.json`. First run baselines silently; emails start from run two.

## Setup

This skill is designed to be set up through Claude Code. Open Claude Code and say:

> "Set up job scout for me"

Claude Code will walk you through configuring companies, your target role, locations, delivery email, and schedule — then register the Windows Task Scheduler entry and run a silent baseline pass.

### Prerequisites

Before running setup, add your API keys to `~/.job-scout/.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
```

- **Anthropic key** — [console.anthropic.com](https://console.anthropic.com/) (used for LLM filtering + digest formatting)
- **Resend key** — [resend.com](https://resend.com/) (used for email delivery)

### Manual setup (without Claude Code)

```bash
cd scripts
npm install
```

Copy `config/default-config.json` to `~/.job-scout/config.json` and edit it, then:

```bash
node setup-task.js          # register Task Scheduler entry
node prepare-jobs.js        # baseline pass (no email sent)
```

## Configuration

All config lives in `~/.job-scout/config.json`. Ask Claude Code to change anything, or edit directly.

### Companies

Each entry specifies a company and how to fetch its jobs:

| ATS type | Description | Required fields |
|---|---|---|
| `greenhouse` | Greenhouse Boards public API | `slug` |
| `lever` | Lever public postings API | `slug` |
| `manual` | No API — digest shows a reminder link | `careers_url` |

Finding slugs: Greenhouse → `boards.greenhouse.io/{slug}`, Lever → `jobs.lever.co/{slug}`

### Target role

`targetRole` is read by the LLM when evaluating each job description. Write it as a plain English description of what you want and don't want:

```
"Senior software engineer or ML engineer roles focused on model training infrastructure,
distributed systems, compilers, or AI tooling. Not interested in sales, marketing,
product management, design, legal, finance, or HR."
```

### Schedule

```json
"schedule": {
  "time": "09:05",
  "days": ["Mon", "Tue", "Wed", "Thu", "Fri"]
}
```

All 7 days → daily trigger. Any subset → weekly trigger. After changing, run `node scripts/setup-task.js` or ask Claude Code to apply it.

## Pipeline

```
prepare-jobs.js → generate-digest.js → deliver.js
```

Each script is a stdin→stdout filter. Run manually:

```bash
cd scripts
node prepare-jobs.js | node generate-digest.js | node deliver.js
```

## File locations

| Path | Purpose |
|---|---|
| `~/.job-scout/config.json` | Your config |
| `~/.job-scout/.env` | API keys |
| `~/.job-scout/seen-jobs.json` | Seen job IDs — delete to reset |
| `~/.job-scout/job-scout.log` | Run logs |

## Resetting

Delete `~/.job-scout/seen-jobs.json`. Next run re-baselines; the run after that sends only new jobs.
