import { limits } from "@/domain/chat";

// Bound bytes while reading, including chunked requests without Content-Length.
export async function readJsonBody(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > limits.bodyBytes || !request.body)
    throw new Error("Invalid body");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 10000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limits.bodyBytes) {
        await reader.cancel();
        throw new Error("Body too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    if (timedOut) throw new Error("Body read timed out");
    return JSON.parse(text + decoder.decode());
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
