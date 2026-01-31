import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scheduledTests = await prisma.scheduledTest.findMany({
    where: { userId: session.user.id },
    orderBy: { scheduledAt: "desc" },
    include: {
      playlist: {
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });

  return NextResponse.json(scheduledTests);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    name,
    playlistId,
    channels,
    testDuration = 30,
    scheduledAt,
    recurrence = "ONCE",
  } = body;

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  if (!scheduledAt) {
    return NextResponse.json({ error: "Scheduled date is required" }, { status: 400 });
  }

  if (!playlistId && (!channels || !Array.isArray(channels) || channels.length === 0)) {
    return NextResponse.json(
      { error: "Either a playlist or at least one channel must be provided" },
      { status: 400 }
    );
  }

  if (playlistId) {
    const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
    if (!playlist || playlist.userId !== session.user.id) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }
  }

  const scheduledTest = await prisma.scheduledTest.create({
    data: {
      userId: session.user.id,
      name: name.trim(),
      playlistId: playlistId || null,
      channels: channels || null,
      testDuration,
      scheduledAt: new Date(scheduledAt),
      recurrence,
    },
    include: {
      playlist: {
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });

  await logActivity(session.user.id, "CREATE_SCHEDULE", `Created scheduled test: ${name.trim()}`);

  return NextResponse.json(scheduledTest, { status: 201 });
}
