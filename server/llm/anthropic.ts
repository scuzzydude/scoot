import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider } from "./provider.js";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.LLM_API_KEY });
    this.model = process.env.LLM_MODEL ?? "claude-sonnet-4-20250514";
  }

  async chat(messages: { role: string; content: string }[], system?: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system,
      messages: messages as Anthropic.MessageParam[],
    });
    const block = response.content[0];
    return block.type === "text" ? block.text : "";
  }
}
