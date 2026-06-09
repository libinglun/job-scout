# Job Scout — Agent Instructions

Agent-facing reference for handling Job Scout requests. User-facing docs are in README.md.

## First-time setup

When a user says "set up job scout", walk them through:

1. **Companies** — name + ATS type for each (see ATS detection below)
2. **Target role** — natural-language description of ideal role + exclusions
3. **Locations** — cities and/or "Remote"
4. **Email** — delivery address
5. **Schedule** — time and days (e.g. weekdays at 09:00)

Then:
1. Write `~/.job-scout/config.json` (use `config/default-config.json` as template)
2. Ensure `ANTHROPIC_API_KEY` and `RESEND_API_KEY` are in `~/.job-scout/.env`
3. Run `npm install` in the skill's `scripts/` directory
4. Run `node scripts/setup-task.js` to register the scheduled task
5. Run the pipeline once to baseline: `node prepare-jobs.js | node generate-digest.js | node deliver.js --dry-run`

## Adding a company

1. Determine the ATS by testing public API endpoints (see below)
2. Add the entry to `~/.job-scout/config.json`

### ATS detection

Try these in order:

| ATS | Test URL | Config |
|-----|----------|--------|
| Greenhouse | `https://boards-api.greenhouse.io/v1/boards/{slug}/jobs` → 200 | `{ "ats": "greenhouse", "slug": "{slug}" }` |
| Lever | `https://api.lever.co/v0/postings/{slug}?mode=json` → 200 | `{ "ats": "lever", "slug": "{slug}" }` |
| Ashby | `https://api.ashbyhq.com/posting-api/job-board/{slug}` → 200 | `{ "ats": "ashby", "slug": "{slug}" }` |
| Manual | No API found | `{ "ats": "manual", "careers_url": "https://..." }` |

**Finding slugs:** Check the company's careers page URL — the slug is usually in the path:
- Greenhouse: `boards.greenhouse.io/{slug}`
- Lever: `jobs.lever.co/{slug}`
- Ashby: `jobs.ashbyhq.com/{slug}`

## Config reference

File: `~/.job-scout/config.json`

| Field | Type | Purpose |
|-------|------|---------|
| `companies[]` | array | List of tracked companies with ATS config |
| `targetRole` | string | Natural-language role description for LLM evaluation |
| `filters.coarseCategories` | string[] | Keywords matched against title+department (pre-LLM filter) |
| `filters.locations` | string[] | Location filter (case-insensitive, "Remote" matches empty locations) |
| `delivery.method` | `"email"` \| `"terminal"` \| `"both"` | How to deliver the digest |
| `delivery.email` | string | Email address for delivery |
| `delivery.onlyWhenNew` | boolean | Skip digest when no new jobs found |
| `paused` | boolean | Set to `true` to pause scanning |
| `schedule.time` | `"HH:MM"` | Time of day to run |
| `schedule.days` | string[] | Day names (all 7 = daily trigger, subset = weekly) |

## Pipeline

```
prepare-jobs.js → generate-digest.js → deliver.js
```

Run manually: `cd scripts && node prepare-jobs.js | node generate-digest.js | node deliver.js`

### deliver.js flags
- `--dry-run` — force terminal output regardless of config
- `--test` — send a test message to verify delivery
- `--message "text"` — pass digest as argument
- `--file path` — read digest from file

## Schedule management

After any schedule change, re-register by running `node scripts/setup-task.js`.

### Windows
Fully automated via `setup-task.js` → Windows Task Scheduler (`"Job Scout"` task).

### macOS
`setup-task.js` prints manual launchd instructions. Guide the user to:
1. Make `run-jobs.sh` executable
2. Create `~/Library/LaunchAgents/com.job-scout.plist` with the printed template
3. Load with `launchctl load ~/Library/LaunchAgents/com.job-scout.plist`

## State files

| File | Purpose |
|------|---------|
| `~/.job-scout/config.json` | User configuration |
| `~/.job-scout/.env` | API keys |
| `~/.job-scout/seen-jobs.json` | IDs of previously surfaced jobs (delete to reset) |
| `~/.job-scout/job-scout.log` | Pipeline logs |

## Common requests

| User says | Action |
|-----------|--------|
| "Add X to job scout" | Detect ATS, add to config |
| "Remove X from job scout" | Remove from `companies[]` |
| "Pause / resume job scout" | Set `paused` to `true` / `false` |
| "Send a test email" | Run `node deliver.js --test` |
| "Show my config" | Read and display `~/.job-scout/config.json` |
| "Reset job scout" | Delete `~/.job-scout/seen-jobs.json` |
| "Run job scout now" | Run the full pipeline with `--dry-run` |
