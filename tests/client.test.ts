import { expect, it, vi } from "vitest";
import { sendChat } from "@/lib/chat-client";
import {
  buildHistory,
  savedConversationSchema,
  type Turn,
} from "@/lib/conversations";
import { LLMOrchestrator } from "@/services/orchestrator";
import { MockLLMProvider } from "@/providers/mock";
import type { PipelineEvent } from "@/domain/chat";
const input = { message: "Hello é 🌿", history: [] };
const result = () =>
  new LLMOrchestrator(
    new MockLLMProvider("writer"),
    new MockLLMProvider("reviewer"),
    { mode: "mock", timeoutMs: 100, maxOutputTokens: 256 },
  ).process(input);
it("parses SSE frames split across arbitrary byte boundaries", async () => {
  const final = await result();
  const events: PipelineEvent[] = [
    { type: "stage", stage: "writer" },
    { type: "stage", stage: "reviewer" },
    { type: "result", result: final },
  ];
  const encoded = new TextEncoder().encode(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
  );
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          for (const byte of encoded)
            controller.enqueue(new Uint8Array([byte]));
          controller.close();
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    ),
  );
  const stages = vi.fn();
  expect(await sendChat(input, new AbortController().signal, stages)).toEqual(
    final,
  );
  expect(stages.mock.calls).toEqual([["writer"], ["reviewer"]]);
});
it("reports an interrupted stream", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response('data: {"type":"stage","stage":"writer"}\n\n', {
      headers: { "content-type": "text/event-stream" },
    }),
  );
  await expect(
    sendChat(input, new AbortController().signal, vi.fn()),
  ).rejects.toThrow("connection ended");
});
it("uses safe API errors", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json(
      {
        error: {
          code: "CONFIGURATION_ERROR",
          message: "Check server configuration.",
        },
      },
      { status: 503 },
    ),
  );
  await expect(
    sendChat(input, new AbortController().signal, vi.fn()),
  ).rejects.toThrow("Check server configuration");
});
it("propagates network failure", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new TypeError("Failed to fetch"),
  );
  await expect(
    sendChat(input, new AbortController().signal, vi.fn()),
  ).rejects.toThrow("Failed to fetch");
});
it("limits context to complete recent turns and validates stored conversations", async () => {
  const response = await result();
  const turns: Turn[] = Array.from({ length: 15 }, (_, i) => ({
    id: String(i),
    message: `message ${i}`,
    result: { ...response, finalAnswer: `answer ${i}` },
  }));
  expect(buildHistory(turns)).toHaveLength(20);
  expect(buildHistory(turns)[0].content).toBe("message 5");
  expect(buildHistory(turns).at(-1)?.content).toBe("answer 14");
  expect(savedConversationSchema.safeParse({ version: 1, turns }).success).toBe(
    true,
  );
  expect(savedConversationSchema.safeParse({ version: 0, turns }).success).toBe(
    false,
  );
  const oversized = [
    ...turns,
    { ...turns[0], result: { ...response, finalAnswer: "x".repeat(24000) } },
  ];
  expect(buildHistory(oversized)).toEqual([]);
  const failed = [{ ...turns[0], result: { ...response, finalAnswer: null } }];
  expect(buildHistory(failed)).toEqual([]);
});
