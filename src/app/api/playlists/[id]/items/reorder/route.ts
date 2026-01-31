import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const playlist = await prisma.playlist.findUnique({ where: { id } });
  if (!playlist || playlist.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { items } = await request.json();

  const updates = items.map((item: { id: string; sortOrder: number }) =>
    prisma.playlistItem.update({
      where: { id: item.id },
      data: { sortOrder: item.sortOrder },
    })
  );

  await Promise.all(updates);

  return NextResponse.json({ success: true });
}
