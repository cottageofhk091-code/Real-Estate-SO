import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel 上で誤って data/ をトレース・同梱しない
  outputFileTracingExcludes: {
    "*": ["./data/**", "data/**"],
  },
};

export default nextConfig;
