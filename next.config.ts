import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "ts-jobspy", "puppeteer", "node-cron"],
};

export default nextConfig;
