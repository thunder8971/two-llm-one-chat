import {
  chatRequestSchema,
  type PipelineEvent,
  type PublicError,
} from "@/domain/chat";
import { readConfig } from "@/config/llm";
import { createProvider } from "@/providers/factory";
import { LLMOrchestrator } from "@/services/orchestrator";
import { readJsonBody } from "@/lib/request-body";

export const runtime = "nodejs";
export const maxDuration = 130;
const headers = { "Cache-Control": "no-store" };
const fail = (error: PublicError, status: number) =>
  Response.json({ error }, { status, headers });
export async function POST(request: Request): Promise<Response> {
  // Same-origin browser requests only; CLI clients can omit Origin.
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  // Next may use its bind address in request.url; Host preserves the browser destination.
  const expectedOrigin = `${url.protocol}//${request.headers.get("host") ?? url.host}`;
  if (origin && origin !== expectedOrigin)
    return fail(
      {
        code: "INVALID_INPUT",
        message: "Cross-origin requests are not accepted.",
      },
      403,
    );
  if (!request.headers.get("content-type")?.includes("application/json"))
    return fail(
      { code: "INVALID_INPUT", message: "Send an application/json request." },
      415,
    );
  let input;
  try {
    const parsed = chatRequestSchema.safeParse(await readJsonBody(request));
    if (!parsed.success)
      return fail(
        {
          code: "INVALID_INPUT",
          message:
            "Enter 1–4,000 characters and provide at most 20 history messages totaling 24,000 characters.",
        },
        400,
      );
    input = parsed.data;
  } catch {
    return fail(
      {
        code: "INVALID_INPUT",
        message: "The request body is invalid or too large.",
      },
      400,
    );
  }
  let orchestrator: LLMOrchestrator;
  try {
    const config = readConfig();
    orchestrator = new LLMOrchestrator(
      createProvider(config.writer, "writer", config.mockDelayMs),
      createProvider(config.reviewer, "reviewer", config.mockDelayMs),
      config,
    );
  } catch {
    return fail(
      {
        code: "CONFIGURATION_ERROR",
        message:
          "The server's LLM configuration is incomplete or invalid. Check provider, model, API key, and limit settings in .env.local.",
      },
      503,
    );
  }
  if (!request.headers.get("accept")?.includes("text/event-stream")) {
    const result = await orchestrator.process(input, {
      signal: request.signal,
    });
    return Response.json(result, {
      status:
        result.status === "failed"
          ? result.error?.code === "TIMEOUT"
            ? 504
            : 502
          : 200,
      headers,
    });
  }
  const encoder = new TextEncoder();
  const cancellation = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: PipelineEvent) => {
        if (!cancellation.signal.aborted)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
      };
      void orchestrator
        .process(input, {
          signal: AbortSignal.any([request.signal, cancellation.signal]),
          onStage: (stage) => emit({ type: "stage", stage }),
        })
        .then((result) => emit({ type: "result", result }))
        .catch(() =>
          emit({
            type: "error",
            error: {
              code: "INTERNAL_ERROR",
              message: "The request could not be completed.",
            },
          }),
        )
        .finally(() => {
          if (!cancellation.signal.aborted) controller.close();
        });
    },
    cancel() {
      cancellation.abort();
    },
  });
  return new Response(stream, {
    headers: {
      ...headers,
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
