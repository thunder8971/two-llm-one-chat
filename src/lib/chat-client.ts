import {
  chatResponseSchema,
  pipelineEventSchema,
  publicErrorSchema,
  type ChatRequest,
  type ChatResponse,
  type Stage,
} from "@/domain/chat";

export async function sendChat(
  input: ChatRequest,
  signal: AbortSignal,
  onStage: (stage: Stage) => void,
): Promise<ChatResponse> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const parsed = publicErrorSchema.safeParse(
      body && typeof body === "object" && "error" in body ? body.error : null,
    );
    throw new Error(
      parsed.success
        ? parsed.data.message
        : "The server could not process the request. Please try again.",
    );
  }
  if (!response.headers.get("content-type")?.includes("text/event-stream"))
    return chatResponseSchema.parse(await response.json());
  if (!response.body) throw new Error("The server returned an empty response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (!frame.startsWith("data: ")) continue;
        const event = pipelineEventSchema.parse(JSON.parse(frame.slice(6)));
        if (event.type === "stage") onStage(event.stage);
        else if (event.type === "error") throw new Error(event.error.message);
        else return event.result;
      }
      if (done)
        throw new Error(
          "The connection ended before the answer arrived. Please try again.",
        );
      if (buffer.length > 1000000)
        throw new Error("The response exceeded the expected size.");
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
