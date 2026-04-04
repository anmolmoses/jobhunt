import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import AdmZip from "adm-zip";

function normalizeCompany(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split("\n");
  if (lines.length < 2) return [];

  // Find the header line (LinkedIn CSVs sometimes have notes before headers)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    if (lines[i].includes(",") && !lines[i].startsWith('"When ') && !lines[i].startsWith("Notes")) {
      headerIdx = i;
      break;
    }
  }

  const headers = parseCSVLine(lines[headerIdx]);
  const rows: Record<string, string>[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] || "").trim();
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!file.name.endsWith(".zip")) {
      return NextResponse.json({ error: "Please upload a .zip file" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    // Find relevant CSV files
    let connectionsCSV = "";
    let messagesCSV = "";
    let profileCSV = "";
    let companyFollowsCSV = "";

    for (const entry of entries) {
      const name = entry.entryName.toLowerCase();
      if (name.includes("connections") && name.endsWith(".csv")) {
        connectionsCSV = entry.getData().toString("utf8");
      } else if (name.includes("messages") && name.endsWith(".csv")) {
        messagesCSV = entry.getData().toString("utf8");
      } else if (name === "profile.csv" || name.endsWith("/profile.csv")) {
        profileCSV = entry.getData().toString("utf8");
      } else if (name.includes("company follow") && name.endsWith(".csv")) {
        companyFollowsCSV = entry.getData().toString("utf8");
      }
    }

    if (!connectionsCSV) {
      return NextResponse.json(
        { error: "No Connections.csv found in the zip. Make sure this is a LinkedIn data export." },
        { status: 400 }
      );
    }

    // Parse profile
    let profileName: string | null = null;
    let profileHeadline: string | null = null;
    if (profileCSV) {
      const profiles = parseCSV(profileCSV);
      if (profiles.length > 0) {
        const p = profiles[0];
        profileName = [p["First Name"], p["Last Name"]].filter(Boolean).join(" ") || null;
        profileHeadline = p["Headline"] || null;
      }
    }

    // Parse connections
    const connections = parseCSV(connectionsCSV);

    // Parse messages for conversation tracking
    const messageRows = messagesCSV ? parseCSV(messagesCSV) : [];

    // Parse company follows
    const companyFollows = companyFollowsCSV ? parseCSV(companyFollowsCSV) : [];

    // Clear previous imports
    const existingImports = db.select().from(schema.linkedinImports).all();
    if (existingImports.length > 0) {
      for (const imp of existingImports) {
        db.delete(schema.linkedinMessages).where(eq(schema.linkedinMessages.importId, imp.id)).run();
        db.delete(schema.linkedinConnections).where(eq(schema.linkedinConnections.importId, imp.id)).run();
      }
      db.delete(schema.linkedinImports).run();
    }

    // Create import record
    const importRecord = db
      .insert(schema.linkedinImports)
      .values({
        fileName: file.name,
        connectionsCount: connections.length,
        messagesCount: messageRows.length,
        companyFollowsCount: companyFollows.length,
        profileName,
        profileHeadline,
      })
      .returning()
      .get();

    // Insert connections
    let insertedConnections = 0;
    for (const conn of connections) {
      const firstName = conn["First Name"] || "";
      const lastName = conn["Last Name"] || "";
      const fullName = [firstName, lastName].filter(Boolean).join(" ");
      if (!fullName) continue;

      const company = conn["Company"] || null;

      db.insert(schema.linkedinConnections)
        .values({
          importId: importRecord.id,
          firstName,
          lastName,
          fullName,
          profileUrl: conn["URL"] || null,
          email: conn["Email Address"] || null,
          company,
          normalizedCompany: company ? normalizeCompany(company) : null,
          position: conn["Position"] || null,
          connectedOn: conn["Connected On"] || null,
        })
        .run();
      insertedConnections++;
    }

    // Process messages — aggregate by conversation partner
    const conversationMap = new Map<string, {
      conversationId: string;
      participantName: string;
      participantProfileUrl: string | null;
      lastMessageDate: string | null;
      messageCount: number;
      hasInbound: boolean;
      hasOutbound: boolean;
    }>();

    const myProfileName = profileName?.toLowerCase() || "";

    for (const msg of messageRows) {
      const convId = msg["CONVERSATION ID"] || "";
      const from = msg["FROM"] || "";
      const senderUrl = msg["SENDER PROFILE URL"] || "";
      const date = msg["DATE"] || "";

      // Determine the "other" person in the conversation
      const isFromMe = from.toLowerCase() === myProfileName;
      const otherName = isFromMe ? (msg["TO"] || from) : from;
      const otherUrl = isFromMe ? (msg["RECIPIENT PROFILE URLS"] || "") : senderUrl;

      const key = convId || otherName;
      const existing = conversationMap.get(key);

      if (existing) {
        existing.messageCount++;
        if (isFromMe) existing.hasOutbound = true;
        else existing.hasInbound = true;
        if (date && (!existing.lastMessageDate || date > existing.lastMessageDate)) {
          existing.lastMessageDate = date;
        }
      } else {
        conversationMap.set(key, {
          conversationId: convId,
          participantName: otherName,
          participantProfileUrl: otherUrl || null,
          lastMessageDate: date || null,
          messageCount: 1,
          hasInbound: !isFromMe,
          hasOutbound: isFromMe,
        });
      }
    }

    // Insert message aggregates
    let insertedMessages = 0;
    for (const conv of conversationMap.values()) {
      if (!conv.participantName) continue;
      const direction = conv.hasInbound && conv.hasOutbound
        ? "both"
        : conv.hasInbound
        ? "inbound"
        : "outbound";

      db.insert(schema.linkedinMessages)
        .values({
          importId: importRecord.id,
          conversationId: conv.conversationId,
          participantName: conv.participantName,
          participantProfileUrl: conv.participantProfileUrl,
          lastMessageDate: conv.lastMessageDate,
          messageCount: conv.messageCount,
          direction,
        })
        .run();
      insertedMessages++;
    }

    return NextResponse.json({
      success: true,
      importId: importRecord.id,
      stats: {
        connections: insertedConnections,
        conversations: insertedMessages,
        companyFollows: companyFollows.length,
        profileName,
        profileHeadline,
      },
    });
  } catch (error) {
    console.error("LinkedIn import error:", error);
    const message = error instanceof Error ? error.message : "Failed to import LinkedIn data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET — check if LinkedIn data has been imported
export async function GET() {
  try {
    const imports = db.select().from(schema.linkedinImports).all();
    if (imports.length === 0) {
      return NextResponse.json({ imported: false });
    }

    const latest = imports[imports.length - 1];
    return NextResponse.json({
      imported: true,
      importId: latest.id,
      fileName: latest.fileName,
      connectionsCount: latest.connectionsCount,
      messagesCount: latest.messagesCount,
      profileName: latest.profileName,
      profileHeadline: latest.profileHeadline,
      importedAt: latest.createdAt,
    });
  } catch (error) {
    console.error("LinkedIn import check error:", error);
    return NextResponse.json({ imported: false });
  }
}

// DELETE — clear all LinkedIn data
export async function DELETE() {
  try {
    const existingImports = db.select().from(schema.linkedinImports).all();
    for (const imp of existingImports) {
      db.delete(schema.linkedinMessages).where(eq(schema.linkedinMessages.importId, imp.id)).run();
      db.delete(schema.linkedinConnections).where(eq(schema.linkedinConnections.importId, imp.id)).run();
    }
    db.delete(schema.linkedinImports).run();
    return NextResponse.json({ success: true, message: "LinkedIn data cleared" });
  } catch (error) {
    console.error("LinkedIn delete error:", error);
    return NextResponse.json({ error: "Failed to clear LinkedIn data" }, { status: 500 });
  }
}
