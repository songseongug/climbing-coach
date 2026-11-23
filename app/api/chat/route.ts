import OpenAI from "openai";
import {
  hasHealthDisclosure,
  hasPersonalInfo,
  isNotKorean,
  looksMedical,
} from "@/lib/guards";
import { FIXED_MESSAGES } from "@/lib/messages";
import { buildSystemPrompt } from "@/lib/prompt";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  ChatRequestSchema,
  ModelAnswerSchema,
  type ChatResponse,
} from "@/lib/schema";
import { SOURCES, toSourceRefs } from "@/lib/sources";

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

// AI가 쓴 되묻기 문장을 그대로 보여 줘도 되는지 검사한다.
function isSafeClarifyText(text: string): boolean {
  const t = text.trim();
  const sentences = t.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
  return t.length > 0 && t.length <= 200 && sentences.length <= 2 && !/https?:\/\//i.test(t);
}

// 사용량 제한에 쓸 사용자 구분값(접속 주소)
function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0].trim() || "unknown";
}

export async function POST(request: Request): Promise<Response> {
  // 0) 다른 사이트에서 방문자 브라우저를 이용해 보낸 요청과 JSON이 아닌 요청은 거절한다.
  //    (curl 같은 직접 호출은 막지 못하므로 사용량 제한과 비용 상한이 따로 필요하다.)
  if (request.headers.get("sec-fetch-site") === "cross-site") return fixed("error", 403);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return fixed("error", 415);
  }

  // 1) 요청 모양 검사
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fixed("error", 400);
  }
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) return fixed("error", 400);
  const { previousStatus } = parsed.data;
  const question = parsed.data.messages[parsed.data.messages.length - 1].content;
  // 이전 대화에 개인정보로 의심되는 내용이 있으면 그 메시지는 AI로 보내지 않는다.
  // (연락처 모양은 챗봇 답변도, 건강 상태 서술은 사용자 질문만 검사한다.)
  const messages = parsed.data.messages.filter(
    (m, i, all) =>
      i === all.length - 1 ||
      !(
        hasPersonalInfo(m.content) ||
        (m.role === "user" && hasHealthDisclosure(m.content))
      ),
  );

  // 2) AI를 부르기 전에 코드로 먼저 걸러낸다.
  if (!checkRateLimit(clientKey(request))) return fixed("rate_limited", 429);
  if (hasPersonalInfo(question) || hasHealthDisclosure(question)) {
    return fixed("has_personal_info");
  }
  if (isNotKorean(question)) return fixed("bad_language");
  if (looksMedical(question)) return fixed("medical");

  // 참고 자료가 하나도 없으면 AI를 부르지 않고 오류로 처리한다.
  if (SOURCES.length === 0) {
    console.error("참고 자료(data/sources.json)가 비어 있습니다.");
    return fixed("error", 500);
  }

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
      // 한 번에 길게 쓰는 것을 막아 요금이 갑자기 늘지 않게 한다. (5문장 답변에는 충분하다)
      max_completion_tokens: 600,
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
      // 직전 답이 이미 되묻기였다면 또 되묻지 않는다. (PRD: 되묻기는 1번만)
      if (previousStatus === "clarify") return fixed("unknown");
      // AI가 쓴 되묻기 문장은 출처 검사를 거치지 않으므로, 짧은 질문 문장일 때만 쓴다.
      // (200자 초과, 3문장 이상, 주소 포함이면 정해 둔 문구로 바꾼다.)
      return reply({
        status: "clarify",
        answer: isSafeClarifyText(answer.answer)
          ? answer.answer.trim()
          : FIXED_MESSAGES.clarify,
        sources: [],
      });
    case "off_topic":
      return fixed("off_topic");
    case "medical":
      return fixed("medical");
    case "has_personal_info":
      return fixed("has_personal_info");
    case "unknown":
      return fixed("unknown");
  }
}
