import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

const mediaItemSchema = z.object({
  id: z.string(),
  name: z.string().optional().nullable(),
  originalName: z.string().optional().nullable(),
  path: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  alt: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  mimeType: z.string().optional().nullable(),
  fileSize: z.number().optional().nullable(),
  width: z.number().optional().nullable(),
  height: z.number().optional().nullable(),
  durationMs: z.number().optional().nullable(),
  contentHash: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  categoryName: z.string().optional().nullable(),
  tagIds: z.array(z.string()).optional(),
  tagNames: z.array(z.string()).optional(),
  people: z.array(z.string()).optional(),
  products: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  recommendedPlatforms: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  source: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  attribution: z.string().optional().nullable(),
  copyrightOwner: z.string().optional().nullable(),
  licenseType: z.string().optional().nullable(),
  licenseUrl: z.string().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  createdAt: z.string().optional().nullable(),
});

const mapMedia = (media: any) => ({
  id: media.id,
  name: media.name ?? null,
  originalName: media.originalName ?? null,
  path: media.path ?? null,
  title: media.title ?? null,
  description: media.description ?? null,
  alt: media.alt ?? null,
  status: media.status ?? null,
  type: media.type ?? null,
  mimeType: media.mimeType ?? null,
  fileSize: media.fileSize ?? null,
  width: media.width ?? null,
  height: media.height ?? null,
  durationMs: media.durationMs ?? null,
  contentHash: media.contentHash ?? null,
  categoryId: media.categoryId ?? media.category?.id ?? null,
  categoryName: media.category?.name ?? null,
  tagIds: (media.tags || []).map((row: any) => row.tagId || row.tag?.id).filter(Boolean),
  tagNames: (media.tags || []).map((row: any) => row.tag?.name).filter(Boolean),
  people: media.people || [],
  products: media.products || [],
  keywords: media.keywords || [],
  recommendedPlatforms: media.recommendedPlatforms || [],
  languages: media.languages || [],
  source: media.source ?? null,
  sourceUrl: media.sourceUrl ?? null,
  attribution: media.attribution ?? null,
  copyrightOwner: media.copyrightOwner ?? null,
  licenseType: media.licenseType ?? null,
  licenseUrl: media.licenseUrl ?? null,
  expiresAt: media.expiresAt
    ? new Date(media.expiresAt).toISOString()
    : null,
  createdAt: media.createdAt
    ? new Date(media.createdAt).toISOString()
    : null,
});

@Injectable()
export class ListMediaTool implements AgentToolInterface {
  constructor(private _mediaService: MediaService) {}
  name = 'listMediaTool';

  run() {
    return createTool({
      id: 'listMediaTool',
      description: `List or look up items in the Media Library so you can enrich metadata.
- Pass "id" to fetch one media item.
- Otherwise returns a paginated list (18 per page) with optional search and filters (status, categoryId, type, tagIds).
Use this before updateMediaMetadataTool to find the media id and see current title/tags/status/contentHash.`,
      mcp: {
        annotations: {
          title: 'List Media Library',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({
        id: z
          .string()
          .optional()
          .describe('Optional media id to fetch a single item'),
        page: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Page number starting at 1 (ignored when id is set)'),
        search: z
          .string()
          .optional()
          .describe(
            'Search title, originalName, description, alt, source, attribution, copyrightOwner'
          ),
        status: z
          .enum(['draft', 'ready', 'archived'])
          .optional()
          .describe('Filter by readiness status'),
        categoryId: z.string().optional().describe('Filter by media category id'),
        type: z
          .string()
          .optional()
          .describe('Filter by media type, e.g. image or video'),
        tagIds: z
          .array(z.string())
          .optional()
          .describe('Filter by one or more shared tag ids'),
      }),
      outputSchema: z.object({
        pages: z.number().optional(),
        results: z.array(mediaItemSchema).optional(),
        media: mediaItemSchema.optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const org = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        );

        try {
          if (inputData.id) {
            const media = await this._mediaService.getMediaById(
              inputData.id,
              org.id
            );
            if (!media || media.deletedAt) {
              return { error: 'Media not found' };
            }
            return { media: mapMedia(media) };
          }

          const listed = await this._mediaService.getMedia(
            org.id,
            inputData.page || 1,
            inputData.search,
            {
              status: inputData.status,
              categoryId: inputData.categoryId,
              type: inputData.type,
              tagIds: inputData.tagIds,
            }
          );

          return {
            pages: listed.pages,
            results: (listed.results || []).map(mapMedia),
          };
        } catch (err) {
          return {
            error:
              err instanceof Error
                ? err.message
                : 'Failed to list media library items',
          };
        }
      },
    });
  }
}
