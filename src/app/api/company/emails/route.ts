import { NextRequest, NextResponse } from "next/server";
import { findCompanyEmails, isConfigured } from "@/lib/company/hunter";

export async function POST(request: NextRequest) {
  try {
    if (!(await isConfigured())) {
      return NextResponse.json(
        { error: "Hunter.io API key not configured. Add it in Settings." },
        { status: 400 }
      );
    }

    const { domain, limit } = await request.json();
    if (!domain) {
      return NextResponse.json({ error: "domain is required" }, { status: 400 });
    }

    const result = await findCompanyEmails(domain, limit || 5);
    return NextResponse.json(result || { emails: [], domain });
  } catch (error) {
    console.error("Email finder error:", error);
    return NextResponse.json({ error: "Failed to find emails" }, { status: 500 });
  }
}
