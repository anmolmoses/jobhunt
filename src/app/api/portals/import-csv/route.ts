import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, count } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";

interface CsvRow {
  fortuneRank: number;
  company: string;
  industry: string;
  revenue: string;
  employees: string;
  hqCity: string;
  hqState: string;
  website: string;
  careersUrl: string;
  ceo: string;
  founded: string;
  publicPrivate: string;
  ticker: string;
  fundingInfo: string;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function detectScanMethod(careersUrl: string): "greenhouse" | "lever" | "firecrawl" {
  const url = careersUrl.toLowerCase();
  if (url.includes("greenhouse.io") || url.includes("boards.greenhouse")) return "greenhouse";
  if (url.includes("lever.co") || url.includes("jobs.lever")) return "lever";
  return "firecrawl";
}

function detectCategory(industry: string, revenue: string): string {
  const ind = industry.toLowerCase();
  const rev = revenue.replace(/[^0-9.]/g, "");
  const revNum = parseFloat(rev) || 0;
  const isBillions = revenue.includes("B");

  if (ind.includes("ai") || ind.includes("llm") || ind.includes("machine learning")) return "AI & ML";
  if (ind.includes("semiconductor") || ind.includes("chip")) return "Semiconductors";
  if (ind.includes("cybersecurity") || ind.includes("security")) return "Cybersecurity";
  if (ind.includes("cloud") && ind.includes("software")) return "Cloud Software";
  if (ind.includes("fintech") || ind.includes("financial tech") || ind.includes("payment") || ind.includes("digital banking")) return "Fintech";
  if (ind.includes("telecom")) return "Telecommunications";
  if (ind.includes("e-commerce") || ind.includes("ecommerce")) return "E-Commerce";
  if (ind.includes("gaming") || ind.includes("game")) return "Gaming";
  if (ind.includes("social media")) return "Social Media";
  if (ind.includes("devops") || ind.includes("developer") || ind.includes("code") || ind.includes("ide")) return "Developer Tools";
  if (ind.includes("data") || ind.includes("analytics") || ind.includes("database")) return "Data & Analytics";
  if (ind.includes("infrastructure") || ind.includes("hosting") || ind.includes("cdn")) return "Infrastructure";
  if (ind.includes("hr") || ind.includes("payroll") || ind.includes("people")) return "HR Tech";
  if (ind.includes("design") || ind.includes("collaboration") || ind.includes("productivity")) return "Productivity & Design";
  if (ind.includes("defense") || ind.includes("government")) return "Defense Tech";
  if (ind.includes("streaming") || ind.includes("entertainment") || ind.includes("media")) return "Media & Entertainment";
  if (isBillions && revNum > 50) return "Big Tech";
  if (isBillions && revNum > 10) return "Enterprise";
  return "Enterprise Software";
}

function parseCsvFile(filePath: string): CsvRow[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  // Skip header
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 14) continue;

    rows.push({
      fortuneRank: parseInt(fields[0]) || 0,
      company: fields[1],
      industry: fields[2],
      revenue: fields[3],
      employees: fields[4].replace(/"/g, ""),
      hqCity: fields[5],
      hqState: fields[6],
      website: fields[7],
      careersUrl: fields[8],
      ceo: fields[9],
      founded: fields[10],
      publicPrivate: fields[11],
      ticker: fields[12],
      fundingInfo: fields.slice(13).join(",").replace(/^"|"$/g, ""), // Funding info may contain commas
    });
  }

  return rows;
}

export async function POST() {
  try {
    const csvDir = join(process.cwd(), "docs", "csv");
    const file1 = join(csvDir, "fortune_500_tech_companies.csv");
    const file2 = join(csvDir, "fortune_501_2000_tech_companies.csv");

    const rows1 = parseCsvFile(file1);
    const rows2 = parseCsvFile(file2);
    const allRows = [...rows1, ...rows2];

    let added = 0;
    let skipped = 0;
    let updated = 0;

    for (const row of allRows) {
      if (!row.company || !row.careersUrl) {
        skipped++;
        continue;
      }

      const normalizedName = row.company.toLowerCase().replace(/[^a-z0-9]/g, "");
      const scanMethod = detectScanMethod(row.careersUrl);
      const category = detectCategory(row.industry, row.revenue);

      // Check if already exists
      const existing = db
        .select()
        .from(schema.companyPortals)
        .where(eq(schema.companyPortals.normalizedName, normalizedName))
        .get();

      if (existing) {
        // Update with directory data if not already set
        if (!existing.fortuneRank) {
          db.update(schema.companyPortals)
            .set({
              fortuneRank: row.fortuneRank || null,
              industry: row.industry || null,
              revenue: row.revenue || null,
              employees: row.employees || null,
              hqCity: row.hqCity || null,
              hqState: row.hqState || null,
              website: row.website || null,
              ceo: row.ceo || null,
              founded: row.founded || null,
              publicPrivate: row.publicPrivate || null,
              ticker: row.ticker !== "N/A" ? row.ticker : null,
              fundingInfo: row.fundingInfo || null,
              category: category,
            })
            .where(eq(schema.companyPortals.id, existing.id))
            .run();
          updated++;
        } else {
          skipped++;
        }
        continue;
      }

      db.insert(schema.companyPortals)
        .values({
          companyName: row.company,
          normalizedName,
          careersUrl: row.careersUrl,
          scanMethod,
          category,
          fortuneRank: row.fortuneRank || null,
          industry: row.industry || null,
          revenue: row.revenue || null,
          employees: row.employees || null,
          hqCity: row.hqCity || null,
          hqState: row.hqState || null,
          website: row.website || null,
          ceo: row.ceo || null,
          founded: row.founded || null,
          publicPrivate: row.publicPrivate || null,
          ticker: row.ticker !== "N/A" ? row.ticker : null,
          fundingInfo: row.fundingInfo || null,
        })
        .run();

      added++;
    }

    // Create a notification for the import
    db.insert(schema.notifications)
      .values({
        type: "system",
        title: "Company Directory Imported",
        message: `Imported ${added} companies, updated ${updated}, skipped ${skipped} duplicates from Fortune CSV data.`,
        metadata: JSON.stringify({ added, updated, skipped, total: allRows.length }),
      })
      .run();

    return NextResponse.json({
      success: true,
      added,
      updated,
      skipped,
      total: allRows.length,
    });
  } catch (error) {
    console.error("CSV import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import CSV" },
      { status: 500 }
    );
  }
}

// GET: Check if import is needed (no portals with fortuneRank exist)
export async function GET() {
  try {
    const [result] = db
      .select({ total: count() })
      .from(schema.companyPortals)
      .all();

    const total = result?.total ?? 0;

    return NextResponse.json({
      needsImport: total < 50, // If fewer than 50 portals, suggest import
      currentCount: total,
    });
  } catch (error) {
    console.error("Check import error:", error);
    return NextResponse.json({ error: "Failed to check" }, { status: 500 });
  }
}
