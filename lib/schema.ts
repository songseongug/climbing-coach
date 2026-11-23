import { z } from "zod";

// 챗봇 응답 상태 9가지 (DESIGN.md 3번 표와 같다)
export const CHAT_STATUSES = [
  "ok",
  "clarify",
  "off_topic",
  "medical",
  "unknown",
  "rate_limited",
  "bad_language",
  "has_personal_info",
  "error",
] as const;
export type ChatStatus = (typeof CHAT_STATUSES)[number];

// 서버로 들어오는 요청 모양: 직전 5턴(10개) + 새 질문 1개까지만 받는다.
export const ChatRequestSchema = z
  .object({
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().min(1).max(1000),
        }),
      )
      .min(1)
      .max(11),
  })
  .refine((v) => v.messages[v.messages.length - 1].role === "user", {
    message: "마지막 메시지는 사용자 질문이어야 합니다.",
  });
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// AI가 돌려줘야 하는 모양. 이 모양이 아니면 오류로 처리한다.
export const ModelAnswerSchema = z.object({
  status: z.enum(["ok", "clarify", "off_topic", "medical", "unknown"]),
  answer: z.string(),
  sourceIds: z.array(z.string()).default([]),
});

// 화면에 보여 줄 출처 정보
export interface SourceRef {
  id: string;
  title: string;
  publisher: string;
  url: string;
}

// 서버가 화면으로 돌려주는 응답
export interface ChatResponse {
  status: ChatStatus;
  answer: string;
  sources: SourceRef[];
}
