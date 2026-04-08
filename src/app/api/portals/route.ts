import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  try {
    const portals = db
      .select()
      .from(schema.companyPortals)
      .orderBy(desc(schema.companyPortals.createdAt))
      .all();

    return NextResponse.json(
      portals.map((p) => ({
        ...p,
        titleFilters: JSON.parse(p.titleFilters || "[]"),
        titleExclusions: JSON.parse(p.titleExclusions || "[]"),
      }))
    );
  } catch (error) {
    console.error("Get portals error:", error);
    return NextResponse.json({ error: "Failed to get portals" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyName, careersUrl, apiEndpoint, scanMethod, category, logoUrl, titleFilters, titleExclusions } = body;

    if (!companyName || !careersUrl) {
      return NextResponse.json({ error: "companyName and careersUrl are required" }, { status: 400 });
    }

    const normalizedName = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");

    // Check for duplicate
    const existing = db
      .select()
      .from(schema.companyPortals)
      .where(eq(schema.companyPortals.normalizedName, normalizedName))
      .get();

    if (existing) {
      return NextResponse.json({ error: "Company portal already exists" }, { status: 409 });
    }

    const result = db
      .insert(schema.companyPortals)
      .values({
        companyName,
        normalizedName,
        careersUrl,
        apiEndpoint: apiEndpoint || null,
        scanMethod: scanMethod || "firecrawl",
        category: category || null,
        logoUrl: logoUrl || null,
        titleFilters: titleFilters ? JSON.stringify(titleFilters) : "[]",
        titleExclusions: titleExclusions ? JSON.stringify(titleExclusions) : "[]",
      })
      .returning()
      .get();

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Add portal error:", error);
    return NextResponse.json({ error: "Failed to add portal" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id || typeof id !== "number") {
      return NextResponse.json({ error: "Valid id is required" }, { status: 400 });
    }

    db.delete(schema.companyPortals)
      .where(eq(schema.companyPortals.id, id))
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete portal error:", error);
    return NextResponse.json({ error: "Failed to delete portal" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, enabled } = body;

    if (!id || typeof id !== "number") {
      return NextResponse.json({ error: "Valid id is required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (typeof enabled === "boolean") updates.enabled = enabled;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    db.update(schema.companyPortals)
      .set(updates)
      .where(eq(schema.companyPortals.id, id))
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update portal error:", error);
    return NextResponse.json({ error: "Failed to update portal" }, { status: 500 });
  }
}
