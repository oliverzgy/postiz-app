import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HttpException, Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class UpdateMediaMetadataTool implements AgentToolInterface {
  constructor(private _mediaService: MediaService) {}
  name = 'updateMediaMetadataTool';

  run() {
    return createTool({
      id: 'updateMediaMetadataTool',
      description: `Update searchable Media Library metadata for an existing media item.
Only the fields you pass are changed. Use listMediaTool first to get the media id, and listMediaCategoriesTool when setting categoryId.
Typical enrichment: title, description, keywords, people, products, status (draft|ready|archived), tags, license, source, languages, recommendedPlatforms.
Does not upload a new file and does not change contentHash. Returns the updated media summary or { error }.`,
      mcp: {
        annotations: {
          title: 'Update Media Metadata',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({
        id: z.string().describe('Media id from listMediaTool'),
        alt: z.string().optional().describe('Accessibility alt text'),
        thumbnail: z
          .string()
          .url()
          .optional()
          .describe('Optional thumbnail URL already hosted by Postiz'),
        thumbnailTimestamp: z
          .number()
          .optional()
          .describe('Video thumbnail timestamp in seconds'),
        title: z.string().optional(),
        description: z.string().optional(),
        categoryId: z
          .string()
          .nullable()
          .optional()
          .describe('Media category id, or null to clear'),
        tagIds: z
          .array(z.string())
          .optional()
          .describe('Replace shared tag assignments with these tag ids'),
        people: z.array(z.string()).optional(),
        products: z.array(z.string()).optional(),
        keywords: z.array(z.string()).optional(),
        status: z.enum(['draft', 'ready', 'archived']).optional(),
        focusX: z.number().min(0).max(1).nullable().optional(),
        focusY: z.number().min(0).max(1).nullable().optional(),
        recommendedPlatforms: z
          .array(z.string())
          .optional()
          .describe('Platform identifiers this asset fits, e.g. facebook, youtube'),
        languages: z
          .array(z.string())
          .optional()
          .describe('BCP-47 language tags, e.g. zh-HK, en'),
        source: z.string().optional(),
        sourceUrl: z.string().url().optional(),
        attribution: z.string().optional(),
        copyrightOwner: z.string().optional(),
        licenseType: z
          .enum([
            'unknown',
            'owned',
            'licensed',
            'creative_commons',
            'third_party',
            'public_domain',
          ])
          .optional(),
        licenseUrl: z.string().url().optional(),
        expiresAt: z
          .string()
          .nullable()
          .optional()
          .describe('ISO date string, or null to clear expiry'),
      }),
      outputSchema: z.object({
        id: z.string().optional(),
        title: z.string().optional().nullable(),
        status: z.string().optional().nullable(),
        categoryId: z.string().optional().nullable(),
        tagIds: z.array(z.string()).optional(),
        keywords: z.array(z.string()).optional(),
        contentHash: z.string().optional().nullable(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const org = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        );

        try {
          const existing = await this._mediaService.getMediaById(
            inputData.id,
            org.id
          );
          if (!existing || existing.deletedAt) {
            return { error: 'Media not found' };
          }

          const updated = await this._mediaService.saveMediaInformation(org.id, {
            id: inputData.id,
            ...(inputData.alt !== undefined ? { alt: inputData.alt } : {}),
            ...(inputData.thumbnail !== undefined
              ? { thumbnail: inputData.thumbnail }
              : {}),
            ...(inputData.thumbnailTimestamp !== undefined
              ? { thumbnailTimestamp: inputData.thumbnailTimestamp }
              : {}),
            ...(inputData.title !== undefined ? { title: inputData.title } : {}),
            ...(inputData.description !== undefined
              ? { description: inputData.description }
              : {}),
            ...(inputData.categoryId !== undefined
              ? { categoryId: inputData.categoryId }
              : {}),
            ...(inputData.tagIds !== undefined ? { tagIds: inputData.tagIds } : {}),
            ...(inputData.people !== undefined ? { people: inputData.people } : {}),
            ...(inputData.products !== undefined
              ? { products: inputData.products }
              : {}),
            ...(inputData.keywords !== undefined
              ? { keywords: inputData.keywords }
              : {}),
            ...(inputData.status !== undefined ? { status: inputData.status } : {}),
            ...(inputData.focusX !== undefined ? { focusX: inputData.focusX } : {}),
            ...(inputData.focusY !== undefined ? { focusY: inputData.focusY } : {}),
            ...(inputData.recommendedPlatforms !== undefined
              ? { recommendedPlatforms: inputData.recommendedPlatforms }
              : {}),
            ...(inputData.languages !== undefined
              ? { languages: inputData.languages }
              : {}),
            ...(inputData.source !== undefined ? { source: inputData.source } : {}),
            ...(inputData.sourceUrl !== undefined
              ? { sourceUrl: inputData.sourceUrl }
              : {}),
            ...(inputData.attribution !== undefined
              ? { attribution: inputData.attribution }
              : {}),
            ...(inputData.copyrightOwner !== undefined
              ? { copyrightOwner: inputData.copyrightOwner }
              : {}),
            ...(inputData.licenseType !== undefined
              ? { licenseType: inputData.licenseType }
              : {}),
            ...(inputData.licenseUrl !== undefined
              ? { licenseUrl: inputData.licenseUrl }
              : {}),
            ...(inputData.expiresAt !== undefined
              ? { expiresAt: inputData.expiresAt }
              : {}),
          });

          return {
            id: updated.id,
            title: updated.title ?? null,
            status: updated.status ?? null,
            categoryId: updated.categoryId ?? null,
            tagIds: (updated.tags || []).map((row: any) => row.tagId),
            keywords: updated.keywords || [],
            contentHash: updated.contentHash ?? null,
          };
        } catch (err) {
          if (err instanceof HttpException) {
            const response = err.getResponse();
            if (typeof response === 'string') {
              return { error: response };
            }
            if (response && typeof response === 'object' && 'message' in response) {
              const message = (response as { message?: string | string[] }).message;
              return {
                error: Array.isArray(message)
                  ? message.join(', ')
                  : message || err.message,
              };
            }
            return { error: err.message };
          }
          return {
            error:
              err instanceof Error
                ? err.message
                : 'Failed to update media metadata',
          };
        }
      },
    });
  }
}
