import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "linkedin-jobs-api", "ts-jobspy", "puppeteer", "node-cron"],
};

export default nextConfig;
