import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@appbeam/pipeline"],
  serverExternalPackages: ["@google/genai", "@modelcontextprotocol/sdk", "archiver"],
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
