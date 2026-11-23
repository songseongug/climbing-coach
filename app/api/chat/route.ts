import OpenAI from "openai";
import { hasPersonalInfo, isNotKorean } from "@/lib/guards";
import { FIXED_MESSAGES } from "@/lib/messages";
import { buildSystemPrompt } from "@/lib/prompt";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  ChatRequestSchema,
  ModelAnswerSchema,
  type ChatResponse,
} from "@/lib/schema";
import { toSourceRefs } from "@/lib/sources";

// 이 파일은 서버에서만 실행된다. API 키는 브라우저로 나가지 않는다.

// 모델 이름은 코드에 박지 않고 .env의 OPENAI_MODEL로 바꿀 수 있다. (없으면 기본값)
const DEFAULT_MODEL = "gpt-4.1-mini";

function reply(body: ChatResponse, httpStatus = 200): Response {
  return Response.json(body, { status: httpStatus });
}

function fixed(
  status: Exclude<ChatResponse["status"], "ok" | "clarify">,
  httpStatus = 200,
): Response {
  return reply({ status, answer: FIXED_MESSAGES[status], sources: [] }, httpStatus);
}

// 사용량 제한에 쓸 사용자 구분값(접속 주소)
function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0].trim() || "unknown";
}

export async function POST(request: Request): Promise<Response> {
  // 1) 요청 모양 검사
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fixed("error", 400);
  }
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) return fixed("error", 400);
  const { messages } = parsed.data;
  const question = messages[messages.length - 1].content;

  // 2) AI를 부르기 전에 코드로 먼저 걸러낸다.
  if (!checkRateLimit(clientKey(request))) return fixed("rate_limited", 429);
  if (hasPersonalInfo(question)) return fixed("has_personal_info");
  if (isNotKorean(question)) return fixed("bad_language");

  // 3) AI에게 묻기
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY가 설정되지 않았습니다.");
    return fixed("error", 500);
  }

  let content: string | null | undefined;
  try {
    const client = new OpenAI({ apiKey, timeout: 25_000, maxRetries: 1 });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: buildSystemPrompt() }, ...messages],
    });
    content = completion.choices[0]?.message?.content;
  } catch (error) {
    // 질문 내용은 기록하지 않고, 오류 종류만 남긴다.
    console.error("AI 호출 실패:", error instanceof Error ? error.name : "알 수 없는 오류");
    return fixed("error", 502);
  }

  // 4) AI 답이 정해진 모양인지 검사
  let answer;
  try {
    answer = ModelAnswerSchema.parse(JSON.parse(content ?? ""));
  } catch {
    return fixed("error", 502);
  }

  // 5) 상태별로 최종 응답 만들기
  switch (answer.status) {
    case "ok": {
      // 출처 번호가 실제 자료에 있는지 확인한다. 하나도 없으면 근거 없는 답으로 보고 교체한다.
      const sources = toSourceRefs(answer.sourceIds);
      if (sources.length === 0 || !answer.answer.trim()) return fixed("unknown");
      return reply({ status: "ok", answer: answer.answer.trim(), sources: sources });
    }
    case "clarify":
      return reply({
        status: "clarify",
        answer: answer.answer.trim() || FIXED_MESSAGES.clarify,
        sources: [],
      });
    case "off_topic":
      return fixed("off_topic");
    case "medical":
      return fixed("medical");
    case "unknown":
      return fixed("unknown");
  }
}
