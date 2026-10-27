import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the Docker image small.
  output: "standalone",
  // The viewer package ships plain ES modules from the monorepo.
  transpilePackages: ["@aoe2-replays/viewer"],
};

export default nextConfig;
