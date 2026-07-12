import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  outputFileTracingRoot: path.join(import.meta.dirname!, ".."),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
