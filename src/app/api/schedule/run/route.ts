import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

interface ChannelEntry {
  url: string;
  channelName?: string;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { scheduleId } = await request.json();

  if (!scheduleId) {
    return NextResponse.json({ error: "scheduleId is required" }, { status: 400 });
  }

  const scheduledTest = await prisma.scheduledTest.findUnique({
    where: { id: scheduleId },
    include: {
      playlist: {
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });

  if (!scheduledTest || scheduledTest.userId !== session.user.id) {
    return NextResponse.json({ error: "Scheduled test not found" }, { status: 404 });
  }

  // Mark as RUNNING
  await prisma.scheduledTest.update({
    where: { id: scheduleId },
    data: { status: "RUNNING" },
  });

  // Determine channels to test
  let channelsToTest: ChannelEntry[] = [];

  if (scheduledTest.playlistId && scheduledTest.playlist) {
    channelsToTest = scheduledTest.playlist.items.map((item) => ({
      url: item.url,
      channelName: item.channelName,
    }));
  } else if (scheduledTest.channels) {
    channelsToTest = scheduledTest.channels as unknown as ChannelEntry[];
  }

  if (channelsToTest.length === 0) {
    await prisma.scheduledTest.update({
      where: { id: scheduleId },
      data: { status: "COMPLETED", lastRunAt: new Date() },
    });
    return NextResponse.json({ error: "No channels to test" }, { status: 400 });
  }

  // Create TestResult records for each channel
  const createdResults = await Promise.all(
    channelsToTest.map((channel) =>
      prisma.testResult.create({
        data: {
          userId: session.user.id,
          url: channel.url,
          channelName: channel.channelName || null,
          playlistItemId: null,
          status: "PENDING",
          duration: scheduledTest.testDuration,
        },
      })
    )
  );

  // Update lastRunAt
  const updateData: { lastRunAt: Date; status?: "COMPLETED" | "RUNNING" } = {
    lastRunAt: new Date(),
  };

  // If recurrence is ONCE, mark as COMPLETED
  if (scheduledTest.recurrence === "ONCE") {
    updateData.status = "COMPLETED";
  } else {
    // For recurring tests, set back to SCHEDULED so it can run again
    await prisma.scheduledTest.update({
      where: { id: scheduleId },
      data: { lastRunAt: new Date(), status: "SCHEDULED" },
    });
  }

  if (scheduledTest.recurrence === "ONCE") {
    await prisma.scheduledTest.update({
      where: { id: scheduleId },
      data: updateData,
    });
  }

  await logActivity(
    session.user.id,
    "RUN_SCHEDULE",
    `Ran scheduled test: ${scheduledTest.name} (${createdResults.length} channels)`
  );

  // Return test result IDs and channel info for the browser to start testing
  const testEntries = createdResults.map((result) => ({
    testResultId: result.id,
    url: result.url,
    channelName: result.channelName,
  }));

  return NextResponse.json({
    scheduleId: scheduledTest.id,
    scheduleName: scheduledTest.name,
    testDuration: scheduledTest.testDuration,
    tests: testEntries,
  });
}
