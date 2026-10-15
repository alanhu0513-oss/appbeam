"use client";

import { useEffect, useState } from "react";

import { getStoredCredentials, setStoredCredentials } from "@/lib/api";

const FIELD_CLASS =
  "w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-xs text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-accent-indigo/70";

export default function ApiConfig() {
  const [open, setOpen] = useState(false);
  const [geminiKey, setGeminiKey] = useState("");
  const [vercelToken, setVercelToken] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    const stored = getStoredCredentials();
    setGeminiKey(stored.geminiKey);
    setVercelToken(stored.vercelToken);
  }, []);

  const save = () => {
    setStoredCredentials({ geminiKey, vercelToken });
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1_600);
  };

  const clear = () => {
    setGeminiKey("");
    setVercelToken("");
    setStoredCredentials({ geminiKey: "", vercelToken: "" });
  };

  const configured =
    geminiKey.trim() !== "" && vercelToken.trim() !== ""
      ? "both"
      : geminiKey.trim() !== "" || vercelToken.trim() !== ""
        ? "partial"
        : "none";

  return (
    <div className="glass overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-white/[0.02]"
      >
        <span className="flex items-center gap-2.5">
          <span className="label">04 · api configuration</span>
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              configured === "both"
                ? "bg-emerald-400"
                : configured === "partial"
                  ? "bg-amber-400"
                  : "bg-slate-600"
            }`}
          />
        </span>
        <span
          className={`font-mono text-[10px] text-slate-600 transition ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {open ? (
        <div className="border-t border-white/5 px-5 pb-5 pt-4">
          <p className="mb-4 text-xs leading-relaxed text-slate-500">
            Bring your own credentials. Stored in this browser&apos;s
            localStorage only — sent as{" "}
            <span className="font-mono text-slate-400">x-gemini-key</span> /{" "}
            <span className="font-mono text-slate-400">x-vercel-token</span>{" "}
            headers with every request, never persisted server-side. Server{" "}
            <span className="font-mono text-slate-400">.env</span> values are
            used as fallback when a field is empty.
          </p>

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block font-mono text-[11px] text-slate-500">
                GEMINI_API_KEY
              </span>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="AIza…"
                className={FIELD_CLASS}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block font-mono text-[11px] text-slate-500">
                VERCEL_AUTH_TOKEN
              </span>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={vercelToken}
                onChange={(e) => setVercelToken(e.target.value)}
                placeholder="vercel_…"
                className={FIELD_CLASS}
              />
            </label>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={save} className="primary-btn !px-4 !py-2 !text-xs">
              {savedFlash ? "saved ✓" : "save keys"}
            </button>
            <button type="button" onClick={clear} className="ghost-btn">
              clear
            </button>
            <span className="ml-auto font-mono text-[10px] text-slate-600">
              keys never leave this browser except as request headers
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
