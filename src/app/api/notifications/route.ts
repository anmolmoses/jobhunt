import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, desc, and, count, sql } from "drizzle-orm";

// GET: Fetch notifications (with unread count)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    let query = db
      .select()
      .from(schema.notifications)
      .orderBy(desc(schema.notifications.createdAt))
      .limit(limit);

    const notifications = unreadOnly
      ? query.where(eq(schema.notifications.read, false)).all()
      : query.all();

    // Always get unread count
    const [unreadResult] = db
      .select({ unread: count() })
      .from(schema.notifications)
      .where(eq(schema.notifications.read, false))
      .all();

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        ...n,
        metadata: n.metadata ? JSON.parse(n.metadata) : null,
      })),
      unreadCount: unreadResult?.unread ?? 0,
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    return NextResponse.json({ error: "Failed to get notifications" }, { status: 500 });
  }
}

// POST: Create a notification
export async function POST(request: NextRequest) {
  try {
    const { type, title, message, metadata } = await request.json();

    if (!type || !title || !message) {
      return NextResponse.json({ error: "type, title, and message are required" }, { status: 400 });
    }

    const result = db
      .insert(schema.notifications)
      .values({
        type,
        title,
        message,
        metadata: metadata ? JSON.stringify(metadata) : null,
      })
      .run();

    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error("Create notification error:", error);
    return NextResponse.json({ error: "Failed to create notification" }, { status: 500 });
  }
}

// PATCH: Mark notifications as read
export async function PATCH(request: NextRequest) {
  try {
    const { id, markAllRead } = await request.json();

    if (markAllRead) {
      db.update(schema.notifications)
        .set({ read: true })
        .where(eq(schema.notifications.read, false))
        .run();
      return NextResponse.json({ success: true });
    }

    if (id) {
      db.update(schema.notifications)
        .set({ read: true })
        .where(eq(schema.notifications.id, id))
        .run();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "id or markAllRead required" }, { status: 400 });
  } catch (error) {
    console.error("Update notification error:", error);
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 });
  }
}

// DELETE: Clear old notifications
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      db.delete(schema.notifications)
        .where(eq(schema.notifications.id, Number(id)))
        .run();
    } else {
      // Delete read notifications older than 7 days
      db.delete(schema.notifications)
        .where(
          and(
            eq(schema.notifications.read, true),
            sql`${schema.notifications.createdAt} < datetime('now', '-7 days')`
          )
        )
        .run();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete notification error:", error);
    return NextResponse.json({ error: "Failed to delete notification" }, { status: 500 });
  }
}
