import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

// GET — fetch current salary profile
export async function GET() {
  try {
    const profile = db
      .select()
      .from(schema.userSalaryProfile)
      .limit(1)
      .get();

    if (!profile) {
      return NextResponse.json({ profile: null });
    }

    return NextResponse.json({
      profile: {
        ...profile,
        salaryBreakdown: JSON.parse(profile.salaryBreakdown || "{}"),
        skills: JSON.parse(profile.skills || "[]"),
      },
    });
  } catch (error) {
    console.error("Salary profile GET error:", error);
    return NextResponse.json({ error: "Failed to load salary profile" }, { status: 500 });
  }
}

// PUT — create or update salary profile
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    const existing = db
      .select()
      .from(schema.userSalaryProfile)
      .limit(1)
      .get();

    const data = {
      currentCtc: body.currentCtc ?? null,
      currentInHand: body.currentInHand ?? null,
      currentBase: body.currentBase ?? null,
      currentBonus: body.currentBonus ?? null,
      currentStocks: body.currentStocks ?? null,
      currentOther: body.currentOther ?? null,
      currency: body.currency || "INR",
      salaryBreakdown: JSON.stringify(body.salaryBreakdown || {}),
      currentTitle: body.currentTitle ?? null,
      currentCompany: body.currentCompany ?? null,
      totalExperience: body.totalExperience ?? null,
      relevantExperience: body.relevantExperience ?? null,
      location: body.location ?? null,
      skills: JSON.stringify(body.skills || []),
      noticePeriod: body.noticePeriod ?? null,
      expectedMinCtc: body.expectedMinCtc ?? null,
      expectedMaxCtc: body.expectedMaxCtc ?? null,
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      db.update(schema.userSalaryProfile)
        .set(data)
        .where(eq(schema.userSalaryProfile.id, existing.id))
        .run();
    } else {
      db.insert(schema.userSalaryProfile)
        .values(data)
        .run();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Salary profile PUT error:", error);
    return NextResponse.json({ error: "Failed to save salary profile" }, { status: 500 });
  }
}
