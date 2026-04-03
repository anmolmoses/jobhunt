import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { generateResumeHTML } from "@/lib/resume/pdf-generator";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Use live data from the request body (not saved data) for real-time preview
    const html = generateResumeHTML({
      contactInfo: body.contactInfo || {},
      summary: body.summary || "",
      experience: body.experience || [],
      education: body.education || [],
      skills: body.skills || [],
      projects: body.projects || [],
      certifications: body.certifications || [],
      customSections: body.customSections || [],
    });

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    console.error("Preview error:", error);
    return NextResponse.json({ error: "Preview generation failed" }, { status: 500 });
  }
}
