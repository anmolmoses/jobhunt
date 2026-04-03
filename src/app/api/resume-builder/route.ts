import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { createAIProvider } from "@/lib/ai/provider";

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

    // If fromResumeId is provided, parse the uploaded resume into structured data
    if (body.fromResumeId) {
      const resume = db
        .select()
        .from(schema.resumes)
        .where(eq(schema.resumes.id, body.fromResumeId))
        .get();

      if (resume?.parsedText) {
        try {
          const aiProvider = await createAIProvider();
          const response = await aiProvider.complete({
            messages: [
              {
                role: "system",
                content: `You are a resume parser. Given raw resume text, extract structured data as JSON with these fields:
{
  "contactInfo": { "name": "", "email": "", "phone": "", "linkedin": "", "github": "", "location": "", "website": "" },
  "summary": "professional summary text",
  "experience": [{ "company": "", "title": "", "location": "", "startDate": "", "endDate": "", "current": false, "description": "HTML with <ul><li> bullets" }],
  "education": [{ "school": "", "degree": "", "field": "", "startDate": "", "endDate": "", "description": "" }],
  "skills": [{ "category": "category name", "items": ["skill1", "skill2"] }],
  "projects": [{ "name": "", "url": "", "description": "HTML", "tech": ["tech1"] }],
  "certifications": [{ "name": "", "issuer": "", "date": "", "url": "" }]
}
Extract everything you can find. Use HTML bullet lists for experience descriptions. Return ONLY valid JSON.`
              },
              { role: "user", content: resume.parsedText.slice(0, 8000) },
            ],
            maxTokens: 4096,
            temperature: 0.1,
            responseFormat: "json",
          });

          let jsonStr = response.trim();
          if (jsonStr.startsWith("```")) {
            jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
          }
          const parsed = JSON.parse(jsonStr);

          contactInfo = parsed.contactInfo || contactInfo;
          summary = parsed.summary || summary;
          experience = parsed.experience || experience;
          education = parsed.education || education;
          skills = parsed.skills || skills;
          projects = parsed.projects || projects;
          certifications = parsed.certifications || certifications;
        } catch (e) {
          console.error("Failed to parse resume into structured data:", e);
          // Continue with empty build
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
