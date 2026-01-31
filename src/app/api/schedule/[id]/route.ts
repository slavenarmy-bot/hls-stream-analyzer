import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const scheduledTest = await prisma.scheduledTest.findUnique({
    where: { id },
    include: {
      playlist: {
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });

  if (!scheduledTest || scheduledTest.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(scheduledTest);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.scheduledTest.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();

  const allowedFields = [
    "name",
    "playlistId",
    "channels",
    "testDuration",
    "scheduledAt",
    "recurrence",
    "status",
  ] as const;

  const data: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      if (field === "scheduledAt") {
        data[field] = new Date(body[field]);
      } else {
        data[field] = body[field];
      }
    }
  }

  if (data.playlistId) {
    const playlist = await prisma.playlist.findUnique({
      where: { id: data.playlistId as string },
    });
    if (!playlist || playlist.userId !== session.user.id) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }
  }

  const updated = await prisma.scheduledTest.update({
    where: { id },
    data,
    include: {
      playlist: {
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });

  await logActivity(session.user.id, "UPDATE_SCHEDULE", `Updated scheduled test: ${updated.name}`);

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.scheduledTest.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.scheduledTest.delete({ where: { id } });
  await logActivity(session.user.id, "DELETE_SCHEDULE", `Deleted scheduled test: ${existing.name}`);

  return NextResponse.json({ success: true });
}
