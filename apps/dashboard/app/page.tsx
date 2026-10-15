"use client";

import { useEffect, useState } from "react";

import ApiConfig from "@/components/ApiConfig";
import Dropzone, { type SubmitPayload } from "@/components/Dropzone";
import ExportButton from "@/components/ExportButton";
import PatchChat from "@/components/PatchChat";
import PhoneFrame from "@/components/PhoneFrame";
import StageTimeline from "@/components/StageTimeline";
import { CREDENTIALS_EVENT, credentialHeaders, sessionHeader } from "@/lib/api";
import type { PipelineEvent, PipelineResult } from "@appbeam/pipeline/types";

interface ConfigInfo {
  mode: string;
  reaMode: string;
  model: string;
  projectName: string;
  hasGeminiKey: boolean;
  hasVercelToken: boolean;
  staging: boolean;
}

type ServerEvent =
  | { type: "event"; event: PipelineEvent }
  | { type: "done"; result: PipelineResult }
  | { type: "error"; message: string };

function ConfigCard({ config }: { config: ConfigInfo | null }) {
  const rows: Array<[string, boolean | string]> = config
    ? [
        ["GEMINI_API_KEY", config.hasGeminiKey],
        ["VERCEL_TOKEN", config.hasVercelToken],
        ["REA mode", config.reaMode],
        ["model", config.model],
        ["mode", config.mode],
      ]
    : [
        ["GEMINI_API_KEY", "…"],
        ["VERCEL_TOKEN", "…"],
        ["REA mode", "…"],
        ["model", "…"],
        ["mode", "…"],
      ];

  return (
    <div className="glass p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="label">03 · config</span>
        <a
          href="https://github.com/morluto/rea"
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[10px] text-slate-600 transition hover:text-slate-400"
        >
          morluto/rea ↗
        </a>
      </div>
      <ul className="space-y-1.5">
        {rows.map(([key, value]) => (
          <li key={key} className="flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] text-slate-500">{key}</span>
            {typeof value === "boolean" ? (
              <span
                className={`flex items-center gap-1.5 font-mono text-[11px] ${
                  value ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    value ? "bg-emerald-400" : "bg-amber-400 animate-pulse-dot"
                  }`}
                />
                {value ? "set" : "missing — mock"}
              </span>
            ) : (
              <span className="font-mono text-[11px] text-slate-400">{value}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Home() {
  const [config, setConfig] = useState<ConfigInfo | null>(null);
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [appCode, setAppCode] = useState<string | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  useEffect(() => {
    const loadConfigInfo = () => {
      fetch("/api/simulate", { headers: credentialHeaders() })
        .then((r) => r.json())
        .then((data: ConfigInfo) => setConfig(data))
        .catch(() => setConfig(null));
    };
    loadConfigInfo();
    window.addEventListener(CREDENTIALS_EVENT, loadConfigInfo);
    return () => window.removeEventListener(CREDENTIALS_EVENT, loadConfigInfo);
  }, []);

  const submit = async ({ file, url }: SubmitPayload) => {
    setBusy(true);
    setEvents([]);
    setResult(null);
    setError(null);
    setLiveUrl(null);
    setAppCode(null);

    const form = new FormData();
    if (file) form.append("file", file);
    if (url) form.append("url", url);

    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        body: form,
        headers: { ...credentialHeaders(), ...sessionHeader() },
      });
      if (!res.ok || !res.body) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? `Upload failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handle = (payload: ServerEvent) => {
        if (payload.type === "event") {
          setEvents((prev) => [...prev, payload.event]);
        } else if (payload.type === "done") {
          setResult(payload.result);
          setLiveUrl(payload.result.url || null);
          setAppCode(payload.result.inference.code);
        } else if (payload.type === "error") {
          setError(payload.message);
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;
          handle(JSON.parse(line.slice(5)) as ServerEvent);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onPatchApplied = ({
    code,
    url,
  }: {
    code: string;
    url: string | null;
  }) => {
    setAppCode(code);
    if (url) {
      setLiveUrl(url);
      setRefreshSignal((n) => n + 1);
    }
  };

  const liveLabel = result
    ? result.effectiveMode === "real"
      ? `live · ${result.projectName} · ${result.deploymentId.slice(0, 12)}`
      : "mock mode · add vercel token to deploy"
    : busy
      ? "pipeline running"
      : "ready for a target";

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] grid-bg" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[720px] -translate-x-1/2 rounded-full bg-accent-indigo/15 blur-[120px]" />

      <header className="sticky top-0 z-40 border-b border-white/5 bg-ink/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-indigo to-accent-fuchsia text-sm font-black text-white shadow-glow">
              A
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-white">
                appbeam
              </p>
              <p className="font-mono text-[10px] text-slate-500">
                binary → rea → gemini → vercel
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ExportButton />
            <div className="hidden items-center gap-2 sm:flex">
              <span className="label rounded-full border border-white/10 px-2.5 py-1">
                open source
              </span>
              <span className="label rounded-full border border-white/10 px-2.5 py-1">
                mcp · platforms api
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-10">
        <div className="mb-10 max-w-2xl">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
            Upload an app. <span className="gradient-text">Watch it come alive.</span>
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-400">
            REA reverse-engineers the logic, Gemini Pro rewrites it as Expo
            React Native Web components, and the pipeline deploys the mutated
            template straight to Vercel — live inside the phone below.
          </p>
        </div>

        {error ? (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <span className="font-mono text-xs">pipeline error — </span>
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="flex flex-col gap-6">
            <Dropzone onSubmit={submit} busy={busy} />
            <StageTimeline events={events} />
            <ConfigCard config={config} />
            <ApiConfig />
          </div>

          <div className="flex flex-col gap-6">
            <PhoneFrame
              url={liveUrl}
              loading={busy}
              liveLabel={liveLabel}
              refreshSignal={refreshSignal}
            />
            <PatchChat appCode={appCode} onApplied={onPatchApplied} />

            {result ? (
              <div className="glass mt-6 p-5">
                <span className="label">run summary</span>
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[11px] text-slate-400">
                  <span>entry</span>
                  <span className="text-right text-slate-200">{result.entryFile}</span>
                  <span>model</span>
                  <span className="text-right text-slate-200">{result.inference.model}</span>
                  <span>evidence</span>
                  <span className="text-right text-slate-200">
                    {result.intake.bytes.toLocaleString()} B
                  </span>
                  <span>generated</span>
                  <span className="text-right text-slate-200">
                    {result.inference.codeBytes.toLocaleString()} B
                  </span>
                  <span>duration</span>
                  <span className="text-right text-slate-200">
                    {(result.durationMs / 1000).toFixed(1)}s
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </main>

      <footer className="border-t border-white/5 px-6 py-8">
        <p className="mx-auto max-w-6xl font-mono text-[10px] text-slate-600">
          appbeam · mit licensed · rea by morluto · gemini by google · deploy on vercel
        </p>
      </footer>
    </div>
  );
}
