---
name: Mask secrets in saved session transcripts (public repo)
description: Repo is public/copyleft; session transcripts in docs/sessions/ must redact API keys, long hex hashes, DB credentials, etc. before commit
type: feedback
---

When generating session transcripts (`npm run session:save` or anything that copies session output into the repo), ALWAYS mask suspected secrets in BOTH the .jsonl and the .md before they are written. `scripts/save-session.cjs` does this automatically via a `redact()` pass; the MD frontmatter records the count.

**Why:** the scoot repo is public on GitHub and copyleft-shared. Brandon may legitimately paste a key or hash into a conversation for me to embed in a script — without masking, that value ends up in the JSONL the next time `session:save` runs, and from there into git history. Git history persists forever; redacting in a follow-up commit does not unleak the secret.

**How to apply:**
- Trust the script for routine `session:save` runs. If a new secret format appears (e.g. a vendor key Claude hasn't seen before), extend `REDACTION_PATTERNS` (or the dedicated regexes for DB URLs / sensitive env-style assignments) in `scripts/save-session.cjs`. Don't disable masking — extend it.
- For any transcript shared manually outside the script (PR description, Slack snippet, gist, paste), redact by the same rules by hand before posting.
- If a real secret ever slips into a committed transcript, treat it as compromised — rotate immediately. Do not rely on a redacting follow-up commit.
- Acceptable false positives: hex strings from the asimov book content (e.g. the "Hakeem is the GOAT" hex) get masked because they look like hashes. That's fine — the source content lives separately at `docs/reference/asimov_v2.13.md` for anyone who wants it.
