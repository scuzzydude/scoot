---
name: twilio-a2p-10dlc-registration
description: "Twilio US SMS from long-code +13614232253 needs A2P 10DLC brand+campaign registration. Error 30034 = unregistered, not a code bug. Don't go diagnosing the .env or provider wiring next time."
metadata: 
  node_type: memory
  type: project
  originSessionId: ddc7ab1a-729e-40b8-a8f1-8456f9a6d11d
  modified: 2026-08-16T18:25:56.233Z
---

The Scoot Twilio account is "**The Fonde Brotherhood**" (account type: Full, active, SID prefix `ACc44d...`). The provisioned long-code is `+13614232253` (Phone Number SID `PN64d2511...`).

**Symptom that will recur if registration isn't done:** outbound SMS via the Twilio API returns `sid`/`status: queued` looking like success, then Twilio updates the message to `status: undelivered` with `errorCode: 30034` and `errorMessage: null`. Recipients never see anything.

**Cause:** since 2023, US mobile carriers (Verizon/AT&T/T-Mobile) filter all SMS sent from unregistered 10-digit long codes to US destinations. Twilio accepts the API call, attempts delivery, the carrier filter blocks it, Twilio surfaces 30034. This is *not* a code, env, signature, or auth bug — the wiring is fine.

**Why:** Established 2026-05-27 during outbound smoke test from prod (hostname `dreamlab`, renamed 2026-07-27 from `steve`). Spent two cycles confirming creds load, the `twilio` package installs in the container, env vars reach the SDK, and the routes mount with auth/signature gating — all passed. The carrier-level block was the only remaining cause. See [[infra_claude_runs_on_dreamlab]] for the prod-host context this test ran against.

**Status as of 2026-05-31:** Brand `BN3a14060b678891aaae81425d52c498aa` = **APPROVED / VETTED_VERIFIED**. Campaign `QE2c6890da8086d771620e9b13fadeba0b` (Messaging Service `MG845da3c50d78ebb95ba456d2dae6c1c7`, use case **2FA**) was **REJECTED**, then **RESUBMITTED** after Brandon updated the website (the logged-out landing page now states the SMS purpose + "Text 361-423-2253 for latest updates", plus the existing /privacy + /terms pages). Awaiting re-review; outbound still 30034 until approved.

**RESOLVED as of 2026-08-16** (confirmed via live Twilio API query during the BigMo discovery-QA pass, `~/BIGMO_DISCOVERY_QA.md` §5.2): brand still `APPROVED`, campaign now `CBCWY0U` (a new campaign SID, presumably from the resubmission above) with status **VERIFIED**. Outbound 30034 should no longer occur. Throughput: AT&T 40 msg/sec, T-Mobile brand tier LOW.

**New open concern, not the old one:** the verified campaign's registered use case is still **2FA only** — description and all message samples on file are literally "your verification code is 123456." BigMo actually sends plenty of non-2FA conversational traffic in production today (staking Q&A, schedule confirmations, oversight, GYMBOSS flows) under this narrow registration, and the MMS player-card feature (see [[scoot_currency_ledger]]-adjacent `arch/player-cards.md` work) would add yet another distinct use case on top. This is a real carrier-filtering/compliance exposure worth a look independent of any specific feature — not a blocker for anything, but don't assume "A2P is registered" means "current usage matches what's registered."

**Inbound SMS is testable NOW, independent of 10DLC** (carrier filtering only blocks *outbound* to US mobiles). Next session: point the Twilio number / Messaging Service inbound webhook at `https://thedreamlaboratory.org/api/v1/sms/inbound` (already proxied via Apache's `/api` rule → Express :3000). Either set `SMS_INBOUND_URL` to that exact URL in `.env` for signature validation, or `TWILIO_SKIP_SIGNATURE=true` for a first pass. Then text the number and read `GET /api/v1/sms/inbox` (auth) or app logs. `SMS_AUTOREPLY=true` is set, so it'll echo back.

Brand done, campaign is the remaining gate; just waiting on approval, no code action. Once approved, prefer sending via `messagingServiceSid` (MG845…) over the raw `from` number. Test harness: `node scripts/test-sms.cjs +1XXXXXXXXXX` (sends + polls status; `--status <sid>` to re-poll). A2P status check: query `messaging.v1.brandRegistrations` + `services(MG…).usAppToPerson`.

**How to apply:**
- If outbound SMS appears to "succeed" but never arrives, **first check `messages(sid).fetch().status` for `undelivered` + `errorCode: 30034`** before suspecting code. One Twilio API call resolves it.
- 30034 = registration gap. Tell Brandon to check Twilio Console → Messaging → Regulatory Compliance for brand + campaign status. Don't propose code changes.
- For dev iteration without real delivery, use Twilio's [test credentials](https://www.twilio.com/docs/iam/test-credentials) (separate sandbox SID/auth, magic destination numbers like `+15005550006`). That stays free and bypasses 10DLC.
- Implementation files unchanged by this finding: `ri/src/server/sms/provider.ts`, `ri/src/server/sms/twilio.ts`, `ri/src/server/routes/sms.ts`. They are correct.
- Provider account name "The Fonde Brotherhood" maps to Scoot(34) / [[scoot_concept_model]] — same entity, branded for the brotherhood at the Twilio billing layer.
