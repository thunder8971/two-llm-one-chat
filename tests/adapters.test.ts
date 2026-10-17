import { describe, expect, it, vi } from "vitest";
import { OpenAIProvider } from "@/providers/openai";
import { AnthropicProvider } from "@/providers/anthropic";
import type { GenerationRequest } from "@/domain/chat";
const sdk = vi.hoisted(() => ({
  openai: vi.fn(),
  anthropic: vi.fn(),
  openaiOptions: vi.fn(),
  anthropicOptions: vi.fn(),
}));
vi.mock("openai", () => ({
  default: class {
    responses = { create: sdk.openai };
    constructor(options: unknown) {
      sdk.openaiOptions(options);
    }
  },
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: sdk.anthropic };
    constructor(options: unknown) {
      sdk.anthropicOptions(options);
    }
  },
}));
const request: GenerationRequest = {
  stage: "writer",
  system: "Role instructions",
  originalRequest: "Hello",
  messages: [{ role: "user", content: "Hello" }],
  signal: new AbortController().signal,
  maxOutputTokens: 512,
};
describe("official SDK adapters", () => {
  it("maps OpenAI input, system instructions, model, limits, and cancellation", async () => {
    sdk.openai.mockResolvedValue({
      status: "completed",
      output_text: "Answer",
    });
    const provider = new OpenAIProvider("selected-openai-model", "test-key");
    expect(await provider.generate(request)).toEqual({ text: "Answer" });
    expect(sdk.openaiOptions).toHaveBeenCalledWith({
      apiKey: "test-key",
      maxRetries: 0,
    });
    expect(sdk.openai).toHaveBeenCalledWith(
      {
        model: "selected-openai-model",
        instructions: request.system,
        input: request.messages,
        max_output_tokens: 512,
        store: false,
      },
      { signal: request.signal },
    );
    expect(provider.metadata).toEqual({
      id: "openai",
      model: "selected-openai-model",
    });
  });
  it("maps Anthropic input and collects text blocks", async () => {
    sdk.anthropic.mockResolvedValue({
      stop_reason: "end_turn",
      content: [
        { type: "text", text: "One" },
        { type: "thinking", thinking: "Private" },
        { type: "text", text: "Two" },
      ],
    });
    const provider = new AnthropicProvider(
      "selected-anthropic-model",
      "test-key",
    );
    expect(await provider.generate(request)).toEqual({ text: "One\nTwo" });
    expect(sdk.anthropicOptions).toHaveBeenCalledWith({
      apiKey: "test-key",
      maxRetries: 0,
    });
    expect(sdk.anthropic).toHaveBeenCalledWith(
      {
        model: "selected-anthropic-model",
        system: request.system,
        messages: request.messages,
        max_tokens: 512,
      },
      { signal: request.signal },
    );
  });
  it("does not present truncated OpenAI output as complete", async () => {
    sdk.openai.mockResolvedValue({
      status: "incomplete",
      output_text: "Partial",
    });
    await expect(
      new OpenAIProvider("model", "key").generate(request),
    ).rejects.toThrow("Incomplete");
  });
  it("does not present truncated Anthropic output as complete", async () => {
    sdk.anthropic.mockResolvedValue({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: "Partial" }],
    });
    await expect(
      new AnthropicProvider("model", "key").generate(request),
    ).rejects.toThrow("Incomplete");
  });
});
