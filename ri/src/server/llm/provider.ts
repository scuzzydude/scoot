export interface ChatOptions {
  system?: string;
  maxTokens?: number;
  searchEnabled?: boolean;  // let the provider use web search tools if supported
}

export interface LLMProvider {
  chat(messages: { role: string; content: string }[], options?: ChatOptions): Promise<string>;
}

let _provider: LLMProvider | null = null;

export function getProvider(): LLMProvider {
  if (!_provider) throw new Error("LLM provider not initialized — call initProvider() at startup");
  return _provider;
}

// Test hook: inject a mock provider. Returns a restore function.
export function setProvider(p: LLMProvider): () => void {
  const prev = _provider;
  _provider = p;
  return () => {
    _provider = prev;
  };
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
