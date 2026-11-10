-- AlterTable
ALTER TABLE "replays" ADD COLUMN     "user_id" TEXT;

-- CreateIndex
CREATE INDEX "replays_user_id_created_at_idx" ON "replays"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "replays" ADD CONSTRAINT "replays_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
