import { createHmac, timingSafeEqual } from "node:crypto";

// 챗봇 답변에 서명을 붙여, 화면이 보낸 "이전 챗봇 답변"이 진짜인지 서버가 확인한다.
// (가짜 이전 대화를 끼워 넣어 규칙을 피하는 것을 막기 위함)
// 서명 열쇠는 새 비밀값을 따로 두지 않고 OPENAI_API_KEY에서 파생한다.
// 서버에서만 쓰며, 서명 값만으로는 키를 알아낼 수 없다. 키를 바꾸면 이전 서명은 무효가 된다.

function secret(): string | null {
  const key = process.env.OPENAI_API_KEY;
  return key ? `climbing-coach-history-v1:${key}` : null;
}

function mac(text: string, key: string): Buffer {
  return createHmac("sha256", key).update(text, "utf8").digest();
}

// 서명(16진수 문자열). 열쇠가 없으면 undefined
export function signText(text: string): string | undefined {
  const key = secret();
  return key ? mac(text, key).toString("hex") : undefined;
}

// 서명이 맞으면 true
export function verifyText(text: string, sig: string | undefined): boolean {
  const key = secret();
  if (!key || !sig || !/^[0-9a-f]{64}$/.test(sig)) return false;
  return timingSafeEqual(mac(text, key), Buffer.from(sig, "hex"));
}
