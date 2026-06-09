# Job Scout

Daily/weekly digest of new job openings at tracked companies, delivered by email.

## First-time setup (ask Claude Code)

Say: *"Set up job scout for me"*

Claude Code will ask you for:
1. **Companies** — name + ATS type (Greenhouse/Lever/manual) for each
2. **Target role** — natural-language description of your ideal role and what you're NOT interested in
3. **Locations** — cities and/or "Remote"
4. **Email** — where to deliver the digest
5. **Schedule** — time and days (e.g. weekdays at 09:00)

Then Claude Code will write `~/.job-scout/config.json`, run `npm install`, register the Windows Task Scheduler entry, and run a silent baseline pass so the first real email contains only genuinely new jobs.

**Prerequisites:** `ANTHROPIC_API_KEY` and `RESEND_API_KEY` in `~/.job-scout/.env`.

## User config: ~/.job-scout/config.json

Edit this file directly or ask Claude Code to change it.

### Adding a company

Ask Claude Code: *"Add [Company] to my job scout list"*

Claude will:
1. Look up which ATS the company uses (Greenhouse, Lever, or manual)
2. Find the correct board slug by testing the public API
3. Add the entry to `~/.job-scout/config.json`

### ATS types

| type | how it works | example |
|------|-------------|---------|
| `greenhouse` | Public Greenhouse boards API | `{ "ats": "greenhouse", "slug": "anthropic" }` |
| `lever` | Public Lever postings API | `{ "ats": "lever", "slug": "mistral" }` |
| `manual` | No API — included as a reminder link | `{ "ats": "manual", "careers_url": "https://..." }` |

**Finding slugs:**
- Greenhouse: `boards.greenhouse.io/{slug}`
- Lever: `jobs.lever.co/{slug}`

### Target role

`targetRole` is a natural-language description read by the LLM when evaluating each job. Be specific — mention technologies, seniority level, and what you're not interested in.

### Location filter

Edit `filters.locations` — matched case-insensitively. `"Remote"` matches any job with "remote" in the location field.

### Coarse category filter (pre-LLM)

Edit `filters.coarseCategories` — keyword list matched against job title + department before the LLM step, to drop obvious non-tech roles cheaply.

### Schedule

Edit `schedule.time` (HH:MM) and `schedule.days` (array of day names).

After changing the schedule, ask Claude Code to apply it — or run:
```
node ~/.claude/skills/job-scout/scripts/setup-task.js
```

Examples:
```json
{ "time": "08:00", "days": ["Mon","Tue","Wed","Thu","Fri"] }
{ "time": "09:05", "days": ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] }
```

All 7 days → daily trigger. Any subset → weekly trigger on those days. `StartWhenAvailable` is always set.

## Pipeline

```
prepare-jobs.js → generate-digest.js → deliver.js
```

- `prepare-jobs.js` — fetches jobs, two-stage filter (keywords → LLM), diffs against seen-jobs state
- `generate-digest.js` — formats matched jobs into a digest via Claude API
- `deliver.js` — emails via Resend

Run manually:
```bash
cd ~/.claude/skills/job-scout/scripts
node prepare-jobs.js | node generate-digest.js | node deliver.js
```

## State

`~/.job-scout/seen-jobs.json` — IDs of all jobs ever surfaced. Delete this file to reset (next run re-baselines; run after that sends new ones).

## Logs

`~/.job-scout/job-scout.log`

## Scheduled task

`"Job Scout"` in Windows Task Scheduler — configured from `schedule` in config.json. Re-register by running `setup-task.js` after any schedule change.
