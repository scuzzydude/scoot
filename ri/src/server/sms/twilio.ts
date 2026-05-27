import twilio from "twilio";
import type { SMSProvider, SendResult, InboundMessage } from "./provider.js";

export class TwilioProvider implements SMSProvider {
  private client: twilio.Twilio;
  private from: string;
  private authToken: string;

  constructor() {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) {
      throw new Error("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER required");
    }
    this.client = twilio(sid, token);
    this.from = from;
    this.authToken = token;
  }

  async send(to: string, body: string): Promise<SendResult> {
    const msg = await this.client.messages.create({ from: this.from, to, body });
    return { sid: msg.sid, status: msg.status };
  }

  validateInboundSignature(signature: string, url: string, params: Record<string, string>): boolean {
    // Trial / dev: allow opt-out
    if (process.env.TWILIO_SKIP_SIGNATURE === "true") return true;
    return twilio.validateRequest(this.authToken, signature, url, params);
  }

  parseInbound(payload: Record<string, string>): InboundMessage {
    return {
      from: payload.From ?? "",
      to: payload.To ?? "",
      body: payload.Body ?? "",
      messageSid: payload.MessageSid ?? "",
      receivedAt: new Date().toISOString(),
    };
  }
}
