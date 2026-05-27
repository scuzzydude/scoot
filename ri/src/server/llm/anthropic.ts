import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, ChatOptions } from "./provider.js";
import { searchWeb } from "../services/search.js";
import { log } from "../log.js";

const SEARCH_TOOL: Anthropic.Tool = {
  name: "web_search",
  description: "Search the web for current information — sports schedules, news, scores, recent events. Use when the question requires up-to-date facts you don't know.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: { type: "string", description: "The search query" },
    },
    required: ["query"],
  },
};

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.LLM_API_KEY });
    this.model = process.env.LLM_MODEL ?? "claude-sonnet-4-20250514";
  }

  async chat(
    messages: { role: string; content: string }[],
    options: ChatOptions = {}
  ): Promise<string> {
    if (options.searchEnabled) {
      return this.chatWithSearch(messages, options);
    }

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens ?? 2048,
      system: options.system,
      messages: messages as Anthropic.MessageParam[],
    });
    const block = response.content[0];
    return block.type === "text" ? block.text : "";
  }

  private async chatWithSearch(
    messages: { role: string; content: string }[],
    options: ChatOptions
  ): Promise<string> {
    const thread: Anthropic.MessageParam[] = messages as Anthropic.MessageParam[];

    // Tool loop — max 3 rounds to avoid runaway calls
    for (let round = 0; round < 3; round++) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: options.maxTokens ?? 2048,
        system: options.system,
        tools: [SEARCH_TOOL],
        messages: thread,
      });

      if (response.stop_reason !== "tool_use") {
        // No tool call — return the text response
        const textBlock = response.content.find((b) => b.type === "text");
        return textBlock?.type === "text" ? textBlock.text : "";
      }

      // Claude wants to search — execute each tool_use block
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const input = block.input as { query?: string };
        const query = input.query ?? "";
        log.debug({ query }, "bot tool call: web_search");
        const result = await searchWeb(query);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result ?? "No search results available.",
        });
      }

      // Add assistant turn + tool results to thread and loop
      thread.push({ role: "assistant", content: response.content });
      thread.push({ role: "user", content: toolResults });
    }

    // Exhausted rounds — ask once more without tools
    const fallback = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens ?? 2048,
      system: options.system,
      messages: thread,
    });
    const textBlock = fallback.content.find((b) => b.type === "text");
    return textBlock?.type === "text" ? textBlock.text : "";
  }
}
