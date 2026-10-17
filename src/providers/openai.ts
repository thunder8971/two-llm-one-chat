import "server-only";
import OpenAI from "openai";
import type {
  GenerationRequest,
  GenerationResult,
  LLMProvider,
} from "@/domain/chat";
export class OpenAIProvider implements LLMProvider {
  readonly metadata;
  private readonly client: OpenAI;
  constructor(model: string, apiKey: string) {
    this.metadata = { id: "openai" as const, model };
    this.client = new OpenAI({ apiKey, maxRetries: 0 });
  }
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const response = await this.client.responses.create(
      {
        model: this.metadata.model,
        instructions: request.system,
        input: request.messages,
        max_output_tokens: request.maxOutputTokens,
        store: false,
      },
      { signal: request.signal },
    );
    if (response.status !== "completed")
      throw new Error("Incomplete provider output.");
    return { text: response.output_text };
  }
}
