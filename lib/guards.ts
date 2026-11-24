// AI를 부르기 전에 코드로 먼저 걸러내는 검사들 (비용과 오류를 줄이기 위해)

// 한국어가 아닌 질문인지 검사한다.
// 한글이 하나도 없고 영문자가 8자 이상이면 한국어가 아니라고 본다.
// ("V4?" 같은 짧은 질문이나 "Kilter Board 앱" 같은 섞어 쓴 질문은 통과)
export function isNotKorean(text: string): boolean {
  const hangul = (text.match(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return hangul === 0 && latin >= 8;
}

// 개인정보처럼 보이는 모양(전화번호, 이메일, 주민등록번호)이 들어 있는지 검사한다.
const PERSONAL_INFO_PATTERNS: RegExp[] = [
  /01[016789][-\s._/–—]?\d{3,4}[-\s._/–—]?\d{4}/, // 휴대전화 번호
  /\+82[-\s._/–—]?\(?0?\)?[-\s._/–—]?1[016789][-\s._/–—]?\d{3,4}[-\s._/–—]?\d{4}/, // 국제 형식 휴대전화 번호 (+82 10-…)
  /0\d{1,2}[-\s._/–—]\d{3,4}[-\s._/–—]\d{4}/, // 지역 전화 번호
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // 이메일
  /\d{6}[-\s]?[1-4]\d{6}/, // 주민등록번호
];

// 검사를 피하려고 글자를 바꿔 쓴 경우(전각 숫자 "０１０", 눈에 안 보이는 글자 끼워 넣기)를 잡도록
// 검사 전에 글자 모양을 표준 형태로 정리한다.
function normalizeForCheck(text: string): string {
  return text.normalize("NFKC").replace(/[​-‍⁠﻿]/g, "");
}

export function hasPersonalInfo(text: string): boolean {
  const t = normalizeForCheck(text);
  return PERSONAL_INFO_PATTERNS.some((pattern) => pattern.test(t));
}

// "저는 작년에 무릎 수술을 받았어요"처럼 내 건강 상태를 직접 밝혔는지 검사한다.
// AI의 판정은 같은 질문에도 결과가 달라질 수 있어서, 분명한 표현은 코드가 먼저 막는다.
const HEALTH_DISCLOSURE_PATTERN =
  /(?<![가-힣])(저는|제가|저도|나는|내가|난(?![가-힣])|제(?![가-힣]))\s*[^.?!\n]{0,25}(수술|아프|아파|아픈|통증|다쳤|다친|부상을 당|염증|골절|파열|질환|진단을? 받|병원)/;

export function hasHealthDisclosure(text: string): boolean {
  return HEALTH_DISCLOSURE_PATTERN.test(normalizeForCheck(text));
}

// 의학적 진단·치료·재활 상담으로 보이는 질문인지 검사한다. (PRD: 의학 조언 금지)
// "부상 예방 앱"처럼 애매한 말은 넣지 않고, 나머지는 AI가 판정한다.
const MEDICAL_PATTERN =
  /(재활|통증|치료|염증|파열|골절|진단|처방|보충제|아프|아픈|아파|다쳤|다친|수술)/;

export function looksMedical(text: string): boolean {
  return MEDICAL_PATTERN.test(normalizeForCheck(text));
}

// AI가 쓴 "정상 답변(ok)"을 그대로 보여 줘도 되는지 검사한다.
// (규칙을 피해 엉뚱한 글이 나가는 것을 막는 마지막 확인. 어기면 "모름" 문구로 바꾼다.)
const PROMPT_MARKERS = ["[지킬 규칙]", "[참고 자료]", "[클라이밍 기본 용어]", "[출력 형식]"];

export function isSafeAnswerText(text: string): boolean {
  const t = text.trim();
  if (/https?:\/\/|www\./i.test(t)) return false; // 주소는 서버가 만든 출처 목록으로만 보여 준다.
  if (PROMPT_MARKERS.some((m) => t.includes(m))) return false; // 규칙·자료 원문 유출
  const sentences = t.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
  if (sentences.length > 6) return false; // 5문장 이내 규칙(여유 1문장)
  const hangul = (t.match(/[가-힣]/g) ?? []).length;
  const letters = (t.match(/[A-Za-z가-힣]/g) ?? []).length;
  return letters === 0 || hangul / letters >= 0.3; // 한국어 답변인지
}
