---
name: bigmo-mms-capability
description: "MMS (image) sending proven end-to-end through the existing Twilio number — mediaUrl now threaded through SMSProvider.send(). No trigger wired up yet, ready for a 'BigMo, send me my card' intent."
metadata:
  type: project
---

Tested 2026-08-24, prompted by Brandon wanting BigMo to eventually
reply with an image (e.g. "send me my lineup pic" from the
[[project_player_cards_facial_likeness]] pipeline). Split across two
concurrent sessions: this one built/tested the send-path infra,
`scoot-4b` (working the card pipeline) supplied a real test PNG.

**Confirmed:**
- Twilio number `+13614232253` (Fonde Brotherhood account) has
  `mms: true` capability — checked via `GET
  /2010-04-01/Accounts/{sid}/IncomingPhoneNumbers.json`, not assumed.
- A2P 10DLC registration (see [[twilio_a2p_10dlc_registration]]) does
  NOT block MMS separately from SMS on this number/campaign — send
  succeeded with no errorCode.
- One end-to-end test send: real card PNG (Brandon's own "Rocket Man"
  card, 305KB) hosted at a short-lived Azure Blob SAS URL, sent via
  `messages.create({..., mediaUrl: [...]})`. Twilio returned an `MM`-
  prefixed SID, later confirmed `status: delivered, num_media: 1,
  error_code: null` via the Messages API.

**Code change (committed on main):** `SMSProvider.send()` /
`throttledSend()` / `TwilioProvider.send()` (`ri/src/server/sms/
{provider,twilio,send}.ts`) now accept an optional `mediaUrl:
string[]`, passed straight through to Twilio's `messages.create()`.
Backward compatible — every existing caller omits it and gets plain
SMS as before.

**Not done:** nothing calls `throttledSend()` with a mediaUrl yet.
Building the actual "BigMo, send me my card" intent-routing/trigger
was explicitly out of scope for this round — that's the next step
whenever the card pipeline has a stable per-user image to point at.
Whatever hosts the image for that trigger needs a real (non-expiring
or app-managed) public URL — the test used a 72h SAS token, fine for
one-off testing, not for a production trigger.
