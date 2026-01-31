import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const playlist = await prisma.playlist.findUnique({ where: { id } });
  if (!playlist || playlist.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { channelName, url } = await request.json();
  if (!channelName || !url) {
    return NextResponse.json({ error: "Channel name and URL are required" }, { status: 400 });
  }

  const maxOrder = await prisma.playlistItem.findFirst({
    where: { playlistId: id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const item = await prisma.playlistItem.create({
    data: {
      playlistId: id,
      channelName,
      url,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });

  return NextResponse.json(item);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("itemId");

  if (!itemId) {
    return NextResponse.json({ error: "Item ID required" }, { status: 400 });
  }

  const playlist = await prisma.playlist.findUnique({ where: { id } });
  if (!playlist || playlist.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.playlistItem.delete({ where: { id: itemId } });

  return NextResponse.json({ success: true });
}
