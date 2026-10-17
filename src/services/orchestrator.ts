import {
  limits,
  type ChatRequest,
  type ChatResponse,
  type GenerationRequest,
  type LLMProvider,
  type PublicError,
  type Stage,
} from "@/domain/chat";
import { reviewerRequest, writerRequest } from "./roles";
interface Options {
  mode: "mock" | "live";
  timeoutMs: number;
  maxOutputTokens: number;
}
interface ProcessOptions {
  signal?: AbortSignal;
  onStage?: (stage: Stage) => void;
}

export class LLMOrchestrator {
  constructor(
    private readonly writer: LLMProvider,
    private readonly reviewer: LLMProvider,
    private readonly options: Options,
  ) {}

  private async invoke(
    provider: LLMProvider,
    request: Omit<GenerationRequest, "signal" | "maxOutputTokens">,
    parent?: AbortSignal,
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () =>
        controller.abort(new DOMException("Stage timed out", "TimeoutError")),
      this.options.timeoutMs,
    );
    const cancel = () =>
      controller.abort(new DOMException("Request cancelled", "AbortError"));
    if (parent?.aborted) cancel();
    parent?.addEventListener("abort", cancel, { once: true });
    let abort: () => void = () => {};
    try {
      controller.signal.throwIfAborted();
      const cancelled = new Promise<never>((_, reject) => {
        abort = () => reject(controller.signal.reason);
        controller.signal.addEventListener("abort", abort, { once: true });
      });
      // Bound even an adapter that ignores AbortSignal; official SDKs also cancel their network call.
      const result = await Promise.race([
        provider.generate({
          ...request,
          signal: controller.signal,
          maxOutputTokens: this.options.maxOutputTokens,
        }),
        cancelled,
      ]);
      if (!result.text.trim() || result.text.length > limits.output)
        throw new Error("Invalid provider output.");
      return result.text;
    } finally {
      clearTimeout(timeout);
      parent?.removeEventListener("abort", cancel);
      controller.signal.removeEventListener("abort", abort);
    }
  }

  async process(
    input: ChatRequest,
    { signal, onStage }: ProcessOptions = {},
  ): Promise<ChatResponse> {
    const start = performance.now();
    const result: ChatResponse = {
      id: crypto.randomUUID(),
      mode: this.options.mode,
      originalMessage: input.message,
      finalAnswer: null,
      writerDraft: null,
      reviewerOutput: null,
      status: "failed",
      totalMs: 0,
      stages: {
        writer: {
          provider: this.writer.metadata,
          status: "skipped",
          latencyMs: 0,
        },
        reviewer: {
          provider: this.reviewer.metadata,
          status: "skipped",
          latencyMs: 0,
        },
      },
    };
    let active: Stage = "writer";
    let stageStart = start;
    try {
      onStage?.("writer");
      result.writerDraft = await this.invoke(
        this.writer,
        writerRequest(input),
        signal,
      );
      result.stages.writer = {
        ...result.stages.writer,
        status: "completed",
        latencyMs: Math.round(performance.now() - stageStart),
      };
      active = "reviewer";
      stageStart = performance.now();
      onStage?.("reviewer");
      result.reviewerOutput = await this.invoke(
        this.reviewer,
        reviewerRequest(input, result.writerDraft),
        signal,
      );
      result.stages.reviewer = {
        ...result.stages.reviewer,
        status: "completed",
        latencyMs: Math.round(performance.now() - stageStart),
      };
      result.finalAnswer = result.reviewerOutput;
      result.status = "completed";
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      const code: PublicError["code"] =
        name === "TimeoutError"
          ? "TIMEOUT"
          : name === "AbortError"
            ? "CANCELLED"
            : active === "writer"
              ? "WRITER_FAILED"
              : "REVIEWER_FAILED";
      result.stages[active] = {
        ...result.stages[active],
        status: "failed",
        latencyMs: Math.round(performance.now() - stageStart),
      };
      result.error = {
        code,
        stage: active,
        message:
          active === "reviewer"
            ? "Review did not complete. This is the original, unreviewed Writer draft."
            : code === "TIMEOUT"
              ? "The Writer timed out. Please try again."
              : code === "CANCELLED"
                ? "The request was cancelled."
                : "The Writer could not generate a response. Please try again.",
      };
      if (result.writerDraft !== null) {
        result.finalAnswer = result.writerDraft;
        result.status = "review_failed";
      }
    }
    result.totalMs = Math.round(performance.now() - start);
    return result;
  }
}
