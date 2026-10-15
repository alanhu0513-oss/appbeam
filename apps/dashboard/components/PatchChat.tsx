"use client";

import { useEffect, useRef, useState } from "react";

import { credentialHeaders } from "@/lib/api";
import type { PatchPipelineResult } from "@appbeam/pipeline/types";

interface ChatMessage {
  id: number;
  role: "user" | "assistant" | "error";
  text: string;
}

const INPUT_CLASS =
  "min-w-0 flex-1 resize-none rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-xs leading-relaxed text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-accent-indigo/70";

function assistantSummary(data: PatchPipelineResult): string {
  const mode = data.model === "mock" ? "mock patch" : data.model;
  if (data.deployed) {
    return `patch applied · ${mode} · redeployed → ${data.url}`;
  }
  return `patch applied · ${mode} · local only — mock deploy (add a Vercel token or x-vercel-token to go live)`;
}

export default function PatchChat({
  appCode,
  onApplied,
}: {
  /** Latest generated source; omitted = backend patches the template's entry file. */
  appCode: string | null;
  onApplied: (update: { code: string; url: string | null }) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const nextId = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  const push = (role: ChatMessage["role"], text: string) => {
    setMessages((prev) => [...prev, { id: nextId.current++, role, text }]);
  };

  const send = async () => {
    const request = draft.trim();
    if (!request || pending) return;
    setDraft("");
    push("user", request);
    setPending(true);

    try {
      const res = await fetch("/api/patch-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...credentialHeaders(),
        },
        body: JSON.stringify({
          request,
          ...(appCode ? { code: appCode } : {}),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | (PatchPipelineResult & { error?: string })
        | null;
      if (!res.ok || !data || "error" in (data ?? {})) {
        throw new Error(
          data && "error" in data && data.error
            ? data.error
            : `patch failed (${res.status})`,
        );
      }
      push("assistant", assistantSummary(data));
      onApplied({
        code: data.code,
        url: data.deployed && data.url ? data.url : null,
      });
    } catch (err) {
      push("error", err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="glass flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <span className="label">05 · patch terminal</span>
        <span className="font-mono text-[10px] text-slate-600">
          POST /api/patch-code
        </span>
      </div>

      <div
        ref={scrollRef}
        className="flex max-h-[280px] min-h-[120px] flex-col gap-2 overflow-y-auto border-t border-white/5 px-5 py-4"
      >
        {messages.length === 0 ? (
          <p className="py-6 text-center font-mono text-[11px] leading-relaxed text-slate-600">
            iterative vibecoding loop
            <br />
            <span className="text-slate-500">
              {appCode
                ? 'try: "make the theme dark mode"'
                : "run the pipeline first, or patch the blank canvas"}
            </span>
          </p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={
                msg.role === "user"
                  ? "self-end max-w-[92%] rounded-xl rounded-br-sm bg-accent-indigo/20 px-3 py-2"
                  : msg.role === "error"
                    ? "self-start max-w-[92%] rounded-xl rounded-bl-sm border border-red-500/30 bg-red-500/10 px-3 py-2"
                    : "self-start max-w-[92%] rounded-xl rounded-bl-sm bg-white/[0.05] px-3 py-2"
              }
            >
              <p
                className={`break-words font-mono text-[11px] leading-relaxed ${
                  msg.role === "user"
                    ? "text-slate-100"
                    : msg.role === "error"
                      ? "text-red-300"
                      : "text-slate-300"
                }`}
              >
                {msg.text}
              </p>
            </div>
          ))
        )}
        {pending ? (
          <div className="flex items-center gap-2 self-start px-1 py-1">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent-indigo/40 border-t-accent-indigo" />
            <span className="font-mono text-[10px] text-slate-500">
              patching &amp; redeploying…
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex items-end gap-2 border-t border-white/5 px-5 py-4">
        <textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder='make the theme dark mode…'
          className={INPUT_CLASS}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={pending || draft.trim() === ""}
          className="primary-btn shrink-0 !px-3.5 !py-2.5 !text-xs"
          title="Send the modification request (Enter)"
        >
          {pending ? "…" : "patch →"}
        </button>
      </div>
    </div>
  );
}
