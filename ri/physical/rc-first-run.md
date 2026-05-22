# Rocket.Chat — First Run Guide

Do this once after `npm run docker:up:build` pulls and starts RC for the first time.
Takes about 15 minutes total.

---

## 1. Wait for RC to be ready

RC takes 1-2 minutes to start after the containers come up. Watch for it:

```bash
npm run docker:logs
# Wait until you see: "SERVER RUNNING" in the rocketchat container output
```

Then open: **http://localhost:3100**

---

## 2. Admin account

RC will prompt you to create an admin account on first boot.

If the `ADMIN_*` env vars were set (they are by default), RC may auto-create the admin.
Check if you can log in with:
- Username: `rcadmin` (or whatever you set in `RC_ADMIN_USERNAME`)
- Password: `changeme123` (or `RC_ADMIN_PASSWORD`)

**Change this password immediately** in Admin → Users → rcadmin → Edit → Password.

---

## 3. Register the workspace (free)

RC requires workspace registration even for self-hosted. It's free and takes 2 minutes.

1. After login, RC will show a "Register your workspace" prompt — click it
2. Enter your email address
3. Check your email for a confirmation link
4. Done — you won't need to do this again

This unlocks push notifications, the marketplace, and the Twilio SMS app.

---

## 4. Create the Brotherhood channel

1. Click the **+** next to Channels in the sidebar
2. Name: `brotherhood` (or `general` if you want it as the default)
3. Set to **Private** (invite only)
4. Click **Create**

---

## 5. Create the BigMo bot user

BigMo needs a dedicated RC user account to post replies via the REST API.

1. Go to **Admin → Users → New**
2. Fill in:
   - Name: `BigMo`
   - Username: `bigmo`
   - Email: `bigmo@scoot.local`
   - Role: `bot`
   - Password: (set something, won't be used for login)
   - Uncheck "Require password change"
3. Save
4. Go back to **Admin → Users → bigmo**
5. Click **Personal Access Tokens** tab
6. Add a token, name it `scoot-webhook`
7. **Copy the User ID and Token** — you need them now

Add to your `.env`:
```
RC_BOT_USER_ID=<paste User ID here>
RC_BOT_AUTH_TOKEN=<paste Token here>
```

Restart the app container to pick up the new env vars:
```bash
docker restart scoot-app-1
```

---

## 6. Configure the BigMo outgoing webhook

This is what triggers BigMo when someone types `@bigmo` in a channel.

1. Go to **Admin → Integrations → New → Outgoing WebHook**
2. Fill in:
   - **Event Trigger**: Message Sent
   - **Enabled**: Yes
   - **Name**: BigMo
   - **Channel**: `#brotherhood` (or whichever channel)
   - **Trigger Words**: `@bigmo,@BigMo`
   - **URLs**: `http://app:3000/api/v1/rc/webhook`
     *(uses the Docker service name `app` — RC and the Scoot app are on the same Docker network)*
   - **Post as**: `bigmo`
   - **Token**: generate one, copy it
3. Save
4. Add the token to your `.env`:
   ```
   RC_WEBHOOK_TOKEN=<paste token here>
   ```
5. Restart the app container:
   ```bash
   docker restart scoot-app-1
   ```

**Test it:** Go to the brotherhood channel, type `@bigmo hello` — BigMo should reply within a few seconds.

---

## 7. Invite Brotherhood members

For each member:
1. **Admin → Users → New** — create their account
2. Set their username to match their Scoot username (same username = BigMo can look up their context)
3. Add them to the `#brotherhood` channel
4. Send them the RC app download link and your server URL (`http://your-server:3100`)

Or send invite links: **Admin → Rooms → brotherhood → Invite Link**

---

## 8. Optional: Twilio SMS bridge (Phase 3)

Skip for now — covered in the Phase 3 setup guide once you have a Twilio account and phone number.

When ready: **Admin → Marketplace → search "Twilio"** → install → configure with your Twilio credentials.

---

## Checklist

- [ ] RC accessible at http://localhost:3100
- [ ] Admin password changed from default
- [ ] Workspace registered (email confirmed)
- [ ] `#brotherhood` channel created
- [ ] `bigmo` bot user created, RC_BOT_USER_ID + RC_BOT_AUTH_TOKEN in .env
- [ ] Outgoing webhook configured, RC_WEBHOOK_TOKEN in .env
- [ ] `docker restart scoot-app-1` after adding env vars
- [ ] `@bigmo hello` test passes in the brotherhood channel
