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

// 글자 수 제한: 사용자 질문은 1000자, 이전 챗봇 답변은 4000자까지 받는다.
const MAX_USER_CHARS = 1000;
const MAX_ASSISTANT_CHARS = 4000;

// 서버로 들어오는 요청 모양: 직전 5턴(10개) + 새 질문 1개까지만 받는다.
export const ChatRequestSchema = z
  .object({
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          // 이전 챗봇 답변이 길어도 대화가 막히지 않도록 넉넉하게 받고,
          // 사용자 질문은 아래 refine에서 1000자로 따로 제한한다.
          content: z.string().min(1).max(MAX_ASSISTANT_CHARS),
        }),
      )
      .min(1)
      .max(11),
    // 직전 답변의 상태. "되묻기는 1번만" 규칙을 서버가 지키는 데 쓴다.
    previousStatus: z.enum(CHAT_STATUSES).optional(),
  })
  .refine((v) => v.messages[v.messages.length - 1].role === "user", {
    message: "마지막 메시지는 사용자 질문이어야 합니다.",
  })
  .refine(
    (v) =>
      v.messages.every((m) => m.role !== "user" || m.content.length <= MAX_USER_CHARS),
    { message: `사용자 질문은 ${MAX_USER_CHARS}자까지만 받습니다.` },
  );
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// AI가 돌려줘야 하는 모양. 이 모양이 아니면 오류로 처리한다.
export const ModelAnswerSchema = z.object({
  status: z.enum([
    "ok",
    "clarify",
    "off_topic",
    "medical",
    "unknown",
    "has_personal_info",
  ]),
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
