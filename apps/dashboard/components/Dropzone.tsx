"use client";

import { useRef, useState } from "react";

export interface SubmitPayload {
  file?: File;
  url?: string;
}

const HINTS = "apk · ipa · exe · elf · dylib · wasm · js · electron · website url";

export default function Dropzone({
  onSubmit,
  busy,
}: {
  onSubmit: (payload: SubmitPayload) => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");

  const pick = (next: File | null) => {
    if (next) {
      setFile(next);
      setUrl("");
    }
  };

  const submit = () => {
    if (busy) return;
    if (file) onSubmit({ file });
    else if (url.trim()) onSubmit({ url: url.trim() });
  };

  return (
    <div className="glass p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="label">01 · drop a target</span>
        <span className="font-mono text-[10px] text-slate-600">{HINTS}</span>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files[0] ?? null);
        }}
        className={`group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
          dragging
            ? "border-accent-violet bg-accent-violet/10"
            : "border-white/15 hover:border-accent-indigo/60 hover:bg-white/[0.02]"
        }`}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-indigo to-accent-fuchsia shadow-glow">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 16V4m0 0 4 4m-4-4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
          </svg>
        </div>

        {file ? (
          <div className="max-w-full">
            <p className="truncate font-mono text-sm text-white">{file.name}</p>
            <p className="mt-1 text-xs text-slate-500">
              {(file.size / 1024 / 1024).toFixed(2)} MB · ready to reverse-engineer
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-slate-200">
              Drag a binary here, or <span className="gradient-text">browse</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Handed to <span className="font-mono text-slate-400">morluto/rea</span> for analysis
            </p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="label whitespace-nowrap">or a url</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <div className="mt-3 flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (e.target.value) setFile(null);
          }}
          placeholder="https://apps.apple.com/…"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 font-mono text-xs text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-accent-indigo/70"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || (!file && !url.trim())}
          className="primary-btn shrink-0"
        >
          {busy ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              beaming…
            </>
          ) : (
            <>Beam it live →</>
          )}
        </button>
      </div>
    </div>
  );
}
