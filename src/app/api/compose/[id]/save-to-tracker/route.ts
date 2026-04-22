import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { recordAction } from "@/lib/gamification";
import { triggerGoogleSheetsSync } from "@/lib/sheets/sync";

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const draft = db
      .select()
      .from(schema.composeDrafts)
      .where(eq(schema.composeDrafts.id, id))
      .get();

    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    if (draft.savedJobId) {
      const existing = db
        .select()
        .from(schema.savedJobs)
        .where(eq(schema.savedJobs.id, draft.savedJobId))
        .get();
      if (existing) {
        return NextResponse.json({ savedJobId: existing.id, alreadySaved: true });
      }
    }

    const title = draft.jobTitle?.trim();
    const company = draft.company?.trim();
    if (!title || !company) {
      return NextResponse.json(
        { error: "Draft is missing jobTitle or company — edit them first." },
        { status: 400 },
      );
    }

    let manualSearch = db
      .select()
      .from(schema.jobSearches)
      .where(eq(schema.jobSearches.query, "__manual__"))
      .get();

    if (!manualSearch) {
      manualSearch = db
        .insert(schema.jobSearches)
        .values({
          query: "__manual__",
          filters: "{}",
          providers: '["manual"]',
          totalResults: 0,
        })
        .returning()
        .get();
    }

    const dedupeKey = normalize(title) + "|" + normalize(company);
    const jobResult = db
      .insert(schema.jobResults)
      .values({
        searchId: manualSearch.id,
        externalId: `compose-${draft.id}`,
        provider: "manual",
        title,
        company,
        applyUrl: draft.sourceUrl || null,
        tags: "[]",
        dedupeKey,
      })
      .returning()
      .get();

    const notes = [
      draft.fitSummary ? `Fit: ${draft.fitSummary}` : null,
      draft.referralMessage ? `Referral msg:\n${draft.referralMessage}` : null,
      draft.recruiterMessage ? `Recruiter msg:\n${draft.recruiterMessage}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const savedJob = db
      .insert(schema.savedJobs)
      .values({
        jobResultId: jobResult.id,
        status: "saved",
        notes: notes || null,
      })
      .returning()
      .get();

    db.update(schema.composeDrafts)
      .set({ savedJobId: savedJob.id })
      .where(eq(schema.composeDrafts.id, id))
      .run();

    try { recordAction("save_job", { jobResultId: jobResult.id }); } catch { /* silent */ }
    try { triggerGoogleSheetsSync(); } catch { /* silent */ }

    return NextResponse.json({ savedJobId: savedJob.id, jobResultId: jobResult.id });
  } catch (error) {
    console.error("Save compose draft to tracker error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save to tracker" },
      { status: 500 },
    );
  }
}
