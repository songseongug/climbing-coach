import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// 정확도 테스트: 질문 20개를 챗봇 API에 보내고 기대한 결과와 맞는지 표로 보여 준다.
// 사용법: 개발 서버를 켠 뒤  node scripts/accuracy-test.mjs http://localhost:3000
// 검수표도 만들려면 끝에 --sheet 파일경로 를 붙인다.
//   예) node scripts/accuracy-test.mjs http://localhost:3000 --sheet review/검수표.md
// 사용량 제한(1분 10회) 때문에 질문 사이에 7초씩 쉰다. 전체 약 2~3분 걸린다.
//
// 주의: 이 점수는 "상태와 출처가 기대와 맞는지"를 보는 자동 점검이다.
// 답변 내용이 사실과 맞는지는 클라이밍 코치나 클라이머 1~2명이 따로 검수한다. (PRD 3번)

const BASE_URL = process.argv[2] ?? "http://localhost:3000";
const DELAY_MS = 7000;
const sheetIdx = process.argv.indexOf("--sheet");
const sheetPath = sheetIdx > -1 ? process.argv[sheetIdx + 1] : null;

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

const EXPECT_LABEL = {
  ok: "참고 자료로 답해야 하는 질문",
  unknown: "자료에 없어서 '확실한 정보가 없습니다'라고 답해야 하는 질문",
  off_topic: "주제 밖이라 안내 문구로 답해야 하는 질문",
  medical: "의료 상담이라 전문가 상담을 권해야 하는 질문",
  clarify: "모호해서 종류와 목적을 되물어야 하는 질문",
};

// 검수자에게 줄 검수표(마크다운)를 만든다.
function buildSheet(details, score) {
  const sources = JSON.parse(
    readFileSync(new URL("../data/sources.json", import.meta.url), "utf8"),
  );
  const byId = new Map(sources.map((s) => [s.id, s]));
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    "# 클라이밍 코치 정확도 검수표",
    "",
    `- 만든 날: ${today}`,
    `- 검수자 이름: ____________________  (클라이밍 경력: ____________ )`,
    `- 검수한 날: ____________________`,
    "",
    "## 검수 방법",
    "",
    "1. 질문마다 챗봇 답변을 읽고, 아래 **출처 요약**과 비교해 ✔ 표시를 해 주세요. (□ 칸에 ✔ 또는 O)",
    "2. 사실이 **맞음**이면 정답으로 셉니다. **애매함**과 **틀림**은 정답이 아닙니다.",
    "3. 20개 중 **18개 이상**이 맞으면 합격입니다.",
    "4. 틀리거나 애매한 이유는 메모에 짧게 적어 주세요. 개선에 쓰입니다.",
    "",
    `> 참고: 자동 점검(상태·출처·5문장)은 ${score} 통과했습니다. 아래 검수는 **내용이 사실과 맞는지**를 사람이 보는 것입니다.`,
    "",
  ];
  details.forEach(({ c, r, ok }, i) => {
    const ids = (r.sources ?? []).map((s) => s.id);
    lines.push(`## ${i + 1}. ${c.q}`, "");
    lines.push(`- 이 질문의 유형: ${EXPECT_LABEL[c.expect]}`);
    lines.push(`- 자동 점검: ${ok ? "통과" : "실패"} (기대 ${c.expect} / 실제 ${r.status})`, "");
    lines.push("**챗봇 답변**", "");
    for (const t of String(r.answer ?? "").split("\n")) lines.push(`> ${t}`);
    lines.push("");
    if (ids.length > 0) {
      lines.push("**출처 (답변이 이 내용과 맞는지 비교해 주세요)**", "");
      for (const id of ids) {
        const s = byId.get(id);
        if (!s) continue;
        lines.push(`- **${s.title}** (${s.publisher}) — ${s.url}`);
        lines.push(`  - 요약: ${s.summary}`);
      }
      lines.push("");
      lines.push("**검수**", "");
      lines.push("- 사실: □ 맞음  □ 애매함  □ 틀림");
      lines.push("- 이해(용어 풀이·길이): □ 좋음  □ 보통  □ 어려움");
    } else {
      lines.push("**검수**", "");
      lines.push("- 이 응답이 적절한가: □ 적절  □ 애매함  □ 부적절");
    }
    lines.push("- 메모: ", "", "---", "");
  });
  lines.push(
    "## 집계",
    "",
    "| 항목 | 개수 |",
    "|---|---|",
    "| 맞음(정답) | ____ / 20 |",
    "| 애매함 | ____ |",
    "| 틀림 | ____ |",
    "",
    "합격 기준: 맞음 18개 이상 → □ 합격  □ 불합격",
    "",
    "## 시간·사이트 수 측정 (PLAN 성공 기준 7·8번)",
    "",
    "챗봇으로 기술 하나(예: \"Tindeq Progressor가 뭔가요?\")를 알아보게 한 뒤 적어 주세요.",
    "",
    "| 질문 | 답 |",
    "|---|---|",
    "| 챗봇으로 질문부터 이해까지 걸린 시간 | ______ 분 |",
    "| 평소 이런 정보를 알아보는 데 걸리는 시간 | ______ 분 |",
    "| 평소 확인하는 사이트·앱 수 | ______ 곳 |",
    "| 챗봇 1곳으로 충분했나요? | □ 예  □ 아니요 |",
    "| 기타 의견 | |",
    "",
  );
  return lines.join("\n");
}

let pass = 0;
const rows = [];
const details = [];
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
  details.push({ c, r, ok });
  rows.push({ no: i + 1, 결과: ok ? "통과" : "실패", 기대: c.expect, 실제: r.status, 출처: ids.join(",") || "-", 메모: note });
  process.stdout.write(`${i + 1}/${CASES.length} ${ok ? "통과" : "실패"}\n`);
  if (i < CASES.length - 1) await sleep(DELAY_MS);
}

if (sheetPath) {
  mkdirSync(dirname(sheetPath), { recursive: true });
  writeFileSync(sheetPath, buildSheet(details, `${pass}/${CASES.length}`), "utf8");
  console.log(`검수표를 만들었어요: ${sheetPath}`);
}

console.table(rows);
console.log(`\n점수: ${pass}/${CASES.length} (${Math.round((pass / CASES.length) * 100)}%) — 목표 18/20 이상`);
process.exit(pass >= 18 ? 0 : 1);
