import { z } from "zod";

export const limits = {
  message: 4000,
  history: 20,
  context: 24000,
  output: 24000,
  bodyBytes: 160000,
} as const;
export const messageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(limits.output),
  })
  .strict();
export type Message = z.infer<typeof messageSchema>;
export const chatRequestSchema = z
  .object({
    message: z.string().trim().min(1, "Enter a message.").max(limits.message),
    history: z.array(messageSchema).max(limits.history).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.history.reduce(
        (size, message) => size + message.content.length,
        0,
      ) > limits.context
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["history"],
        message: "Conversation context is too large.",
      });
    }
  });
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type Stage = "writer" | "reviewer";
export type ProviderId = "mock" | "openai" | "anthropic";
export interface ProviderMetadata {
  id: ProviderId;
  model: string;
}
export interface GenerationRequest {
  stage: Stage;
  system: string;
  messages: Message[];
  originalRequest: string;
  draft?: string;
  signal: AbortSignal;
  maxOutputTokens: number;
}
export interface GenerationResult {
  text: string;
}
export interface LLMProvider {
  readonly metadata: ProviderMetadata;
  generate(request: GenerationRequest): Promise<GenerationResult>;
}
export const publicErrorSchema = z.object({
  code: z.enum([
    "INVALID_INPUT",
    "CONFIGURATION_ERROR",
    "WRITER_FAILED",
    "REVIEWER_FAILED",
    "TIMEOUT",
    "CANCELLED",
    "INTERNAL_ERROR",
  ]),
  message: z.string(),
  stage: z.enum(["writer", "reviewer"]).optional(),
});
export type PublicError = z.infer<typeof publicErrorSchema>;
const stageResultSchema = z.object({
  provider: z.object({
    id: z.enum(["mock", "openai", "anthropic"]),
    model: z.string(),
  }),
  status: z.enum(["completed", "failed", "skipped"]),
  latencyMs: z.number().nonnegative(),
});
export const chatResponseSchema = z.object({
  id: z.string(),
  mode: z.enum(["mock", "live"]),
  originalMessage: z.string(),
  finalAnswer: z.string().nullable(),
  writerDraft: z.string().nullable(),
  reviewerOutput: z.string().nullable(),
  status: z.enum(["completed", "review_failed", "failed"]),
  stages: z.object({ writer: stageResultSchema, reviewer: stageResultSchema }),
  totalMs: z.number().nonnegative(),
  error: publicErrorSchema.optional(),
});
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export const pipelineEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("stage"), stage: z.enum(["writer", "reviewer"]) }),
  z.object({ type: z.literal("result"), result: chatResponseSchema }),
  z.object({ type: z.literal("error"), error: publicErrorSchema }),
]);
export type PipelineEvent = z.infer<typeof pipelineEventSchema>;
