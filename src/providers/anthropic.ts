import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type {
  GenerationRequest,
  GenerationResult,
  LLMProvider,
} from "@/domain/chat";
export class AnthropicProvider implements LLMProvider {
  readonly metadata;
  private readonly client: Anthropic;
  constructor(model: string, apiKey: string) {
    this.metadata = { id: "anthropic" as const, model };
    this.client = new Anthropic({ apiKey, maxRetries: 0 });
  }
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const response = await this.client.messages.create(
      {
        model: this.metadata.model,
        system: request.system,
        messages: request.messages,
        max_tokens: request.maxOutputTokens,
      },
      { signal: request.signal },
    );
    if (
      response.stop_reason !== "end_turn" &&
      response.stop_reason !== "stop_sequence"
    )
      throw new Error("Incomplete provider output.");
    return {
      text: response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n"),
    };
  }
}
