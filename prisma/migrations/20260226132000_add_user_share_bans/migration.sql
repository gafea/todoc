-- CreateTable
CREATE TABLE "UserShareBan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "blockerUserId" TEXT NOT NULL,
    "blockedUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserShareBan_blockerUserId_fkey" FOREIGN KEY ("blockerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserShareBan_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserShareBan_blockerUserId_blockedUserId_key" ON "UserShareBan"("blockerUserId", "blockedUserId");

-- CreateIndex
CREATE INDEX "UserShareBan_blockerUserId_idx" ON "UserShareBan"("blockerUserId");

-- CreateIndex
CREATE INDEX "UserShareBan_blockedUserId_idx" ON "UserShareBan"("blockedUserId");
