import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { downloadTwilioMedia, localizeSelfieUrl } from "./media-download.js";

describe("downloadTwilioMedia / localizeSelfieUrl", () => {
  it("a non-Twilio URL short-circuits to null (no network call attempted)", async () => {
    assert.equal(await downloadTwilioMedia("https://example.com/photo.jpg"), null);
    assert.equal(await downloadTwilioMedia("/media/already-local.jpg"), null);
  });

  it("localizeSelfieUrl falls back to the original URL when not a Twilio URL", async () => {
    assert.equal(await localizeSelfieUrl("https://example.com/photo.jpg"), "https://example.com/photo.jpg");
  });

  describe("with a Twilio-shaped URL but no credentials", () => {
    let prevSid: string | undefined, prevToken: string | undefined;
    before(() => {
      prevSid = process.env.TWILIO_ACCOUNT_SID;
      prevToken = process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
    });
    after(() => {
      if (prevSid !== undefined) process.env.TWILIO_ACCOUNT_SID = prevSid;
      if (prevToken !== undefined) process.env.TWILIO_AUTH_TOKEN = prevToken;
    });

    it("returns null without attempting a fetch", async () => {
      const r = await downloadTwilioMedia("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME1");
      assert.equal(r, null);
    });

    it("localizeSelfieUrl falls back to the original Twilio URL", async () => {
      const url = "https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME1";
      assert.equal(await localizeSelfieUrl(url), url);
    });
  });
});
