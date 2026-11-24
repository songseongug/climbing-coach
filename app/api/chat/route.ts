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
import { signText, verifyText } from "@/lib/sign";
import { SOURCES, toSourceRefs } from "@/lib/sources";

// 이 파일은 서버에서만 실행된다. API 키는 브라우저로 나가지 않는다.

// 모델 이름은 코드에 박지 않고 .env의 OPENAI_MODEL로 바꿀 수 있다. (없으면 기본값)
const DEFAULT_MODEL = "gpt-4.1-mini";

function reply(body: ChatResponse, httpStatus = 200): Response {
  // 답변에 서명을 붙여 준다. 다음 요청에서 이 서명이 맞는 이전 답변만 AI에 넘긴다.
  return Response.json({ ...body, sig: signText(body.answer) }, { status: httpStatus });
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

// IPv6 주소를 앞 4덩어리(/64)까지만 남긴다.
// (한 가정이 주소를 2^64개 가지므로, 전체 주소로 구분하면 주소만 바꿔 한도를 피할 수 있다.)
function ipv6Prefix(ip: string): string {
  const [head, tail = ""] = ip.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = ip.includes("::") && tail ? tail.split(":") : [];
  const missing = ip.includes("::") ? 8 - headParts.length - tailParts.length : 0;
  const full = [...headParts, ...Array(Math.max(missing, 0)).fill("0"), ...tailParts];
  return full.slice(0, 4).join(":");
}

// 사용량 제한에 쓸 사용자 구분값(접속 주소)
// Vercel은 x-real-ip를 직접 채우므로 먼저 쓰고, 없으면 x-forwarded-for의 첫 값을 쓴다.
function clientKey(request: Request): string {
  const raw =
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    "";
  const ip = raw.trim().slice(0, 64); // 터무니없이 긴 값으로 기록을 키우지 못하게 자른다.
  if (!ip) return "unknown";
  return ip.includes(":") && !ip.includes(".") ? ipv6Prefix(ip) : ip;
}

// 요청 본문 상한(글자 수). 정상 요청은 최대 약 9,000자라서 넉넉하게 잡았다.
const MAX_BODY_CHARS = 40_000;

export async function POST(request: Request): Promise<Response> {
  // 0) 다른 사이트에서 방문자 브라우저를 이용해 보낸 요청과 JSON이 아닌 요청은 거절한다.
  //    (curl 같은 직접 호출은 막지 못하므로 사용량 제한과 비용 상한이 따로 필요하다.)
  if (request.headers.get("sec-fetch-site") === "cross-site") return fixed("error", 403);
  // Origin이 있으면 이 사이트와 같은 곳에서 온 요청인지 확인한다.
  // (Sec-Fetch-Site를 보내지 않는 오래된 브라우저를 위한 보조 확인)
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      return fixed("error", 403);
    }
    if (originHost !== request.headers.get("host")) return fixed("error", 403);
  }
  // 글 종류는 ';' 앞부분만 잘라 정확히 비교한다. ("text/plain;a=application/json" 같은 꼼수 차단)
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") return fixed("error", 415);
  // 큰 요청은 읽기 전에 거절한다.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_CHARS) {
    return fixed("error", 413);
  }

  // 사용량 제한은 본문을 읽기 전에 센다. (모양이 틀린 요청도 횟수에 포함된다.)
  if (!checkRateLimit(clientKey(request))) return fixed("rate_limited", 429);

  // 1) 요청 모양 검사
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) return fixed("error", 413);
    body = JSON.parse(raw);
  } catch {
    return fixed("error", 400);
  }
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) return fixed("error", 400);
  const { previousStatus } = parsed.data;
  const question = parsed.data.messages[parsed.data.messages.length - 1].content;
  // 이전 대화는 믿을 수 있는 것만 AI로 보낸다.
  // - 챗봇 답변: 서버가 붙여 준 서명이 맞는 것만 쓴다. (가짜 답변 끼워 넣기 차단)
  // - 사용자 질문: 마지막 질문과 같은 검사(개인정보·건강 서술·한국어 아님·의료)를 통과한 것만 쓴다.
  // - 연락처 모양은 챗봇 답변도 검사한다.
  const messages = parsed.data.messages
    .filter(
      (m, i, all) =>
        i === all.length - 1 ||
        (m.role === "assistant"
          ? verifyText(m.content, m.sig) && !hasPersonalInfo(m.content)
          : !(
              hasPersonalInfo(m.content) ||
              hasHealthDisclosure(m.content) ||
              isNotKorean(m.content) ||
              looksMedical(m.content)
            )),
    )
    // sig는 AI에 보내지 않는다.
    .map((m) => ({ role: m.role, content: m.content }));

  // 2) AI를 부르기 전에 코드로 먼저 걸러낸다.
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
    // 원인을 알 수 있도록 상태 번호와 오류 코드만 함께 남긴다. (질문 내용·키는 남기지 않는다)
    const detail = error as { status?: number; code?: string };
    console.error(
      "AI 호출 실패:",
      error instanceof Error ? error.name : "알 수 없는 오류",
      detail.status ?? "",
      detail.code ?? "",
    );
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
