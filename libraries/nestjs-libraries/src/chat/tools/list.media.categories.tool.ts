import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class ListMediaCategoriesTool implements AgentToolInterface {
  constructor(private _mediaService: MediaService) {}
  name = 'listMediaCategoriesTool';

  run() {
    return createTool({
      id: 'listMediaCategoriesTool',
      description: `List Media Library categories for the organization.
Use this to resolve a categoryId before calling updateMediaMetadataTool.
Returns id, name, and color for each active category.`,
      mcp: {
        annotations: {
          title: 'List Media Categories',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({
        reasoning: z
          .string()
          .optional()
          .describe('Optional short reason for listing categories'),
      }),
      outputSchema: z.object({
        categories: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              color: z.string().optional().nullable(),
            })
          )
          .optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const org = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        );

        try {
          const categories = await this._mediaService.getCategories(org.id);
          return {
            categories: (categories || []).map((category: any) => ({
              id: category.id,
              name: category.name,
              color: category.color ?? null,
            })),
          };
        } catch (err) {
          return {
            error:
              err instanceof Error
                ? err.message
                : 'Failed to list media categories',
          };
        }
      },
    });
  }
}
