import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "jobhunt.db");

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function createDb() {
  // Retry loop to handle SQLITE_BUSY during concurrent build workers
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const sqlite = new Database(DB_PATH);
      sqlite.pragma("journal_mode = WAL");
      sqlite.pragma("busy_timeout = 10000");
      sqlite.pragma("foreign_keys = ON");
      return drizzle(sqlite, { schema });
    } catch (e: unknown) {
      if (e && typeof e === "object" && "code" in e && e.code === "SQLITE_BUSY" && attempt < 4) {
        // Wait and retry
        const delay = 500 * (attempt + 1);
        const start = Date.now();
        while (Date.now() - start < delay) { /* busy wait */ }
        continue;
      }
      throw e;
    }
  }
  throw new Error("Failed to open database after retries");
}

export const db = createDb();
export { schema };
