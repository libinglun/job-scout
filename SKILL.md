# Job Scout

Daily/weekly digest of new job openings at tracked companies, delivered by email.

## User config: ~/.job-scout/config.json

Edit this file directly or ask Claude Code to add/remove companies.

### Adding a company

Ask Claude Code: "Add [Company] to my job scout list"

Claude will:
1. Look up which ATS the company uses (Greenhouse, Lever, or manual)
2. Find the correct board slug by testing the public API
3. Add the entry to ~/.job-scout/config.json

### ATS types

| type | how it works | example slug |
|------|-------------|--------------|
| `greenhouse` | Public Greenhouse boards API | `"slug": "anthropic"` |
| `lever` | Public Lever postings API | `"slug": "mistral"` |
| `manual` | No API — included as a reminder link | `"careers_url": "https://..."` |

### Location filter

Edit `filters.locations` — matched case-insensitively against the job's location field.
"Remote" matches any job with "remote" in the location.

### Role filter

Edit `filters.roles` — keyword list matched against job title + department.

### Delivery

- `onlyWhenNew: true` — skip days with no new postings (default)
- `onlyWhenNew: false` — always send, even if nothing new

## Pipeline

prepare-jobs.js → generate-digest.js → deliver.js

- `prepare-jobs.js`: fetches jobs, filters, diffs against seen-jobs state
- `generate-digest.js`: formats via Claude API (claude-haiku-4-5-20251001)
- `deliver.js`: emails via Resend

## State

`~/.job-scout/seen-jobs.json` — IDs of all jobs ever surfaced.
Delete this file to reset (next run re-baselines; run after that sends new ones).

## Logs

`~/.job-scout/job-scout.log`

## Scheduled task

"Job Scout" in Windows Task Scheduler — configured from `schedule` in config.json.

### Changing the schedule

Edit `schedule.time` (HH:MM) and `schedule.days` (array of day names) in config.json,
then ask Claude Code to apply it, or run:

```
node ~/.claude/skills/job-scout/scripts/setup-task.js
```

Examples:
```json
"schedule": { "time": "08:00", "days": ["Mon","Tue","Wed","Thu","Fri"] }
"schedule": { "time": "09:05", "days": ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] }
"schedule": { "time": "07:30", "days": ["Mon","Wed","Fri"] }
```

All 7 days → daily trigger. Any subset → weekly trigger on those days. StartWhenAvailable is always set.
