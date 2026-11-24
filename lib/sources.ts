import { z } from "zod";
import raw from "@/data/sources.json";
import type { SourceRef } from "./schema";

// 참고 자료 한 건. 챗봇은 이 자료 안에서만 근거를 가져온다.
export interface Source {
  id: string;
  title: string;
  publisher: string;
  url: string;
  topics: string[];
  summary: string;
  retrievedAt: string;
}

// 자료 파일의 모양을 검사한다. 필드가 빠졌거나 주소가 https가 아닌 항목은 쓰지 않고 로그만 남긴다.
// (실행 중에 갑자기 멈추거나, 검사 안 된 주소가 화면에 나가는 것을 막는다.)
const SourceSchema = z.object({
  id: z.string().min(1).max(20),
  title: z.string().min(1),
  publisher: z.string().min(1),
  url: z.string().startsWith("https://"),
  topics: z.array(z.string()),
  summary: z.string().min(1),
  retrievedAt: z.string(),
});

export const SOURCES: Source[] = (Array.isArray(raw) ? (raw as unknown[]) : []).flatMap(
  (item, i) => {
    const parsed = SourceSchema.safeParse(item);
    if (!parsed.success) {
      console.error(`참고 자료 ${i + 1}번째 항목의 모양이 맞지 않아 제외했습니다.`);
      return [];
    }
    return [parsed.data];
  },
);

// AI가 돌려준 출처 번호 중 실제로 있는 것만 골라 화면용 정보로 바꾼다. (중복 제거)
export function toSourceRefs(ids: string[]): SourceRef[] {
  const seen = new Set<string>();
  const refs: SourceRef[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const found = SOURCES.find((s) => s.id === id);
    if (!found) continue;
    seen.add(id);
    refs.push({
      id: found.id,
      title: found.title,
      publisher: found.publisher,
      url: found.url,
    });
  }
  return refs;
}
