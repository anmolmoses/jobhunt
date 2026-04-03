import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    const history = db
      .select()
      .from(schema.cronRunHistory)
      .orderBy(desc(schema.cronRunHistory.createdAt))
      .limit(20)
      .all();

    return NextResponse.json(history);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get cron history" },
      { status: 500 }
    );
  }
}
