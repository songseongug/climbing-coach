# 🧗 클라이밍 코치

클라이밍 스포츠테크(기기·앱·데이터 분석 도구)에 대해 물어보면, **미리 모아 둔 공개 자료 안에서만** 근거를 찾아 짧은 한국어 답변과 **출처**를 보여 주는 챗봇 웹앱이에요.

- 대상: 클라이밍 훈련에 스포츠테크를 도입하고 싶은 클라이머(선수)와 코치
- 로그인 없이 웹 브라우저(폰·PC)에서 바로 사용해요.
- 대화는 브라우저 화면 안에만 있고 서버나 DB에 저장하지 않아요.

## 주요 기능

| 구분 | 기능 |
|---|---|
| must | **질문 답변**: 5문장 이내 답변, 전문 용어 한 줄 풀이, 답변마다 출처 1개 이상 |
| must | **후속 질문**: 직전 5턴까지 기억해 이어서 질문 |
| 안전 규칙 | 자료에 없으면 "확실한 정보가 없습니다", 의학 조언 금지, 주제 밖·한국어 아닌 질문 안내, 개인정보 입력 차단 |
| nice | 종류별 추천 질문 버튼, 답변 👍/👎 표시, 대화 복사 |

## 기술 스택

- Next.js 16 (App Router) · TypeScript · Tailwind CSS
- OpenAI Chat Completions (기본 모델 `gpt-4.1-mini`)
- 배포: Vercel

## 문서

| 문서 | 내용 |
|---|---|
| [PRD.md](PRD.md) | 기획서: 문제 정의, 목표, 기능, 범위, 보안·개인정보 |
| [PLAN.md](PLAN.md) | 계획서: 성공 기준과 작업 순서 |
| [DESIGN.md](DESIGN.md) | 설계서: 화면, 데이터 흐름, 오류 처리, 테스트 계획 |
| [CHECK.md](CHECK.md) | 점검 결과: 성공 기준 판정, 설계 대비 차이, 보안 점검 |

## 직접 실행해 보기

```bash
npm install
```

프로젝트 루트에 `.env` 파일을 만들고 OpenAI API 키를 넣어요. (이 파일은 git에 올라가지 않아요.)

```
OPENAI_API_KEY=여기에_본인_키
```

```bash
npm run dev
```

브라우저에서 http://localhost:3000 을 열어요. 모델을 바꾸려면 `.env`에 `OPENAI_MODEL`을 추가하면 돼요.

## 검증

```bash
npm run lint
npm run build
node scripts/accuracy-test.mjs http://localhost:3000   # 정확도 20문항 (OpenAI 호출, 약 3분)
node scripts/edge-test.mjs http://localhost:3000       # 예외 상태 확인 (비용 없음)
```

## 폴더 구조

```
app/        화면(page.tsx)과 답변 API(api/chat/route.ts)
lib/        답변 규칙, 개인정보·언어 검사, 사용량 제한, 서명
data/       참고 자료 16개 (sources.json)
scripts/    정확도·예외 상태 테스트
review/     검수자용 검수표
```

## 알아 둘 점

- 답변은 `data/sources.json`의 공개 자료 16개만 근거로 해요. 자료에 없는 주제는 답하지 못해요.
- 정확도 테스트 20/20은 상태·출처·문장 수를 보는 **자동 채점**이에요. 답변 내용이 사실과 맞는지는 사람이 따로 검수해야 해요.
- 질문 내용은 답변을 만들기 위해 OpenAI로 전송돼요. 이름·연락처·건강 정보는 입력하지 마세요.
- 이 앱은 의학적 조언을 하지 않아요.

작성자: 송성욱
