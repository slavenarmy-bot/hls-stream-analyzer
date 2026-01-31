import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await prisma.testResult.findUnique({ where: { id } });

  if (!result || result.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.testResult.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Whitelist only known fields to prevent Prisma errors
  const data: Record<string, unknown> = {};
  const allowedFields = [
    "status", "latency", "jitter", "bitrate", "bufferHealth",
    "freeze", "mosaic", "blackFrame", "avSync", "lossFrame",
    "minuteSnapshots", "detectionTimeline", "bitrateTimeline",
    "duration", "errorMessage",
  ];
  for (const key of allowedFields) {
    if (key in body) {
      data[key] = body[key];
    }
  }

  console.log("[PUT /api/testing/:id] Updating with fields:", Object.keys(data).join(", "));

  try {
    const updated = await prisma.testResult.update({
      where: { id },
      data,
    });
    return NextResponse.json(updated);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : "";
    console.error("Failed to update test result:", errMsg);
    console.error("Stack:", errStack);
    console.error("Data keys:", Object.keys(data).join(", "));
    return NextResponse.json(
      { error: "Failed to update test result", details: errMsg },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.testResult.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.testResult.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
