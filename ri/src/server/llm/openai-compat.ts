import OpenAI from "openai";
import type { LLMProvider, ChatOptions } from "./provider.js";

export class OpenAICompatProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.LLM_API_KEY ?? "none",
      baseURL: process.env.LLM_API_URL,
    });
    this.model = process.env.LLM_MODEL ?? "gpt-4o";
  }

  async chat(
    messages: { role: string; content: string }[],
    options: ChatOptions = {}
  ): Promise<string> {
    const fullMessages: OpenAI.ChatCompletionMessageParam[] = options.system
      ? [{ role: "system", content: options.system }, ...messages as OpenAI.ChatCompletionMessageParam[]]
      : (messages as OpenAI.ChatCompletionMessageParam[]);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: fullMessages,
      max_tokens: options.maxTokens,
    });
    return response.choices[0]?.message.content ?? "";
  }
}
