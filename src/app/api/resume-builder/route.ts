import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc } from "drizzle-orm";

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

    const build = db
      .insert(schema.resumeBuilds)
      .values({
        name: body.name || "Untitled Resume",
        contactInfo: JSON.stringify(body.contactInfo || {}),
        summary: body.summary || "",
        experience: JSON.stringify(body.experience || []),
        education: JSON.stringify(body.education || []),
        skills: JSON.stringify(body.skills || []),
        projects: JSON.stringify(body.projects || []),
        certifications: JSON.stringify(body.certifications || []),
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
