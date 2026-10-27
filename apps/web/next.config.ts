import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output keeps the Docker image small.
  output: "standalone",
  // The viewer package ships plain ES modules from the monorepo.
  transpilePackages: ["@aoe2-replays/viewer"],
  // Our images are pre-sized WebP files; skipping the optimizer avoids depending on sharp in the container.
  images: { unoptimized: true },
};

export default nextConfig;
