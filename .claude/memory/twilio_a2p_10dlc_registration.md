---
name: twilio-a2p-10dlc-registration
description: "Twilio US SMS from long-code +13614232253 needs A2P 10DLC brand+campaign registration. Error 30034 = unregistered, not a code bug. Don't go diagnosing the .env or provider wiring next time."
metadata: 
  node_type: memory
  type: project
  originSessionId: ddc7ab1a-729e-40b8-a8f1-8456f9a6d11d
---

The Scoot Twilio account is "**The Fonde Brotherhood**" (account type: Full, active, SID prefix `ACc44d...`). The provisioned long-code is `+13614232253` (Phone Number SID `PN64d2511...`).

**Symptom that will recur if registration isn't done:** outbound SMS via the Twilio API returns `sid`/`status: queued` looking like success, then Twilio updates the message to `status: undelivered` with `errorCode: 30034` and `errorMessage: null`. Recipients never see anything.

**Cause:** since 2023, US mobile carriers (Verizon/AT&T/T-Mobile) filter all SMS sent from unregistered 10-digit long codes to US destinations. Twilio accepts the API call, attempts delivery, the carrier filter blocks it, Twilio surfaces 30034. This is *not* a code, env, signature, or auth bug — the wiring is fine.

**Why:** Established 2026-05-27 during outbound smoke test from steve. Spent two cycles confirming creds load, the `twilio` package installs in the container, env vars reach the SDK, and the routes mount with auth/signature gating — all passed. The carrier-level block was the only remaining cause. See [[infra_claude_runs_on_steve]] for the steve context this test ran against.

**How to apply:**
- If outbound SMS appears to "succeed" but never arrives, **first check `messages(sid).fetch().status` for `undelivered` + `errorCode: 30034`** before suspecting code. One Twilio API call resolves it.
- 30034 = registration gap. Tell Brandon to check Twilio Console → Messaging → Regulatory Compliance for brand + campaign status. Don't propose code changes.
- For dev iteration without real delivery, use Twilio's [test credentials](https://www.twilio.com/docs/iam/test-credentials) (separate sandbox SID/auth, magic destination numbers like `+15005550006`). That stays free and bypasses 10DLC.
- Implementation files unchanged by this finding: `ri/src/server/sms/provider.ts`, `ri/src/server/sms/twilio.ts`, `ri/src/server/routes/sms.ts`. They are correct.
- Provider account name "The Fonde Brotherhood" maps to Scoot(34) / [[scoot_concept_model]] — same entity, branded for the brotherhood at the Twilio billing layer.
