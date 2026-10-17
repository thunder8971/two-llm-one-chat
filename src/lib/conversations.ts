import { z } from "zod";
import { chatResponseSchema, limits, type Message } from "@/domain/chat";
export const turnSchema = z.object({
  id: z.string(),
  message: z.string().max(limits.message),
  result: chatResponseSchema,
});
export type Turn = z.infer<typeof turnSchema>;
export const savedConversationSchema = z.object({
  version: z.literal(1),
  turns: z.array(turnSchema).max(30),
});
export const STORAGE_KEY = "duet.conversation.v1";

// Keep complete recent user/assistant pairs, never a partial assistant message.
export function buildHistory(turns: Turn[]): Message[] {
  const selected: Message[] = [];
  let size = 0;
  for (const turn of [...turns].reverse()) {
    if (!turn.result.finalAnswer) continue;
    const pairSize = turn.message.length + turn.result.finalAnswer.length;
    if (
      selected.length + 2 > limits.history ||
      size + pairSize > limits.context
    )
      break;
    selected.unshift(
      { role: "user", content: turn.message },
      { role: "assistant", content: turn.result.finalAnswer },
    );
    size += pairSize;
  }
  return selected;
}
