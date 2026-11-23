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
  /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/, // 휴대전화 번호
  /0\d{1,2}[-\s.]\d{3,4}[-\s.]\d{4}/, // 지역 전화 번호
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // 이메일
  /\d{6}[-\s]?[1-4]\d{6}/, // 주민등록번호
];

export function hasPersonalInfo(text: string): boolean {
  return PERSONAL_INFO_PATTERNS.some((pattern) => pattern.test(text));
}
