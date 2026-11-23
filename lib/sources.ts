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

export const SOURCES: Source[] = raw as Source[];

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
