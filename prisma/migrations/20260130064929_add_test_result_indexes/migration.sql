-- CreateIndex
CREATE INDEX "TestResult_status_idx" ON "TestResult"("status");

-- CreateIndex
CREATE INDEX "TestResult_userId_status_idx" ON "TestResult"("userId", "status");
