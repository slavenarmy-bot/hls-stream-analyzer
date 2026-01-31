import { prisma } from "./prisma";

export async function logActivity(
  userId: string,
  action: string,
  details?: string,
  ipAddress?: string
) {
  await prisma.activityLog.create({
    data: { userId, action, details, ipAddress },
  });
}
