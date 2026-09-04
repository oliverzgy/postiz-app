# Media Library — MCP metadata tools

## Purpose

Let MCP / Copilot agents **list** Media Library items and **enrich editorial metadata** without opening the Admin UI. Technical fingerprinting (`contentHash`) can also be backfilled via analyze.

These tools are registered in `libraries/nestjs-libraries/src/chat/tools/tool.list.ts` and appear on the Postiz MCP endpoint after restart.

## Tools

| Tool | Role |
|------|------|
| `listMediaTool` | List (paginated) or fetch one item by `id`. Optional filters: `search`, `status`, `categoryId`, `type`, `tagIds`. |
| `listMediaCategoriesTool` | List active categories (`id`, `name`, `color`) for `categoryId`. |
| `updateMediaMetadataTool` | Patch metadata fields on an existing media id (only fields you pass). |
| `analyzeMediaTechnicalTool` | Fill width/height/duration/mime/fileSize/dominantColor and backfill `contentHash`. |

Upload-only tools remain separate: `uploadFromUrlTool`, `generateImageTool`, `generateVideoTool`.

## Typical agent flow

1. `listMediaTool` with `search` or `id` → get media id and current fields.
2. Optional: `listMediaCategoriesTool` → pick `categoryId`.
3. `updateMediaMetadataTool` with id + fields (`title`, `description`, `keywords`, `people`, `products`, `status`, `tagIds`, license/source, `languages`, `recommendedPlatforms`, …).
4. Optional: `analyzeMediaTechnicalTool` if `contentHash` is null or tech fields are empty.

## `updateMediaMetadataTool` fields

Aligned with `SaveMediaInformationDto` / Media settings UI:

- Editorial: `title`, `description`, `alt`, `keywords`, `people`, `products`
- Taxonomy: `categoryId` (or `null` to clear), `tagIds` (replaces assignments)
- Status: `draft` \| `ready` \| `archived`
- Rights: `source`, `sourceUrl`, `attribution`, `copyrightOwner`, `licenseType`, `licenseUrl`, `expiresAt`
- Placement: `recommendedPlatforms`, `languages`, `focusX` / `focusY`
- Thumbnail: `thumbnail`, `thumbnailTimestamp`

Does **not** change file bytes or `contentHash` (use analyze for hash backfill).

## Errors

Tools return `{ error: string }` on failure (missing media, invalid category/tags, analyze failure) instead of throwing, so MCP clients can recover.

## Deploy note

Requires the custom Postiz image that includes these tools (feature branch). Restart / recreate the `postiz` container after deploy so MCP reloads the tool list. Cursor (or other MCP clients) may need a reconnect to see new tools.

## Related

- Uniqueness: [media-content-hash-uniqueness.md](./media-content-hash-uniqueness.md)
- UI settings: `apps/frontend/src/components/launches/helpers/media.settings.component.tsx`
- Service: `libraries/nestjs-libraries/src/database/prisma/media/media.service.ts`
