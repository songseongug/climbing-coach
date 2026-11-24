"use client";

import { useEffect, useRef, useState } from "react";
import ChatInput from "./components/ChatInput";
import MessageBubble, { type UiMessage } from "./components/MessageBubble";
import SuggestedQuestions from "./components/SuggestedQuestions";
import { FIXED_MESSAGES } from "@/lib/messages";
import type { ChatResponse, ChatStatus } from "@/lib/schema";

// 서버로 보낼 대화는 직전 5턴(질문+답변 10개)까지만. 대화는 이 화면 안에만 있고 저장하지 않는다.
const MAX_HISTORY_MESSAGES = 10;

// 거절·오류 응답이면 그 질문은 다음 질문 때 서버로 다시 보내지 않는다.
const REJECTED_STATUSES: ChatStatus[] = [
  "has_personal_info",
  "bad_language",
  "rate_limited",
  "error",
];

function newId(): string {
  return crypto.randomUUID();
}

export default function Home() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 새 답이 오면 맨 아래로 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(question: string) {
    if (loading) return;

    const userMessage: UiMessage = { id: newId(), role: "user", content: question };
    const history = messages
      .filter((m) => !m.excluded)
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content, sig: m.sig }));

    // 직전 답변의 상태. 되묻기를 두 번 연속 하지 않도록 서버에 알려 준다.
    const previousStatus = messages[messages.length - 1]?.status;

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    let result: ChatResponse;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...history, { role: "user", content: question }],
          previousStatus,
        }),
      });
      result = (await res.json()) as ChatResponse;
    } catch {
      result = { status: "error", answer: FIXED_MESSAGES.error, sources: [] };
    }

    const rejected = REJECTED_STATUSES.includes(result.status);
    setMessages((prev) => {
      // 개인정보가 의심되면 화면에서도 입력 내용을 가린다.
      const next = prev.map((m) =>
        m.id === userMessage.id
          ? {
              ...m,
              content:
                result.status === "has_personal_info"
                  ? "(개인정보가 의심되어 입력 내용을 가렸어요)"
                  : m.content,
              excluded: rejected,
            }
          : m,
      );
      return [
        ...next,
        {
          id: newId(),
          role: "assistant" as const,
          content: result.answer,
          status: result.status,
          sources: result.sources,
          sig: result.sig,
          excluded: rejected,
        },
      ];
    });
    setLoading(false);
  }

  function setFeedback(id: string, value: "up" | "down") {
    // 저장하지 않고 이 화면에서만 표시한다.
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, feedback: m.feedback === value ? undefined : value } : m,
      ),
    );
  }

  async function copyConversation() {
    const text = messages
      .filter((m) => !(m.role === "user" && m.content.startsWith("(개인정보")))
      .map((m) => {
        const who = m.role === "user" ? "나" : "클라이밍 코치";
        const src =
          m.sources && m.sources.length > 0
            ? "\n출처: " + m.sources.map((s) => `${s.title} (${s.url})`).join(", ")
            : "";
        return `[${who}] ${m.content}${src}`;
      })
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 복사 권한이 없는 환경에서는 조용히 넘어간다.
    }
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-2xl flex-col">
      {/* ① 머리글 */}
      <header className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-bold">🧗 클라이밍 코치</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            클라이밍 기기·앱 궁금증, 여기서 물어보세요
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={copyConversation}
            className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {copied ? "복사했어요" : "대화 복사"}
          </button>
        )}
      </header>

      {/* ②③④⑤ 추천 질문 / 대화 영역 */}
      <main
        className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
        role="log"
        aria-live="polite"
        aria-label="대화 내용"
      >
        {messages.length === 0 && (
          <SuggestedQuestions onSelect={send} disabled={loading} />
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} onFeedback={setFeedback} />
        ))}
        {loading && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400" role="status">
            답변을 준비 중이에요…
          </p>
        )}
        <div ref={bottomRef} />
      </main>

      {/* ⑥⑦ 개인정보 안내 + 입력창 */}
      <ChatInput onSend={send} disabled={loading} />
    </div>
  );
}
