import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { resetGamification } from "@/lib/gamification";
import fs from "fs";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const { target } = await request.json();

    switch (target) {
      case "jobs": {
        // Delete saved jobs first (FK), then job results, then searches
        db.delete(schema.savedJobs).run();
        db.delete(schema.jobResults).run();
        db.delete(schema.jobSearches).run();
        return NextResponse.json({ success: true, message: "All job searches, results, and saved jobs deleted" });
      }

      case "saved_jobs": {
        db.delete(schema.savedJobs).run();
        return NextResponse.json({ success: true, message: "All saved jobs deleted" });
      }

      case "resumes": {
        // Delete analyses first (FK), then resumes
        db.delete(schema.resumeAnalyses).run();
        db.delete(schema.resumes).run();
        // Clean up uploaded files
        const uploadsDir = path.join(process.cwd(), "uploads");
        if (fs.existsSync(uploadsDir)) {
          const files = fs.readdirSync(uploadsDir);
          for (const file of files) {
            fs.unlinkSync(path.join(uploadsDir, file));
          }
        }
        return NextResponse.json({ success: true, message: "All resumes and analyses deleted" });
      }

      case "preferences": {
        db.delete(schema.jobPreferences).run();
        return NextResponse.json({ success: true, message: "All preferences deleted" });
      }

      case "networking": {
        db.delete(schema.outreachTracking).run();
        db.delete(schema.networkContacts).run();
        return NextResponse.json({ success: true, message: "All networking data deleted" });
      }

      case "company_cache": {
        db.delete(schema.companyEnrichment).run();
        db.delete(schema.geocodeCache).run();
        return NextResponse.json({ success: true, message: "All cached company data cleared" });
      }

      case "gamification": {
        resetGamification();
        return NextResponse.json({ success: true, message: "All gamification data reset" });
      }

      case "everything": {
        // Nuclear option — delete all data
        db.delete(schema.outreachTracking).run();
        db.delete(schema.networkContacts).run();
        db.delete(schema.savedJobs).run();
        db.delete(schema.jobResults).run();
        db.delete(schema.jobSearches).run();
        db.delete(schema.resumeAnalyses).run();
        db.delete(schema.resumes).run();
        db.delete(schema.jobPreferences).run();
        db.delete(schema.companyEnrichment).run();
        db.delete(schema.geocodeCache).run();
        resetGamification();
        // Don't delete settings (API keys)
        // Clean uploads
        const uploadsDir2 = path.join(process.cwd(), "uploads");
        if (fs.existsSync(uploadsDir2)) {
          const files = fs.readdirSync(uploadsDir2);
          for (const file of files) {
            fs.unlinkSync(path.join(uploadsDir2, file));
          }
        }
        return NextResponse.json({ success: true, message: "All data deleted. Settings (API keys) preserved." });
      }

      default:
        return NextResponse.json({ error: "Invalid target" }, { status: 400 });
    }
  } catch (error) {
    console.error("Reset error:", error);
    return NextResponse.json({ error: "Failed to reset data" }, { status: 500 });
  }
}
