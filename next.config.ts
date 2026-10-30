import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // AGENTS.md is the agent guide for this repo; stop next dev from appending its own block.
  agentRules: false,
};

export default nextConfig;
