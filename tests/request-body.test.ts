import { afterEach, expect, it, vi } from "vitest";
import { readJsonBody } from "@/lib/request-body";
afterEach(() => vi.useRealTimers());
it("rejects a stalled body even if its partial bytes contain valid JSON", async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"message":"Hi"}'));
    },
    cancel,
  });
  const request = new Request("http://localhost/api/chat", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);
  const parsed = readJsonBody(request);
  const rejected = expect(parsed).rejects.toThrow("Body read timed out");
  await vi.advanceTimersByTimeAsync(10001);
  await rejected;
  expect(cancel).toHaveBeenCalledTimes(1);
});
