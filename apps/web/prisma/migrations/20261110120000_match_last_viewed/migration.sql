-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "last_viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "matches_last_viewed_at_idx" ON "matches"("last_viewed_at");
