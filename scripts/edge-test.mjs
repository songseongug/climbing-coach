// 예외 상태 확인: AI를 부르지 않고 코드가 먼저 걸러내는 경우를 시험한다. (비용 0, 약 1초)
// 사용법: 개발 서버를 켠 뒤  node scripts/edge-test.mjs http://localhost:3000
// 정확도 테스트(accuracy-test.mjs)가 다루지 않는 상태와 HTTP 코드를 확인한다.
// 시험마다 다른 접속 주소(x-real-ip)를 써서 서로, 그리고 다른 사용자의 사용량 제한에 영향을 주지 않는다.

const BASE_URL = process.argv[2] ?? "http://localhost:3000";
const JSON_HEADERS = { "Content-Type": "application/json" };
const q = (content) => JSON.stringify({ messages: [{ role: "user", content }] });

async function post(ip, body, headers = JSON_HEADERS) {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { ...headers, "x-real-ip": ip },
    body,
  });
  const data = await res.json();
  return { http: res.status, status: data.status };
}

const checks = [];
function check(name, got, expectHttp, expectStatus) {
  const ok = got.http === expectHttp && got.status === expectStatus;
  checks.push({ 시험: name, 결과: ok ? "통과" : "실패", 기대: `${expectHttp} ${expectStatus}`, 실제: `${got.http} ${got.status}` });
}

check("한국어 아님", await post("198.51.100.1", q("What is the best climbing training app for beginners")), 200, "bad_language");
check("전화번호 포함", await post("198.51.100.2", q("010-1234-5678 로 연락 주세요. 그램 앱 알려줘")), 200, "has_personal_info");
check("전각 숫자 전화번호", await post("198.51.100.3", q("０１０-１２３４-５６７８ 로 연락 주세요")), 200, "has_personal_info");
check("건강 상태 서술", await post("198.51.100.4", q("저는 작년에 무릎 수술을 받았어요. 앱 추천해 주세요")), 200, "has_personal_info");
check("모양이 틀린 요청", await post("198.51.100.5", "{}"), 400, "error");
check("JSON이 아닌 글 종류", await post("198.51.100.6", q("안녕"), { "Content-Type": "text/plain;a=application/json" }), 415, "error");
check("다른 사이트에서 온 요청", await post("198.51.100.7", q("안녕"), { ...JSON_HEADERS, "Sec-Fetch-Site": "cross-site" }), 403, "error");
check("너무 큰 요청", await post("198.51.100.8", JSON.stringify({ a: "가".repeat(50000) })), 413, "error");

// 사용량 제한: 같은 주소로 11번 보내면 11번째가 막힌다. (모양이 틀린 요청도 횟수에 센다)
let last;
for (let i = 0; i < 11; i++) last = await post("198.51.100.9", "{}");
check("사용량 제한(11번째)", last, 429, "rate_limited");

console.table(checks);
const failed = checks.filter((c) => c.결과 === "실패").length;
console.log(failed === 0 ? "\n모두 통과" : `\n실패 ${failed}개`);
process.exit(failed === 0 ? 0 : 1);
