import "server-only";
import { z } from "zod";
import type { ProviderId } from "@/domain/chat";

export class ConfigurationError extends Error {
  constructor() {
    super(
      "Live mode requires valid provider, model, and API key settings on the server. Check .env.local.",
    );
  }
}
const envSchema = z.object({
  LLM_MODE: z.enum(["mock", "live"]).default("mock"),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(30000),
  LLM_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .min(256)
    .max(4096)
    .default(2048),
  MOCK_DELAY_MS: z.coerce.number().int().min(0).max(2000).default(700),
});
export interface ProviderConfig {
  id: ProviderId;
  model: string;
  apiKey?: string;
}
export interface LLMConfig {
  mode: "mock" | "live";
  writer: ProviderConfig;
  reviewer: ProviderConfig;
  timeoutMs: number;
  maxOutputTokens: number;
  mockDelayMs: number;
}
export function readConfig(
  env: Record<string, string | undefined> = process.env,
): LLMConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) throw new ConfigurationError();
  const data = parsed.data;
  const role = (name: "WRITER" | "REVIEWER"): ProviderConfig => {
    if (data.LLM_MODE === "mock")
      return { id: "mock", model: `simulated-${name.toLowerCase()}-v1` };
    const id = z
      .enum(["openai", "anthropic"])
      .safeParse(env[`${name}_PROVIDER`]);
    const model = env[`${name}_MODEL`]?.trim();
    if (!id.success || !model) throw new ConfigurationError();
    const apiKey =
      env[
        id.data === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"
      ]?.trim();
    if (!apiKey) throw new ConfigurationError();
    return { id: id.data, model, apiKey };
  };
  return {
    mode: data.LLM_MODE,
    writer: role("WRITER"),
    reviewer: role("REVIEWER"),
    timeoutMs: data.LLM_TIMEOUT_MS,
    maxOutputTokens: data.LLM_MAX_OUTPUT_TOKENS,
    mockDelayMs: data.MOCK_DELAY_MS,
  };
}
