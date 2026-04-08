import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";

// GET all stories ordered by updatedAt desc
export async function GET() {
  try {
    const stories = db
      .select()
      .from(schema.interviewStories)
      .orderBy(desc(schema.interviewStories.updatedAt))
      .all();

    return NextResponse.json(
      stories.map((s) => ({
        ...s,
        skills: JSON.parse(s.skills || "[]"),
        questionsItAnswers: JSON.parse(s.questionsItAnswers || "[]"),
      }))
    );
  } catch (error) {
    console.error("Get interview stories error:", error);
    return NextResponse.json(
      { error: "Failed to get interview stories" },
      { status: 500 }
    );
  }
}

// POST create a new story
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.title || !body.theme || !body.situation || !body.task || !body.action || !body.result) {
      return NextResponse.json(
        { error: "title, theme, situation, task, action, and result are required" },
        { status: 400 }
      );
    }

    const story = db
      .insert(schema.interviewStories)
      .values({
        title: body.title,
        theme: body.theme,
        situation: body.situation,
        task: body.task,
        action: body.action,
        result: body.result,
        reflection: body.reflection || null,
        skills: JSON.stringify(body.skills || []),
        questionsItAnswers: JSON.stringify(body.questionsItAnswers || []),
        source: body.source || "manual",
      })
      .returning()
      .get();

    return NextResponse.json(
      {
        ...story,
        skills: JSON.parse(story.skills || "[]"),
        questionsItAnswers: JSON.parse(story.questionsItAnswers || "[]"),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create interview story error:", error);
    return NextResponse.json(
      { error: "Failed to create interview story" },
      { status: 500 }
    );
  }
}

// PUT update an existing story
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const story = db
      .update(schema.interviewStories)
      .set({
        title: body.title,
        theme: body.theme,
        situation: body.situation,
        task: body.task,
        action: body.action,
        result: body.result,
        reflection: body.reflection || null,
        skills: JSON.stringify(body.skills || []),
        questionsItAnswers: JSON.stringify(body.questionsItAnswers || []),
        source: body.source || "manual",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.interviewStories.id, body.id))
      .returning()
      .get();

    if (!story) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...story,
      skills: JSON.parse(story.skills || "[]"),
      questionsItAnswers: JSON.parse(story.questionsItAnswers || "[]"),
    });
  } catch (error) {
    console.error("Update interview story error:", error);
    return NextResponse.json(
      { error: "Failed to update interview story" },
      { status: 500 }
    );
  }
}

// DELETE a story by id
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    db.delete(schema.interviewStories)
      .where(eq(schema.interviewStories.id, Number(id)))
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete interview story error:", error);
    return NextResponse.json(
      { error: "Failed to delete interview story" },
      { status: 500 }
    );
  }
}
