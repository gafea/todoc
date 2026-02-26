-- CreateTable
CREATE TABLE "UserShareBan" (
    "id" TEXT NOT NULL,
    "blockerUserId" TEXT NOT NULL,
    "blockedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserShareBan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserShareBan_blockerUserId_blockedUserId_key" ON "UserShareBan"("blockerUserId", "blockedUserId");

-- CreateIndex
CREATE INDEX "UserShareBan_blockerUserId_idx" ON "UserShareBan"("blockerUserId");

-- CreateIndex
CREATE INDEX "UserShareBan_blockedUserId_idx" ON "UserShareBan"("blockedUserId");

-- AddForeignKey
ALTER TABLE "UserShareBan" ADD CONSTRAINT "UserShareBan_blockerUserId_fkey" FOREIGN KEY ("blockerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserShareBan" ADD CONSTRAINT "UserShareBan_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
