import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

// PUT — update expected salary for a saved job
export async function PUT(request: NextRequest) {
  try {
    const { savedJobId, expectedSalary, expectedSalaryNotes } = await request.json();

    if (!savedJobId) {
      return NextResponse.json({ error: "savedJobId is required" }, { status: 400 });
    }

    db.update(schema.savedJobs)
      .set({
        expectedSalary: expectedSalary ?? null,
        expectedSalaryNotes: expectedSalaryNotes ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.savedJobs.id, savedJobId))
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Expected salary PUT error:", error);
    return NextResponse.json({ error: "Failed to update expected salary" }, { status: 500 });
  }
}
