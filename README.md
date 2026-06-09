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

### Prerequisites

- Node.js 18+
- [Anthropic API key](https://console.anthropic.com/) (for LLM filtering + digest formatting)
- [Resend API key](https://resend.com/) (for email delivery)

### 1. Add secrets

Create `~/.job-scout/.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
```

### 2. Run setup

```bash
cd scripts
npm install
node setup.js
```

This will:
- Copy `config/default-config.json` → `~/.job-scout/config.json`
- Validate your secrets
- Register a Windows Task Scheduler entry based on `schedule` in config
- Run a silent baseline pass so the first real email contains only genuinely new jobs

### 3. Edit your config

Open `~/.job-scout/config.json` and fill in:

| Field | Description |
|---|---|
| `companies` | List of companies to track (see ATS types below) |
| `targetRole` | Natural-language description of your ideal role — be specific |
| `filters.locations` | City names + `"Remote"` |
| `filters.coarseCategories` | Keywords matched against title+department (pre-LLM filter) |
| `delivery.email` | Where to send the digest |
| `schedule.time` | HH:MM (24-hour) |
| `schedule.days` | Array of day names, e.g. `["Mon","Tue","Wed","Thu","Fri"]` |

After changing `schedule`, re-apply it:

```bash
node scripts/setup-task.js
```

## ATS types

| type | how it works | config |
|---|---|---|
| `greenhouse` | Greenhouse Boards public API | `{ "ats": "greenhouse", "slug": "anthropic" }` |
| `lever` | Lever public postings API | `{ "ats": "lever", "slug": "mistral" }` |
| `manual` | No API — digest includes a reminder link | `{ "ats": "manual", "careers_url": "https://..." }` |

**Finding slugs:**
- Greenhouse: `boards.greenhouse.io/{slug}` or `boards.greenhouse.io/embed/job_board?for={slug}`
- Lever: `jobs.lever.co/{slug}`

## Adding companies via Claude Code

Ask Claude Code: *"Add [Company] to my job scout list"* — it will find the right ATS and slug, update config, and confirm.

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
| `~/.job-scout/config.json` | Your config (edit this) |
| `~/.job-scout/.env` | API keys |
| `~/.job-scout/seen-jobs.json` | Seen job IDs — delete to reset |
| `~/.job-scout/job-scout.log` | Run logs |

## Resetting

Delete `~/.job-scout/seen-jobs.json` to reset state. Next run re-baselines; the run after that sends new jobs.
