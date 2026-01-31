import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const channel = searchParams.get("channel");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Record<string, unknown> = { userId: session.user.id };

  if (status) where.status = status;
  if (channel) where.channelName = { contains: channel, mode: "insensitive" };
  if (from || to) {
    where.testedAt = {};
    if (from) (where.testedAt as Record<string, unknown>).gte = new Date(from);
    if (to) (where.testedAt as Record<string, unknown>).lte = new Date(to + "T23:59:59.999Z");
  }

  const results = await prisma.testResult.findMany({
    where,
    orderBy: { testedAt: "desc" },
    take: 100,
  });

  return NextResponse.json(results);
}
