import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Allow Next to pull files from ../src (outside the lab/ directory)
  outputFileTracingRoot: path.join(__dirname, ".."),
  serverExternalPackages: [
    "better-sqlite3",
    "pdf-parse",
    "ts-jobspy",
    "puppeteer",
    "node-cron",
  ],
  // Type errors from the main app's code shouldn't block the lab build.
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    resolveAlias: {
      "@": path.join(__dirname, "..", "src"),
      "@app": path.join(__dirname, "..", "src"),
      "@lab": path.join(__dirname, "src"),
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@": path.join(__dirname, "..", "src"),
      "@app": path.join(__dirname, "..", "src"),
      "@lab": path.join(__dirname, "src"),
    };
    return config;
  },
};

export default nextConfig;
