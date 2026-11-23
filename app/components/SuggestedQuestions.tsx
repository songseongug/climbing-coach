// 빈 화면에서 보여 주는 추천 질문 버튼 (클라이밍 종류별)
const SUGGESTIONS = [
  { label: "볼더링", question: "볼더링 훈련에 쓸 만한 손가락 힘 측정 기기가 있나요?" },
  { label: "볼더링", question: "V등급은 무엇이고 어떻게 읽나요?" },
  { label: "리드", question: "리드 클라이밍 기록을 남기는 앱에는 어떤 게 있나요?" },
  { label: "공통", question: "클라이밍 훈련용 보드와 앱에는 어떤 게 있나요?" },
];

interface Props {
  onSelect: (question: string) => void;
  disabled: boolean;
}

export default function SuggestedQuestions({ onSelect, disabled }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        이런 질문부터 해 보세요
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {SUGGESTIONS.map(({ label, question }) => (
          <button
            key={question}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(question)}
            className="rounded-2xl border border-orange-300 bg-orange-50 px-4 py-3 text-left text-sm text-zinc-800 transition hover:bg-orange-100 disabled:opacity-50 dark:border-orange-800 dark:bg-orange-950/40 dark:text-zinc-100 dark:hover:bg-orange-950"
          >
            <span className="mr-2 rounded-full bg-orange-500 px-2 py-0.5 text-xs font-semibold text-white">
              {label}
            </span>
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}
