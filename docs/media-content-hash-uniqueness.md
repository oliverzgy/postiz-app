# Media Library — content uniqueness (`contentHash`)

## Purpose

Prevent the same binary from being registered twice in one organization’s Media Library. Uniqueness is based on **file content**, not filename or upload path.

## Rule

| Field | Meaning |
|-------|---------|
| `Media.contentHash` | SHA-256 hex digest of the raw file bytes |
| Scope | Per `organizationId` |
| Active rows only | Soft-deleted media (`deletedAt` set) do **not** block a later re-upload of the same bytes |

Database enforcement (partial unique index):

```sql
UNIQUE (organizationId, contentHash)
WHERE deletedAt IS NULL AND contentHash IS NOT NULL
```

Migration: `libraries/nestjs-libraries/src/database/prisma/migrations/20260904120000_media_content_hash_unique/`.

## Upload flow

1. Bytes are hashed (`crypto.createHash('sha256')`) in `MediaService.saveFile`.
2. If an active row with the same hash exists → **HTTP 409** `ConflictException` with:

```json
{
  "statusCode": 409,
  "code": "MEDIA_DUPLICATE",
  "message": "This media already exists in the library",
  "existing": {
    "id": "...",
    "name": "...",
    "originalName": "...",
    "path": "...",
    "title": "...",
    "contentHash": "..."
  }
}
```

3. Otherwise the row is created with `contentHash` set, then technical analyze may run (reuse the same buffer when available).
4. Concurrent inserts that race the app check still hit the unique index (`P2002`) and are mapped to the same 409 payload.

All save entry points go through `saveFile` (`upload-server`, `upload-simple`, `save-media`, R2 multipart complete, AI video save).

## UI

- Uploader (`new.uploader.tsx`) surfaces duplicates with a warning toast: **Already in library: …**
- Media settings shows a read-only **Content fingerprint (SHA-256)** when `contentHash` is present.

## Existing assets (no hash yet)

Rows created before this change may have `contentHash = null`. They are **not** covered by the unique index until hashed.

- Click **Analyze technical metadata** on an item (or any path that calls `analyzeTechnicalMetadata`) to backfill `contentHash`.
- Until backfilled, a re-upload of the same bytes can still create a second row; after backfill, further duplicates are rejected.

Optional ops note: after deploy, batch-analyze important libraries if you need uniqueness to apply to historical files immediately.

## What is *not* unique

- Same visual with different encoding / compression / EXIF strip → **different** hash (allowed).
- Same filename, different bytes → allowed.
- Cross-organization duplicates → allowed (hash is scoped per org).

## Related code

| Area | Path |
|------|------|
| Schema | `libraries/nestjs-libraries/src/database/prisma/schema.prisma` (`Media.contentHash`) |
| Service | `libraries/nestjs-libraries/src/database/prisma/media/media.service.ts` |
| Repository | `libraries/nestjs-libraries/src/database/prisma/media/media.repository.ts` (`findActiveByContentHash`) |
| Upload API | `apps/backend/src/api/routes/media.controller.ts` |
| Uploader UX | `apps/frontend/src/components/media/new.uploader.tsx` |
| Settings UX | `apps/frontend/src/components/launches/helpers/media.settings.component.tsx` |
| MCP metadata | [media-mcp-metadata.md](./media-mcp-metadata.md) (`analyzeMediaTechnicalTool` can backfill `contentHash`) |
