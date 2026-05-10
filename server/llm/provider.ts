export interface LLMProvider {
  chat(messages: { role: string; content: string }[], system?: string): Promise<string>;
}

let _provider: LLMProvider | null = null;

export function getProvider(): LLMProvider {
  if (!_provider) throw new Error("LLM provider not initialized — call initProvider() at startup");
  return _provider;
}

export async function initProvider(): Promise<void> {
  const type = process.env.LLM_PROVIDER ?? "anthropic";
  if (type === "anthropic") {
    const { AnthropicProvider } = await import("./anthropic.js");
    _provider = new AnthropicProvider();
  } else if (type === "openai_compat") {
    const { OpenAICompatProvider } = await import("./openai-compat.js");
    _provider = new OpenAICompatProvider();
  } else {
    throw new Error(`Unknown LLM_PROVIDER: ${type}`);
  }
}
