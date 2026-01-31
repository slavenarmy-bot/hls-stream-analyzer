-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('SCHEDULED', 'RUNNING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Recurrence" AS ENUM ('ONCE', 'DAILY', 'WEEKLY');

-- CreateTable
CREATE TABLE "ScheduledTest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "playlistId" TEXT,
    "channels" JSONB,
    "testDuration" INTEGER NOT NULL DEFAULT 30,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "recurrence" "Recurrence" NOT NULL DEFAULT 'ONCE',
    "status" "ScheduleStatus" NOT NULL DEFAULT 'SCHEDULED',
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledTest_userId_idx" ON "ScheduledTest"("userId");

-- CreateIndex
CREATE INDEX "ScheduledTest_scheduledAt_idx" ON "ScheduledTest"("scheduledAt");

-- CreateIndex
CREATE INDEX "ScheduledTest_status_idx" ON "ScheduledTest"("status");

-- AddForeignKey
ALTER TABLE "ScheduledTest" ADD CONSTRAINT "ScheduledTest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTest" ADD CONSTRAINT "ScheduledTest_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
