import "server-only";
import type { LLMProvider, Stage } from "@/domain/chat";
import { ConfigurationError, type ProviderConfig } from "@/config/llm";
import { MockLLMProvider } from "./mock";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
export function createProvider(
  config: ProviderConfig,
  stage: Stage,
  mockDelayMs = 0,
): LLMProvider {
  if (config.id === "mock") return new MockLLMProvider(stage, mockDelayMs);
  if (!config.apiKey || !config.model) throw new ConfigurationError();
  switch (config.id) {
    case "openai":
      return new OpenAIProvider(config.model, config.apiKey);
    case "anthropic":
      return new AnthropicProvider(config.model, config.apiKey);
  }
}
