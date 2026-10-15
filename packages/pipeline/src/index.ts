export { runPipeline, type RunPipelineOptions } from "./pipeline.js";
export { loadConfig, findRepoRoot, findTemplateDir, type PipelineConfig } from "./config.js";
export {
  extractCredentialOverrides,
  GEMINI_KEY_HEADER,
  VERCEL_TOKEN_HEADER,
  VERCEL_TEAM_HEADER,
} from "./credentials.js";
export { callGeminiModel, type GeminiCallOptions } from "./gemini.js";
export { runIntake } from "./intake.js";
export { runInference, extractCode, truncatePayload, SYSTEM_PROMPT } from "./inference.js";
export {
  runPatch,
  runPatchPipeline,
  PATCH_SYSTEM_PROMPT,
  type PatchPipelineOptions,
} from "./patch.js";
export { injectCode, resolveEntryFile } from "./inject.js";
export {
  walkFiles,
  zipFiles,
  zipDirectory,
  SKIP_DIRS,
  SKIP_FILES,
  type ArchiveFile,
} from "./archive.js";
export { deployToVercel, ensureProject, type DeployOptions, type DeployOutcome } from "./vercel.js";
export {
  PipelineError,
  type IntakeResult,
  type InferenceResult,
  type DeployResult,
  type PatchResult,
  type PatchPipelineResult,
  type PipelineEvent,
  type PipelineMode,
  type PipelineResult,
  type ReaMode,
  type StageEvent,
  type StageName,
  type StageRecord,
  type StageStatus,
} from "./types.js";
