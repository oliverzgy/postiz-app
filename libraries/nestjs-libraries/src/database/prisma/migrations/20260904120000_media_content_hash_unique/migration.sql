-- Content-hash uniqueness for Media Library (active rows only).
ALTER TABLE "Media"
  ADD COLUMN IF NOT EXISTS "contentHash" TEXT;

CREATE INDEX IF NOT EXISTS "Media_organizationId_contentHash_idx"
  ON "Media"("organizationId", "contentHash");

-- Soft-deleted rows may keep the same hash so the file can be re-uploaded later.
CREATE UNIQUE INDEX IF NOT EXISTS "Media_organizationId_contentHash_active_key"
  ON "Media"("organizationId", "contentHash")
  WHERE "deletedAt" IS NULL AND "contentHash" IS NOT NULL;
