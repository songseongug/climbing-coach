// 정확도 테스트: 질문 20개를 챗봇 API에 보내고 기대한 결과와 맞는지 표로 보여 준다.
// 사용법: 개발 서버를 켠 뒤  node scripts/accuracy-test.mjs http://localhost:3000
// 사용량 제한(1분 10회) 때문에 질문 사이에 7초씩 쉰다. 전체 약 2~3분 걸린다.
//
// 주의: 이 점수는 "상태와 출처가 기대와 맞는지"를 보는 자동 점검이다.
// 답변 내용이 사실과 맞는지는 클라이밍 코치나 클라이머 1~2명이 따로 검수한다. (PRD 3번)

const BASE_URL = process.argv[2] ?? "http://localhost:3000";
const DELAY_MS = 7000;

// expect: 기대하는 응답 상태, sources: ok일 때 이 중 하나는 출처에 있어야 한다.
const CASES = [
  // 자료로 답할 수 있는 질문 14개
  { q: "Tindeq Progressor 앱은 어떤 항목을 측정하나요?", expect: "ok", sources: ["s01"] },
  { q: "Progressor 200의 샘플링 주파수와 충전 방식은 뭔가요?", expect: "ok", sources: ["s02"] },
  { q: "Tindeq Progressor의 타당도 연구에서는 어떤 장비와 비교했나요?", expect: "ok", sources: ["s03"] },
  { q: "핑거보드와 캠퍼스 보드는 뭐가 다른가요?", expect: "ok", sources: ["s04"] },
  { q: "Garmin 시계로 실내 클라이밍을 기록하면 어떤 것이 기록되나요?", expect: "ok", sources: ["s05"] },
  { q: "BetterClimber 앱은 계정이 필요한가요?", expect: "ok", sources: ["s06"] },
  { q: "KAYA 앱에는 어떤 기능이 있나요?", expect: "ok", sources: ["s07"] },
  { q: "Mountain Project는 어떤 서비스인가요?", expect: "ok", sources: ["s08", "s09"] },
  { q: "The Topo는 어떤 사이트인가요?", expect: "ok", sources: ["s10"] },
  { q: "MoonBoard 앱은 어떻게 문제를 보여 주나요?", expect: "ok", sources: ["s11"] },
  { q: "Kilter Board 앱은 어떻게 사용하나요?", expect: "ok", sources: ["s12"] },
  { q: "Tension Board 2 앱은 어떤 기능이 있나요?", expect: "ok", sources: ["s13"] },
  { q: "V 등급과 프랑스식 등급은 어떻게 다른가요?", expect: "ok", sources: ["s14"] },
  { q: "볼더링과 리드 클라이밍은 뭐가 다른가요?", expect: "ok", sources: ["s15", "s16"] },
  // 자료에 없는 클라이밍 스포츠테크 질문 3개 (모른다고 답해야 함)
  { q: "Whoop 밴드로 클라이밍 중 심박 변이도를 분석할 수 있나요?", expect: "unknown" },
  { q: "클라이밍 영상 분석 앱 Cruxes의 월 구독 가격은 얼마인가요?", expect: "unknown" },
  { q: "MoonBoard를 국내에서 사려면 가격이 얼마인가요?", expect: "unknown" },
  // 주제 밖 / 의료 / 모호 질문 3개
  { q: "오늘 서울 날씨 어때요?", expect: "off_topic" },
  { q: "손가락 힘줄 부상 재활에 좋은 측정 기기를 알려 주세요.", expect: "medical" },
  { q: "좋은 거 추천해 주세요.", expect: "clarify" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 문장 수를 대략 센다. (마침표·물음표·느낌표 뒤 공백 기준)
function countSentences(text) {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0).length;
}

async function ask(q) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: q }] }),
    });
    const data = await res.json();
    if (data.status === "rate_limited") {
      await sleep(20000); // 한도에 걸리면 잠시 기다렸다가 다시 시도한다.
      continue;
    }
    return data;
  }
  return { status: "rate_limited", answer: "", sources: [] };
}

let pass = 0;
const rows = [];
for (const [i, c] of CASES.entries()) {
  const r = await ask(c.q);
  const ids = (r.sources ?? []).map((s) => s.id);
  let ok = r.status === c.expect;
  let note = "";
  if (ok && c.expect === "ok") {
    if (!c.sources.some((id) => ids.includes(id))) {
      ok = false;
      note = `기대 출처 ${c.sources.join("/")} 없음 (받은 출처: ${ids.join(",") || "없음"})`;
    } else if (countSentences(r.answer) > 5) {
      ok = false;
      note = `문장 ${countSentences(r.answer)}개 (5개 초과)`;
    }
  }
  if (!ok && !note) note = `기대 ${c.expect}, 실제 ${r.status}`;
  if (ok) pass++;
  rows.push({ no: i + 1, 결과: ok ? "통과" : "실패", 기대: c.expect, 실제: r.status, 출처: ids.join(",") || "-", 메모: note });
  process.stdout.write(`${i + 1}/${CASES.length} ${ok ? "통과" : "실패"}\n`);
  if (i < CASES.length - 1) await sleep(DELAY_MS);
}

console.table(rows);
console.log(`\n점수: ${pass}/${CASES.length} (${Math.round((pass / CASES.length) * 100)}%) — 목표 18/20 이상`);
process.exit(pass >= 18 ? 0 : 1);
