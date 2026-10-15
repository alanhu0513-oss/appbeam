import { loadConfig, type PipelineConfig } from "./config.js";
import { runIntake } from "./intake.js";
import { runInference } from "./inference.js";
import { injectCode } from "./inject.js";
import { deployToVercel } from "./vercel.js";
import {
  PipelineError,
  type PipelineEvent,
  type PipelineResult,
  type StageName,
  type StageRecord,
} from "./types.js";

export interface RunPipelineOptions {
  /** Binary path or URL handed to REA. */
  target: string;
  onEvent?: (event: PipelineEvent) => void;
  config?: Partial<PipelineConfig>;
}

/**
 * Deploy for real whenever we have a token and mock mode is off; inference
 * and intake each fall back independently based on their own requirements.
 */
function deployEnabled(cfg: PipelineConfig): boolean {
  return cfg.mode !== "mock" && cfg.vercelToken !== null;
}

/**
 * The Appbeam orchestration flow:
 *
 *   intake (REA) → inference (Gemini) → injection (simulator template) → deploy (Vercel)
 *
 * Emits one `PipelineEvent` per stage transition so the dashboard can render
 * live progress, and resolves with the production URL for the device iframe.
 */
export async function runPipeline(
  options: RunPipelineOptions,
): Promise<PipelineResult> {
  const startedAt = Date.now();
  const config = loadConfig(options.config);
  const emit = options.onEvent ?? (() => undefined);
  const stages: StageRecord[] = [];
  const effective = deployEnabled(config) ? "real" : "mock";

  const runStage = async <T>(
    stage: StageName,
    work: () => Promise<T>,
  ): Promise<T> => {
    const stageStarted = Date.now();
    emit({ stage, status: "running", message: `${stage} started`, at: stageStarted });
    try {
      const value = await work();
      const at = Date.now();
      const record: StageRecord = {
        stage,
        status: "done",
        message: `${stage} completed`,
        at,
        durationMs: at - stageStarted,
      };
      stages.push(record);
      emit(record);
      return value;
    } catch (err) {
      const at = Date.now();
      const record: StageRecord = {
        stage,
        status: "error",
        message: err instanceof Error ? err.message : String(err),
        at,
        durationMs: at - stageStarted,
      };
      stages.push(record);
      emit(record);
      throw new PipelineError(record.message, stage, err);
    }
  };

  emit({
    stage: "intake",
    status: "running",
    message: `pipeline started in ${effective} mode`,
    at: startedAt,
  });

  // ── 1. Intake ────────────────────────────────────────────────────────────
  const intake = await runStage("intake", () =>
    runIntake(options.target, config),
  );
  if (
    intake.source === "mock" &&
    config.mode !== "mock" &&
    config.reaMode !== "mock"
  ) {
    emit({
      stage: "intake",
      status: "warning",
      message: "REA unavailable — using fixture evidence payload",
      at: Date.now(),
      durationMs: 0,
    });
  }

  // ── 2. Inference ─────────────────────────────────────────────────────────
  const inference = await runStage("inference", () =>
    runInference(intake.payload, config),
  );

  // ── 3. Code injection ────────────────────────────────────────────────────
  const injection = await runStage("injection", () =>
    injectCode(inference.code, config),
  );

  // ── 4. Vercel deployment ─────────────────────────────────────────────────
  try {
    if (effective === "mock") {
      const at = Date.now();
      emit({
        stage: "deployment",
        status: "running",
        message: "mock mode — skipping Vercel deploy",
        at,
      });
      const record: StageRecord = {
        stage: "deployment",
        status: "done",
        message: "mock deployment (set VERCEL_TOKEN to deploy for real)",
        at,
        durationMs: Date.now() - at,
      };
      stages.push(record);
      emit(record);
      return {
        url: "",
        deploymentId: "mock",
        projectName: config.vercelProjectName,
        entryFile: injection.entryFile,
        mode: config.mode,
        effectiveMode: "mock",
        intake: {
          source: intake.source,
          bytes: Buffer.byteLength(intake.payload, "utf8"),
          durationMs: intake.durationMs,
        },
        inference: {
          model: inference.model,
          codeBytes: inference.code.length,
          durationMs: inference.durationMs,
          code: inference.code,
        },
        stages,
        durationMs: Date.now() - startedAt,
      };
    }

    const deployment = await runStage("deployment", async () => {
      if (!config.vercelToken) {
        throw new Error("VERCEL_TOKEN is not set");
      }
      return deployToVercel({
        sourceDir: injection.sourceDir,
        projectName: config.vercelProjectName,
        token: config.vercelToken,
        teamId: config.vercelTeamId,
        timeoutMs: config.vercelDeployTimeoutMs,
        onLog: (message) =>
          emit({
            stage: "deployment",
            status: "running",
            message,
            at: Date.now(),
          }),
      });
    });

    return {
      url: deployment.url,
      deploymentId: deployment.deploymentId,
      projectName: deployment.projectName,
      entryFile: injection.entryFile,
      mode: config.mode,
      effectiveMode: "real",
      intake: {
        source: intake.source,
        bytes: Buffer.byteLength(intake.payload, "utf8"),
        durationMs: intake.durationMs,
      },
      inference: {
        model: inference.model,
        codeBytes: inference.code.length,
        durationMs: inference.durationMs,
        code: inference.code,
      },
      stages,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await injection.cleanup();
  }
}

