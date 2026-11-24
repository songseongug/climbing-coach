// 사용량 제한: 1명당 1분에 10회까지만 허용한다. (PRD 7번)
// 서버 메모리에만 기록하는 간단한 방식이다.
// 한계: Vercel이 서버를 여러 개로 나누면 횟수가 서로 공유되지 않는다. (DESIGN.md 4번)

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const MAX_TRACKED_KEYS = 5_000;

const hits = new Map<string, number[]>();

// 허용되면 true, 한도를 넘으면 false
export function checkRateLimit(key: string, now: number = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS) {
    hits.set(key, recent);
    return false;
  }

  recent.push(now);
  hits.set(key, recent);

  // 기록이 너무 많이 쌓이면 1분이 지난 것부터 정리한다.
  if (hits.size > MAX_TRACKED_KEYS) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
    // 그래도 넘치면(짧은 시간에 새 키가 몰릴 때) 가장 먼저 들어온 키부터 지워 상한을 지킨다.
    for (const k of hits.keys()) {
      if (hits.size <= MAX_TRACKED_KEYS) break;
      hits.delete(k);
    }
  }
  return true;
}
