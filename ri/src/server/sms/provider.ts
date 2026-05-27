export interface SendResult {
  sid: string;
  status: string;
}

export interface InboundMessage {
  from: string;
  to: string;
  body: string;
  messageSid: string;
  receivedAt: string;
}

export interface SMSProvider {
  send(to: string, body: string): Promise<SendResult>;
  validateInboundSignature(signature: string, url: string, params: Record<string, string>): boolean;
  parseInbound(payload: Record<string, string>): InboundMessage;
}

let _provider: SMSProvider | null = null;

export function getProvider(): SMSProvider {
  if (!_provider) throw new Error("SMS provider not initialized — call initProvider() at startup");
  return _provider;
}

export function setProvider(p: SMSProvider): () => void {
  const prev = _provider;
  _provider = p;
  return () => {
    _provider = prev;
  };
}

export async function initProvider(): Promise<void> {
  const type = process.env.SMS_PROVIDER ?? "twilio";
  if (type === "twilio") {
    const { TwilioProvider } = await import("./twilio.js");
    _provider = new TwilioProvider();
  } else {
    throw new Error(`Unknown SMS_PROVIDER: ${type}`);
  }
}
