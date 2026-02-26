-- CreateTable
CREATE TABLE "CallSession" (
    "id" TEXT NOT NULL,
    "todoId" TEXT NOT NULL,
    "initiatorUserId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallSignal" (
    "id" TEXT NOT NULL,
    "callSessionId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "CallSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CallSession_todoId_key" ON "CallSession"("todoId");

-- CreateIndex
CREATE INDEX "CallSession_initiatorUserId_idx" ON "CallSession"("initiatorUserId");

-- CreateIndex
CREATE INDEX "CallSession_recipientUserId_idx" ON "CallSession"("recipientUserId");

-- CreateIndex
CREATE INDEX "CallSession_status_idx" ON "CallSession"("status");

-- CreateIndex
CREATE INDEX "CallSignal_callSessionId_idx" ON "CallSignal"("callSessionId");

-- CreateIndex
CREATE INDEX "CallSignal_toUserId_deliveredAt_idx" ON "CallSignal"("toUserId", "deliveredAt");

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_initiatorUserId_fkey" FOREIGN KEY ("initiatorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSignal" ADD CONSTRAINT "CallSignal_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSignal" ADD CONSTRAINT "CallSignal_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSignal" ADD CONSTRAINT "CallSignal_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
