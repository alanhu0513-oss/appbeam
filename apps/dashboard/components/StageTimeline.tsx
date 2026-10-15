"use client";

import type { PipelineEvent, StageName, StageStatus } from "@appbeam/pipeline/types";

const STAGES: Array<{ id: StageName; label: string; detail: string }> = [
  { id: "intake", label: "Reverse-engineer", detail: "morluto/rea" },
  { id: "inference", label: "Reimagine", detail: "gemini pro" },
  { id: "injection", label: "Inject", detail: "simulator template" },
  { id: "deployment", label: "Deploy", detail: "vercel platforms api" },
];

function stageState(
  events: PipelineEvent[],
  stage: StageName,
): { status: StageStatus | "pending"; message: string | null; ms: number | null } {
  const forStage = events.filter((e) => e.stage === stage);
  const last = forStage[forStage.length - 1];
  if (!last) return { status: "pending", message: null, ms: null };
  return {
    status: last.status,
    message: last.message,
    ms: last.durationMs ?? null,
  };
}

function StatusDot({ status }: { status: StageStatus | "pending" }) {
  if (status === "running") {
    return (
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-indigo/40 border-t-accent-indigo" />
    );
  }
  if (status === "done") {
    return (
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500/15 text-[9px] font-bold text-emerald-400">
        ✓
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500/15 text-[9px] font-bold text-red-400">
        ✗
      </span>
    );
  }
  if (status === "warning") {
    return (
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500/15 text-[9px] font-bold text-amber-400">
        !
      </span>
    );
  }
  return <span className="h-3.5 w-3.5 rounded-full border border-white/15" />;
}

export default function StageTimeline({ events }: { events: PipelineEvent[] }) {
  return (
    <div className="glass p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="label">02 · pipeline</span>
        <span className="font-mono text-[10px] text-slate-600">
          {events.length} events
        </span>
      </div>

      <ol className="space-y-1">
        {STAGES.map((stage, index) => {
          const { status, message, ms } = stageState(events, stage.id);
          return (
            <li key={stage.id}>
              <div
                className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition ${
                  status === "pending" ? "opacity-45" : "bg-white/[0.02]"
                }`}
              >
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
                  <StatusDot status={status} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-slate-200">
                      {index + 1}. {stage.label}{" "}
                      <span className="font-mono text-[10px] text-slate-600">
                        {stage.detail}
                      </span>
                    </p>
                    {ms !== null ? (
                      <span className="shrink-0 font-mono text-[10px] text-slate-600">
                        {(ms / 1000).toFixed(1)}s
                      </span>
                    ) : null}
                  </div>
                  {message ? (
                    <p className="mt-0.5 break-words font-mono text-[11px] leading-relaxed text-slate-500">
                      {message}
                    </p>
                  ) : null}
                </div>
              </div>
              {index < STAGES.length - 1 ? (
                <div className="ml-[18px] h-3 w-px bg-white/10" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
