-- CreateTable
CREATE TABLE "replays" (
    "id" TEXT NOT NULL,
    "manage_token_hash" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "uploader_ip_hash" TEXT,
    "file_name" TEXT,
    "schema_version" INTEGER NOT NULL,
    "game_version" TEXT NOT NULL,
    "save_version" DOUBLE PRECISION NOT NULL,
    "map_name" TEXT,
    "map_size" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "players" JSONB NOT NULL,
    "data" BYTEA NOT NULL,
    "data_bytes" INTEGER NOT NULL,

    CONSTRAINT "replays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "replays_expires_at_idx" ON "replays"("expires_at");

-- CreateIndex
CREATE INDEX "replays_uploader_ip_hash_created_at_idx" ON "replays"("uploader_ip_hash", "created_at");
