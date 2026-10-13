-- Postiz 2.24+ uses "Media"."status" for upload processing (processing|ready|failed).
-- The Media Library editorial state (draft|ready|archived) moves to "libraryStatus".
-- The copy runs once: it is keyed on the pre-split index, which is dropped afterwards.
ALTER TABLE "Media"
  ADD COLUMN IF NOT EXISTS "libraryStatus" TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS "processingError" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'Media_organizationId_status_idx'
  ) THEN
    UPDATE "Media"
    SET "libraryStatus" = "status"
    WHERE "status" IN ('draft', 'ready', 'archived');

    UPDATE "Media"
    SET "status" = 'ready'
    WHERE "status" IN ('draft', 'archived');

    DROP INDEX "Media_organizationId_status_idx";
  END IF;
END $$;

ALTER TABLE "Media" ALTER COLUMN "status" SET DEFAULT 'ready';

CREATE INDEX IF NOT EXISTS "Media_organizationId_libraryStatus_idx"
  ON "Media"("organizationId", "libraryStatus");
