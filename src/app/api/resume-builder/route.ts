import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { structureResume } from "@/lib/resume/structurer";

export async function GET() {
  try {
    const builds = db
      .select()
      .from(schema.resumeBuilds)
      .orderBy(desc(schema.resumeBuilds.updatedAt))
      .all();

    return NextResponse.json(
      builds.map((b) => ({
        ...b,
        contactInfo: JSON.parse(b.contactInfo),
        experience: JSON.parse(b.experience),
        education: JSON.parse(b.education),
        skills: JSON.parse(b.skills),
        projects: JSON.parse(b.projects),
        certifications: JSON.parse(b.certifications),
        customSections: JSON.parse(b.customSections),
      }))
    );
  } catch (error) {
    console.error("Get resume builds error:", error);
    return NextResponse.json({ error: "Failed to get resumes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    let contactInfo = body.contactInfo || {};
    let summary = body.summary || "";
    let experience = body.experience || [];
    let education = body.education || [];
    let skills = body.skills || [];
    let projects = body.projects || [];
    let certifications = body.certifications || [];

    // If fromResumeId is provided, use the pre-stored structured data
    if (body.fromResumeId) {
      const resume = db
        .select()
        .from(schema.resumes)
        .where(eq(schema.resumes.id, body.fromResumeId))
        .get();

      if (resume) {
        let parsed = null;

        // Prefer pre-stored structured data (instant)
        if (resume.structuredData) {
          try {
            parsed = JSON.parse(resume.structuredData);
          } catch { /* fall through to AI parsing */ }
        }

        // Fallback: structure on the fly for resumes uploaded before this feature
        if (!parsed && resume.parsedText) {
          try {
            parsed = await structureResume(resume.parsedText);
            // Backfill the structured data so next time it's instant
            db.update(schema.resumes)
              .set({ structuredData: JSON.stringify(parsed) })
              .where(eq(schema.resumes.id, resume.id))
              .run();
          } catch (e) {
            console.error("Failed to structure resume:", e);
          }
        }

        if (parsed) {
          contactInfo = parsed.contactInfo || contactInfo;
          summary = parsed.summary || summary;
          experience = parsed.experience || experience;
          education = parsed.education || education;
          skills = parsed.skills || skills;
          projects = parsed.projects || projects;
          certifications = parsed.certifications || certifications;
        }
      }
    }

    const build = db
      .insert(schema.resumeBuilds)
      .values({
        name: body.name || "Untitled Resume",
        contactInfo: JSON.stringify(contactInfo),
        summary,
        experience: JSON.stringify(experience),
        education: JSON.stringify(education),
        skills: JSON.stringify(skills),
        projects: JSON.stringify(projects),
        certifications: JSON.stringify(certifications),
        customSections: JSON.stringify(body.customSections || []),
      })
      .returning()
      .get();

    return NextResponse.json(build, { status: 201 });
  } catch (error) {
    console.error("Create resume build error:", error);
    return NextResponse.json({ error: "Failed to create resume" }, { status: 500 });
  }
}
