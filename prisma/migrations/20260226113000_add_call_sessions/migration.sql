-- CreateTable
CREATE TABLE "CallSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "todoId" TEXT NOT NULL,
    "initiatorUserId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CallSession_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CallSession_initiatorUserId_fkey" FOREIGN KEY ("initiatorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CallSession_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CallSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "callSessionId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" DATETIME,
    CONSTRAINT "CallSignal_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CallSignal_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CallSignal_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
