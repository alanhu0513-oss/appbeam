export type PipelineMode = "auto" | "real" | "mock";
export type ReaMode = "cli" | "mcp" | "mock";

export type StageName = "intake" | "inference" | "injection" | "deployment";

export type StageStatus = "running" | "done" | "warning" | "error";

export interface StageEvent {
  stage: StageName;
  status: StageStatus;
  message: string;
  /** Epoch millis. */
  at: number;
  durationMs?: number;
}

/** What event listeners (dashboard SSE stream) receive. */
export type PipelineEvent = StageEvent;

export interface StageRecord extends StageEvent {
  durationMs: number;
}

export interface PipelineResult {
  /** Live Vercel production URL the dashboard iframe should load. */
  url: string;
  deploymentId: string;
  projectName: string;
  entryFile: string;
  mode: PipelineMode;
  /** Deployment mode: "mock" means the Vercel step was faked locally. */
  effectiveMode: Exclude<PipelineMode, "auto">;
  intake: {
    source: "rea-cli" | "rea-mcp" | "mock";
    bytes: number;
    durationMs: number;
  };
  inference: {
    model: string;
    codeBytes: number;
    durationMs: number;
    /** Full generated App.tsx source — feeds the patch chat loop. */
    code: string;
  };
  stages: StageRecord[];
  durationMs: number;
}

export interface IntakeResult {
  source: "rea-cli" | "rea-mcp" | "mock";
  payload: string;
  durationMs: number;
}

export interface InferenceResult {
  code: string;
  raw: string;
  model: string;
  durationMs: number;
}

export interface DeployResult {
  url: string;
  deploymentId: string;
  projectName: string;
}

/** One patch inference pass: the complete updated source file. */
export interface PatchResult {
  code: string;
  model: string;
  durationMs: number;
}

/** Outcome of the prompt-to-patch loop (inference + inject + redeploy). */
export interface PatchPipelineResult extends PatchResult {
  /** True when a Vercel deployment actually ran (false = local mock deploy). */
  deployed: boolean;
  url: string;
  deploymentId: string;
  projectName: string;
  entryFile: string;
}

export class PipelineError extends Error {
  constructor(
    message: string,
    readonly stage: StageName,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PipelineError";
  }
}
