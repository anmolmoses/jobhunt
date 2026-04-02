import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { generateResumePDF } from "@/lib/resume/pdf-generator";
import fs from "fs";
import path from "path";
import { parseIdParam } from "@/lib/utils";

// Generate PDF from a resume build
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idNum = parseIdParam(id);
    if (!idNum) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const build = db
      .select()
      .from(schema.resumeBuilds)
      .where(eq(schema.resumeBuilds.id, idNum))
      .get();

    if (!build) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data = {
      contactInfo: JSON.parse(build.contactInfo),
      summary: build.summary || "",
      experience: JSON.parse(build.experience),
      education: JSON.parse(build.education),
      skills: JSON.parse(build.skills),
      projects: JSON.parse(build.projects),
      certifications: JSON.parse(build.certifications),
      customSections: JSON.parse(build.customSections),
    };

    const fileName = await generateResumePDF(data, build.id);

    // Save PDF path to DB
    db.update(schema.resumeBuilds)
      .set({ pdfPath: fileName, updatedAt: new Date().toISOString() })
      .where(eq(schema.resumeBuilds.id, build.id))
      .run();

    return NextResponse.json({
      success: true,
      fileName,
      downloadUrl: `/api/resume-builder/${build.id}/pdf`,
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}

// Download the generated PDF
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idNum = parseIdParam(id);
    if (!idNum) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const build = db
      .select()
      .from(schema.resumeBuilds)
      .where(eq(schema.resumeBuilds.id, idNum))
      .get();

    if (!build?.pdfPath) {
      return NextResponse.json({ error: "PDF not generated yet" }, { status: 404 });
    }

    if (!build.pdfPath || build.pdfPath.includes("/") || build.pdfPath.includes("\\") || build.pdfPath.includes("..")) {
      return NextResponse.json({ error: "Invalid PDF path" }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), "uploads", build.pdfPath);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "PDF file not found" }, { status: 404 });
    }

    const buffer = fs.readFileSync(filePath);
    const safeName = (build.name || "resume").replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-");

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to download PDF" }, { status: 500 });
  }
}
