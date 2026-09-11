---
name: infra-bigmo-google-mcp
description: "BigMo's Gmail/Drive/Calendar MCP servers + rclone Drive remote on dreamlab, scoped to fonde.brotherhood@gmail.com, isolated from other accounts"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 98793ce2-56d6-45b6-a991-49f07ef76a20
  modified: 2026-08-30T14:11:14.492Z
---

Three user-scope MCP servers on dreamlab give Claude Code access to
`fonde.brotherhood@gmail.com` (BigMo's Google account), registered
2026-08-27, plus a read-write rclone remote for scripted file transfer:

- **bigmo-gmail** — `@gongrzhe/server-gmail-autoauth-mcp`
- **bigmo-gdrive** — `@isaacphi/mcp-gdrive` (also covers Sheets)
- **bigmo-calendar** — `@cocal/google-calendar-mcp`
- **bigmo-gdrive:** (rclone remote, full read-write `drive` scope). Usable
  two ways, both on the same underlying config in
  `~/.config/rclone/rclone.conf` alongside `azarchive`:
  - Command-driven, like `azarchive` (see [[infra_cold_archive]]):
    `rclone lsd/copy/sync bigmo-gdrive:...`
  - **Live FUSE mount at `/mnt/bigmo-gdrive`** (added 2026-08-30, after
    initially setting up remote-only) — behaves like a normal directory.
    Persistent via systemd **user** service
    `~/.config/systemd/user/rclone-bigmo-gdrive.service`
    (`--vfs-cache-mode writes`), `loginctl enable-linger brandon` so it
    starts at boot without a login session. Check status:
    `systemctl --user status rclone-bigmo-gdrive`. Unmount manually if
    needed: `fusermount3 -u /mnt/bigmo-gdrive`.

Check status: `claude mcp list`. Remove/re-add: `claude mcp remove <name>`
then re-run `claude mcp add ... -s user ...` (exact commands below).

**Naming convention:** any future MCP server for a *different* Google
account (e.g. Brandon's personal account, or another Scoot's bot) should
use a different name prefix (`<botname>-gmail` etc.), not `bigmo-*` —
this is how multiple Google-account MCP integrations coexist on one
machine without credential collisions.

**Credential isolation:** each server's OAuth client keys + token are
under `~/.mcp-creds/bigmo-google/{gmail,gdrive,calendar}/`, mode 700/600,
NOT in the git repo. GCP project: `bigmo-2026a`, OAuth consent screen is
in **Testing** mode (External user type, `fonde.brotherhood@gmail.com`
added as test user) — not published/verified.

**Known gotchas if re-running auth or adding a 4th service:**
- `@gongrzhe/server-gmail-autoauth-mcp`'s `auth` subcommand hardcodes
  `server.listen(3000)` — collides with the live Scoot prod container on
  dreamlab (port 3000). Had to patch the resolved npx cache copy
  (`sed 's/3000/<free-port>/g'` across the 3 occurrences in
  `dist/index.js`) to run auth without taking prod down.
- `@isaacphi/mcp-gdrive` has **no** CLI `auth` subcommand — `npx ... auth`
  just starts the MCP stdio server and does nothing. Had to write a tiny
  script (`force-auth.mjs`, imports `getValidCredentials` from the
  package's `auth.js` and calls it directly) to trigger the interactive
  OAuth flow standalone. Also its default auth timeout is a hardcoded
  30s in `auth.js` (`authenticateWithTimeout`) — too short once you
  factor in SSH-tunnel setup time; patched to 300000ms (5 min).
- `@cocal/google-calendar-mcp` defaults token storage to
  `~/.config/google-calendar-mcp/tokens.json` regardless of
  `GOOGLE_OAUTH_CREDENTIALS` — must also set
  `GOOGLE_CALENDAR_MCP_TOKEN_PATH` explicitly or it won't be isolated
  per-account.
- All three needed a live SSH port-forward per auth run since dreamlab
  is headless (no browser) — Brandon uses PuTTY, and **each server
  picks/uses a different local port**, so a fresh PuTTY tunnel window
  (Connection > SSH > Tunnels, Source=that port, Dest=`localhost:<port>`,
  must click Add *before* Open) is needed each time; tunnels added to an
  already-open PuTTY session via Change Settings didn't reliably take
  effect — a fresh connection was what worked.
- Calendar API access in Testing mode expires weekly (7-day token
  expiry) unless the OAuth consent screen is published to Production
  (still unverified, just shows a warning) — not yet done, Brandon may
  want this later to avoid recurring re-auth.
- `rclone authorize` for the Drive remote needs the FULL `drive` scope
  (not `drive.readonly`) added to the consent screen's Data Access list
  separately from the MCP server's scopes. Its callback is always fixed
  at `127.0.0.1:53682` (not configurable), and the URL it prints is
  rclone's own local page (`http://127.0.0.1:53682/auth?state=...`),
  which itself redirects to Google and back — same one tunnel covers
  both legs. Once you have the printed JSON token blob, don't bother
  with an interactive `rclone config` — pipe it straight into
  `rclone config create <name> drive client_id=... client_secret=...
  scope=drive token='<json blob>' --non-interactive` (works despite
  printing a confusing `config_refresh_token`/`teamdrive` state-JSON
  dump — verify with `rclone lsd <name>:` after, it just works).
- **Account mix-up gotcha:** if Brandon's browser is already signed into
  his personal Google account (`awbreybrandon@gmail.com`), the OAuth
  consent screen silently uses that identity instead of showing an
  account picker, and — since only `fonde.brotherhood@gmail.com` is a
  registered test user on this Testing-mode app — Google returns
  `Error 403: access_denied` ("has not completed the Google verification
  process"). Fix: do the auth step in an incognito/private window and
  explicitly sign in as `fonde.brotherhood@gmail.com`.
- PuTTY tunnels needed a genuinely fresh connection each time — even
  when the port number was right, an existing tunnel added via mid-
  session "Change Settings" sometimes didn't actually forward traffic
  (silent "site can't be reached" or connection-refused with no visible
  cause). Opening a brand-new PuTTY window with the tunnel configured
  *before* connecting was the reliable fix every time this came up.

**Exact registration commands** (for re-adding after a `remove`, or as a
template for a future account):
```
claude mcp add bigmo-gmail -s user \
  -e GMAIL_OAUTH_PATH=/home/brandon/.mcp-creds/bigmo-google/gmail/gcp-oauth.keys.json \
  -e GMAIL_CREDENTIALS_PATH=/home/brandon/.mcp-creds/bigmo-google/gmail/credentials.json \
  -- npx -y @gongrzhe/server-gmail-autoauth-mcp

claude mcp add bigmo-gdrive -s user \
  -e CLIENT_ID=<client_id> -e CLIENT_SECRET=<client_secret> \
  -e GDRIVE_CREDS_DIR=/home/brandon/.mcp-creds/bigmo-google/gdrive \
  -- npx -y @isaacphi/mcp-gdrive

claude mcp add bigmo-calendar -s user \
  -e GOOGLE_OAUTH_CREDENTIALS=/home/brandon/.mcp-creds/bigmo-google/calendar/gcp-oauth.keys.json \
  -e GOOGLE_CALENDAR_MCP_TOKEN_PATH=/home/brandon/.mcp-creds/bigmo-google/calendar/tokens.json \
  -- npx -y @cocal/google-calendar-mcp
```

Related: [[infra_claude_runs_on_dreamlab]] (why the headless-tunnel dance
was needed at all), [[bigmo_search_scoot_pmp]] (BigMo's other external
service integrations pattern).

**Re-auth run 2026-09-11 (all three, after Google revoked everything on 2026-09-08 via a password change on the account) — what actually worked, so the next run is 10 minutes not an hour:**
- **Gmail:** `GMAIL_OAUTH_PATH=... GMAIL_CREDENTIALS_PATH=... npx -y @gongrzhe/server-gmail-autoauth-mcp auth` — the npx cache copy is still patched to **port 3901** and prints the URL to stdout. Tunnel 3901.
- **Calendar:** `GOOGLE_OAUTH_CREDENTIALS=... GOOGLE_CALENDAR_MCP_TOKEN_PATH=... npx -y @cocal/google-calendar-mcp auth` — picks the first free of **3500–3505** (was 3500) and prints the URL. Tunnel 3500.
- **Drive:** the npx-cached `@google-cloud/local-auth` is now patched to honour **`LOCAL_AUTH_PORT`** for installed clients (it otherwise picks a random port, which is why the tunnel could never be pre-opened), and `mcp-gdrive/dist/auth.js`'s timeout is now **20 min** (was 5 — the first attempt timed out while Brandon was still setting up the tunnel, producing a "connection reset" in his browser). Run: `cd <npx cache>/@isaacphi/mcp-gdrive && LOCAL_AUTH_PORT=3502 node dist/force-auth.mjs` with the `CLIENT_ID/CLIENT_SECRET/GDRIVE_CREDS_DIR` env from `~/.claude.json`. It does NOT print the URL and a fake `xdg-open` on PATH does not intercept it (the `open` package runs its own bundled opener), so **build the URL by hand**: `https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&scope=<SCOPES from dist/auth.js, space-joined>&response_type=code&client_id=<from keys>&redirect_uri=http://localhost:3502/` (note trailing slash, no `/oauth2callback`). Token lands in `$GDRIVE_CREDS_DIR/.gdrive-server-credentials.json`. Tunnel 3502.
- Brandon can add **all three tunnels (3901, 3500, 3502) in one fresh PuTTY window** now that every port is fixed.
- Verify each token without touching MCP: POST the refresh_token to `https://oauth2.googleapis.com/token` and hit one API (`gmail/v1/users/me/profile`, `calendar/v3/users/me/calendarList`, `drive/v3/about?fields=user`). Calendar MCP picked the new token up live; **the Gmail MCP server holds its token in memory and kept returning `invalid_grant` until reconnected** (`/mcp` in Claude Code, or a new session).
- Root cause of the 09-08 revocation is in Google's Security → Recent activity ("Password changed"); an OAuth consent screen still in **Testing** would have expired these within 7 days anyway — publishing it is still the durable fix.
