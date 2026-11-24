"use client";

import type { ChatStatus, SourceRef } from "@/lib/schema";

// 화면에 쌓이는 대화 한 건
export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: ChatStatus;
  sources?: SourceRef[];
  // 서버가 붙여 준 답변 서명 (다음 요청에 되돌려 보낸다)
  sig?: string;
  feedback?: "up" | "down";
  // 오류·개인정보 등으로 거절된 질문은 다음 질문 때 서버로 다시 보내지 않는다.
  excluded?: boolean;
}

interface Props {
  message: UiMessage;
  onFeedback: (id: string, value: "up" | "down") => void;
}

export default function MessageBubble({ message, onFeedback }: Props) {
  const isUser = message.role === "user";
  const hasSources = !!message.sources && message.sources.length > 0;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed sm:max-w-[80%] ${
          isUser
            ? "bg-orange-500 text-white"
            : "border border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
        }`}
      >
        {!isUser && (
          <p className="mb-1 text-xs font-semibold text-orange-600 dark:text-orange-400">
            클라이밍 코치
          </p>
        )}
        <p className="whitespace-pre-wrap break-words">{message.content}</p>

        {/* 출처와 👍/👎는 자료 기반 답변(출처가 있는 응답)에만 보여 준다. */}
        {!isUser && hasSources && (
          <>
            <div className="mt-3 border-t border-zinc-200 pt-2 dark:border-zinc-700">
              <p className="mb-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                출처
              </p>
              <ul className="flex flex-col gap-1">
                {message.sources!.map((s, i) => (
                  <li key={s.id} className="text-sm">
                    <span className="mr-1 text-zinc-500">{i + 1}.</span>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-words text-orange-700 underline underline-offset-2 dark:text-orange-400"
                    >
                      {s.title}
                    </a>
                    <span className="ml-1 text-xs text-zinc-500">
                      ({s.publisher})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                도움이 됐나요?
              </span>
              {(["up", "down"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onFeedback(message.id, value)}
                  aria-label={value === "up" ? "도움이 됐어요" : "도움이 안 됐어요"}
                  aria-pressed={message.feedback === value}
                  className={`rounded-full border px-3 py-1 text-sm transition ${
                    message.feedback === value
                      ? "border-orange-500 bg-orange-100 dark:bg-orange-950"
                      : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  }`}
                >
                  {value === "up" ? "👍" : "👎"}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
