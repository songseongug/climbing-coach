"use client";

import { useState } from "react";
import { PRIVACY_NOTICE } from "@/lib/messages";

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
}

// 입력창과 개인정보 안내. 안내 문구는 항상 보인다.
export default function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState("");

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <div className="border-t border-zinc-200 bg-white px-4 pb-4 pt-3 dark:border-zinc-800 dark:bg-black">
      <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">
        ⚠ {PRIVACY_NOTICE}
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="질문을 입력하세요"
          aria-label="질문 입력"
          className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={disabled || text.trim().length === 0}
          className="shrink-0 rounded-xl bg-orange-500 px-5 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          전송
        </button>
      </form>
    </div>
  );
}
