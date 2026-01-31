import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "10");

  const results = await prisma.testResult.findMany({
    where: { userId: session.user.id },
    orderBy: { testedAt: "desc" },
    take: limit,
  });

  // Single groupBy query instead of 4 separate count queries
  const statusCounts = await prisma.testResult.groupBy({
    by: ["status"],
    where: { userId: session.user.id },
    _count: true,
  });

  const countMap: Record<string, number> = {};
  for (const row of statusCounts) {
    countMap[row.status] = row._count;
  }
  const passed = countMap["COMPLETED"] || 0;
  const failed = countMap["FAILED"] || 0;
  const pending = (countMap["PENDING"] || 0) + (countMap["RUNNING"] || 0);
  const total = passed + failed + pending;

  return NextResponse.json({ results, stats: { total, passed, failed, pending } });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { url, channelName, playlistItemId } = await request.json();

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  const testResult = await prisma.testResult.create({
    data: {
      userId: session.user.id,
      url,
      channelName: channelName || null,
      playlistItemId: playlistItemId || null,
      status: "PENDING",
    },
  });

  await logActivity(session.user.id, "START_TEST", `Started test for ${channelName || url}`);

  return NextResponse.json(testResult);
}
