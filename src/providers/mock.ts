import type {
  GenerationRequest,
  GenerationResult,
  LLMProvider,
  Stage,
} from "@/domain/chat";

export class MockLLMProvider implements LLMProvider {
  readonly metadata;
  constructor(
    stage: Stage,
    private readonly delayMs = 0,
  ) {
    this.metadata = { id: "mock" as const, model: `simulated-${stage}-v1` };
  }
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    request.signal.throwIfAborted();
    if (this.delayMs)
      await new Promise<void>((resolve, reject) => {
        const finish = () => {
          request.signal.removeEventListener("abort", abort);
          resolve();
        };
        const timer = setTimeout(finish, this.delayMs);
        const abort = () => {
          clearTimeout(timer);
          reject(request.signal.reason);
        };
        request.signal.addEventListener("abort", abort, { once: true });
      });
    if (request.stage === "writer") {
      const previousTurns = request.messages.filter(
        (message) => message.role === "assistant",
      ).length;
      return {
        text: `[SIMULATED WRITER DRAFT]\n\nYour request: ${request.originalRequest}\n\nDraft approach: clarify the goal, break it into manageable steps, and explain the result.\n\nConversation context: ${previousTurns} previous answer${previousTurns === 1 ? "" : "s"}. This is deterministic demo text, not an answer from a live language model.`,
      };
    }
    if (!request.draft)
      throw new Error("The reviewer requires a writer draft.");
    return {
      text: request.draft
        .replace("[SIMULATED WRITER DRAFT]", "[SIMULATED REVIEWED RESPONSE]")
        .replace(
          "Draft approach: clarify the goal, break it into manageable steps, and explain the result.",
          "Revised approach:\n1. Define the desired outcome and any constraints.\n2. Work through the task in clear, manageable steps.\n3. Check the result against the original request.\n\nThe simulated reviewer reorganized the draft for clarity. No external verification was performed.",
        ),
    };
  }
}
