import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/chat/route";
import {
  chatRequestSchema,
  chatResponseSchema,
  pipelineEventSchema,
  limits,
} from "@/domain/chat";
import { MockLLMProvider } from "@/providers/mock";
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.stubEnv("LLM_MODE", "mock");
  vi.stubEnv("MOCK_DELAY_MS", "0");
});
afterEach(() => vi.unstubAllEnvs());

describe("input validation", () => {
  it("trims input and supplies empty history", () =>
    expect(chatRequestSchema.parse({ message: " Hi " })).toEqual({
      message: "Hi",
      history: [],
    }));
  it.each([
    { message: "" },
    { message: "  " },
    { message: "a".repeat(4001) },
    { message: "ok", history: [{ role: "system", content: "hijack" }] },
    {
      message: "ok",
      history: Array.from({ length: 21 }, () => ({
        role: "user",
        content: "a",
      })),
    },
    {
      message: "ok",
      history: [
        { role: "user", content: "a".repeat(12001) },
        { role: "assistant", content: "b".repeat(12000) },
      ],
    },
    { message: "ok", provider: "openai" },
  ])("rejects invalid inputs", (body) =>
    expect(chatRequestSchema.safeParse(body).success).toBe(false),
  );
});
describe("POST /api/chat", () => {
  it("returns a structured successful JSON result without API keys", async () => {
    const response = await POST(request({ message: "Hello" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = chatResponseSchema.parse(await response.json());
    expect(body.status).toBe("completed");
    expect(body.mode).toBe("mock");
    expect(body.stages.writer.provider.id).toBe("mock");
  });
  it("streams real stage transitions followed by one complete result", async () => {
    const response = await POST(
      request({ message: "Hello" }, { Accept: "text/event-stream" }),
    );
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const events = (await response.text())
      .trim()
      .split("\n\n")
      .map((frame) => pipelineEventSchema.parse(JSON.parse(frame.slice(6))));
    expect(events.slice(0, 2)).toEqual([
      { type: "stage", stage: "writer" },
      { type: "stage", stage: "reviewer" },
    ]);
    expect(events).toHaveLength(3);
    expect(events[2].type).toBe("result");
  });
  it("returns 400 for invalid input and malformed JSON", async () => {
    expect((await POST(request({ message: " " }))).status).toBe(400);
    const malformed = new Request("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{broken",
    });
    expect((await POST(malformed)).status).toBe(400);
  });
  it("rejects oversized bodies without trusting Content-Length", async () => {
    expect(
      (await POST(request({ message: "a".repeat(limits.bodyBytes + 1) })))
        .status,
    ).toBe(400);
  });
  it("rejects cross-origin browser requests and wrong content types", async () => {
    expect(
      (
        await POST(
          request({ message: "Hi" }, { origin: "https://foreign.example" }),
        )
      ).status,
    ).toBe(403);
    expect(
      (await POST(request({ message: "Hi" }, { "Content-Type": "text/plain" })))
        .status,
    ).toBe(415);
  });
  it("reports incomplete live configuration without leaking credentials", async () => {
    vi.stubEnv("LLM_MODE", "live");
    vi.stubEnv("WRITER_MODEL", "");
    vi.stubEnv("OPENAI_API_KEY", "hidden-test-secret");
    const response = await POST(request({ message: "Hi" }));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("CONFIGURATION_ERROR");
    expect(body).not.toContain("hidden-test-secret");
  });
  it("returns 502 on Writer failure and preserves safe error metadata", async () => {
    vi.spyOn(MockLLMProvider.prototype, "generate").mockRejectedValue(
      new Error("private detail"),
    );
    const response = await POST(request({ message: "Hi" }));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error.code).toBe("WRITER_FAILED");
    expect(JSON.stringify(body)).not.toContain("private detail");
  });
  it("returns a warned draft when the Reviewer fails", async () => {
    vi.spyOn(MockLLMProvider.prototype, "generate")
      .mockResolvedValueOnce({ text: "Draft" })
      .mockRejectedValueOnce(new Error("private detail"));
    const response = await POST(request({ message: "Hi" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "review_failed",
      finalAnswer: "Draft",
      error: { code: "REVIEWER_FAILED" },
    });
  });
});

it("accepts the browser Host when Next uses its internal bind address", async () => {
  const req = new Request("http://0.0.0.0:3000/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: "localhost:3000",
      Origin: "http://localhost:3000",
    },
    body: JSON.stringify({ message: "Hi" }),
  });
  expect((await POST(req)).status).toBe(200);
});
