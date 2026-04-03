import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { parseResume } from "@/lib/resume/parser";
import { recordAction } from "@/lib/gamification";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const ext = path.extname(file.name).toLowerCase();
    if (![".pdf", ".docx"].includes(ext)) {
      return NextResponse.json({ error: "Only PDF and DOCX files are supported" }, { status: 400 });
    }

    const allowedMimes = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowedMimes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File size must be under 10MB" }, { status: 400 });
    }

    // Ensure uploads directory exists
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    // Save file with UUID name
    const fileName = `${uuidv4()}${ext}`;
    const filePath = path.join(UPLOADS_DIR, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    // Parse text from file
    let parsedText: string;
    try {
      parsedText = await parseResume(filePath);
    } catch (parseError) {
      // Clean up file if parsing fails
      fs.unlinkSync(filePath);
      console.error("Parse error:", parseError);
      return NextResponse.json({ error: "Failed to parse file content" }, { status: 422 });
    }

    // Store in database
    const result = db
      .insert(schema.resumes)
      .values({
        fileName: file.name,
        filePath: fileName,
        fileType: ext.slice(1),
        fileSize: file.size,
        parsedText,
      })
      .returning()
      .get();

    try { recordAction("resume_upload"); } catch (e) { console.error("Gamification error:", e); }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Failed to upload resume" }, { status: 500 });
  }
}
