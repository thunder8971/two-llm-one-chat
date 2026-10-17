import { describe, expect, it, vi } from "vitest";
import { readConfig } from "@/config/llm";
import { createProvider } from "@/providers/factory";
import { OpenAIProvider } from "@/providers/openai";
import { AnthropicProvider } from "@/providers/anthropic";
import { MockLLMProvider } from "@/providers/mock";
import { LLMOrchestrator } from "@/services/orchestrator";

describe("server configuration", () => {
  it("defaults to mock with no credentials or model names", () => {
    expect(readConfig({})).toMatchObject({
      mode: "mock",
      writer: { id: "mock" },
      reviewer: { id: "mock" },
    });
  });
  it("ignores live provider settings and makes no external fetch in mock mode", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Network forbidden"));
    const config = readConfig({
      LLM_MODE: "mock",
      WRITER_PROVIDER: "invalid",
      REVIEWER_PROVIDER: "anthropic",
      MOCK_DELAY_MS: "0",
    });
    const writer = createProvider(config.writer, "writer");
    const reviewer = createProvider(config.reviewer, "reviewer");
    expect(writer).toBeInstanceOf(MockLLMProvider);
    const result = await new LLMOrchestrator(writer, reviewer, config).process({
      message: "Hello",
      history: [],
    });
    expect(result.status).toBe("completed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  const env = {
    LLM_MODE: "live",
    WRITER_PROVIDER: "openai",
    WRITER_MODEL: "configured-writer",
    REVIEWER_PROVIDER: "anthropic",
    REVIEWER_MODEL: "configured-reviewer",
    OPENAI_API_KEY: "fake-openai-test-key",
    ANTHROPIC_API_KEY: "fake-anthropic-test-key",
  };
  it("selects official adapters and configurable models", () => {
    const config = readConfig(env);
    expect(createProvider(config.writer, "writer")).toBeInstanceOf(
      OpenAIProvider,
    );
    expect(createProvider(config.reviewer, "reviewer")).toBeInstanceOf(
      AnthropicProvider,
    );
    expect(config.writer.model).toBe("configured-writer");
  });
  it("allows swapped providers and the same provider for both roles", () => {
    const swapped = readConfig({
      ...env,
      WRITER_PROVIDER: "anthropic",
      REVIEWER_PROVIDER: "openai",
    });
    expect(createProvider(swapped.writer, "writer")).toBeInstanceOf(
      AnthropicProvider,
    );
    expect(createProvider(swapped.reviewer, "reviewer")).toBeInstanceOf(
      OpenAIProvider,
    );
    const same = readConfig({
      ...env,
      REVIEWER_PROVIDER: "openai",
      ANTHROPIC_API_KEY: undefined,
    });
    expect(same.reviewer.id).toBe("openai");
  });
  it.each([
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "WRITER_MODEL",
    "REVIEWER_MODEL",
    "WRITER_PROVIDER",
    "REVIEWER_PROVIDER",
  ])("rejects missing live %s", (key) => {
    expect(() => readConfig({ ...env, [key]: "" })).toThrow(
      "Live mode requires",
    );
  });
  it.each([
    { LLM_MODE: "typo" },
    { LLM_TIMEOUT_MS: "0" },
    { LLM_MAX_OUTPUT_TOKENS: "999999" },
    { MOCK_DELAY_MS: "-1" },
  ])("rejects invalid config %j", (value) => {
    expect(() => readConfig(value)).toThrow();
  });
});
