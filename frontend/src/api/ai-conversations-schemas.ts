import { z } from "zod";

const jsonMapSchema = z.record(z.string(), z.unknown());
export const MAX_AI_CONVERSATION_PAGE_LIMIT = 200;
export const BOUNDED_AI_MESSAGE_HISTORY_REASON = "bounded_message_history";

export const aiConversationSummarySchema = jsonMapSchema;
export const aiConversationListSchema = z.strictObject({
  conversations: z.array(aiConversationSummarySchema),
});

export const aiConversationDetailSchema = z
  .strictObject({
    conversation: jsonMapSchema,
    messages: z.array(jsonMapSchema),
    limit: z.number().int().min(1).max(MAX_AI_CONVERSATION_PAGE_LIMIT),
    has_more: z.boolean(),
    next_cursor: z.string().min(1).nullable(),
    messages_completeness: z.enum(["complete", "partial"]),
    partial_reason_codes: z.array(z.string()),
  })
  .superRefine((value, context) => {
    const bounded = value.partial_reason_codes.includes(
      BOUNDED_AI_MESSAGE_HISTORY_REASON,
    );
    if (
      value.has_more
      && (
        value.next_cursor === null
        || value.messages_completeness !== "partial"
        || !bounded
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "partial message page requires cursor and bounded history reason",
      });
    }
    if (
      !value.has_more
      && (
        value.next_cursor !== null
        || value.messages_completeness !== "complete"
        || value.partial_reason_codes.length > 0
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "complete message page cannot carry partial pagination state",
      });
    }
  });

export const aiConversationAcceptedSchema = z.strictObject({
  accepted: z.boolean(),
  conversation_id: z.string().min(1),
  message_id: z.string().min(1),
  event_id: z.string().min(1),
  correlation_id: z.string().min(1),
});

export type AiConversationSummary = z.infer<
  typeof aiConversationSummarySchema
>;
export type AiConversationList = z.infer<typeof aiConversationListSchema>;
export type AiConversationDetail = z.infer<typeof aiConversationDetailSchema>;
export type AiConversationAccepted = z.infer<
  typeof aiConversationAcceptedSchema
>;
