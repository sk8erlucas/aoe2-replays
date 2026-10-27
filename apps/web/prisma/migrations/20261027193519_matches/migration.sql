-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "source_profile_id" TEXT NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schema_version" INTEGER NOT NULL,
    "game_version" TEXT NOT NULL,
    "save_version" DOUBLE PRECISION NOT NULL,
    "map_name" TEXT,
    "map_size" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "players" JSONB NOT NULL,
    "data" BYTEA NOT NULL,
    "data_bytes" INTEGER NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "matches_imported_at_idx" ON "matches"("imported_at");
