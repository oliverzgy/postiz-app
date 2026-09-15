import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HttpException, Injectable } from '@nestjs/common';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import {
  ValidUrlExtension,
  ValidUrlPath,
} from '@gitroom/helpers/utils/valid.url.path';

const validUrlExtension = new ValidUrlExtension();
const validUrlPath = new ValidUrlPath();

const attachmentUrl = z
  .string()
  .refine((url) => validUrlPath.validate(url, {} as any), {
    message: validUrlPath.defaultMessage({} as any),
  })
  .refine((url) => validUrlExtension.validate(url, {} as any), {
    message: validUrlExtension.defaultMessage({} as any),
  });

const toolError = (err: unknown) => {
  if (err instanceof HttpException) {
    const response = err.getResponse();
    if (typeof response === 'string') {
      return { errors: response };
    }
    if (response && typeof response === 'object' && 'message' in response) {
      const message = (response as { message?: string | string[] }).message;
      return {
        errors: Array.isArray(message)
          ? message.join(', ')
          : message || err.message,
      };
    }
    return { errors: err.message };
  }
  return {
    errors:
      err instanceof Error ? err.message : 'Failed to update the post',
  };
};

@Injectable()
export class UpdatePostTool implements AgentToolInterface {
  constructor(private _postsService: PostsService) {}
  name = 'updatePostTool';

  run() {
    return createTool({
      id: 'updatePostTool',
      mcp: {
        annotations: {
          title: 'Update Draft Post',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      description: `
Update a DRAFT post only. Scheduled (QUEUE) or failed (ERROR) posts must first be reset with resetPostToDraftTool.
Published posts and already-due scheduled posts are rejected — do not retry those; tell the user to edit them in the Postiz app if they must.
If this tool returns that the post must be reset to draft, call resetPostToDraftTool (after user confirmation) and then retry.
Find the post first with postsListTool and pass its root "id" (never a comment id).
Only the fields you pass change. Use "content" / "attachments" for the first item, or "postsAndComments" to replace the whole thread/comments list.
"settings" are merged like postSettingsTool (integrationSchema [input:settings]).
Confirm the post id, new text, date, and channel with the user before calling.
Do not use schedulePostTool to edit an existing post (that would create a duplicate).
`,
      inputSchema: z.object({
        id: z.string().describe('Root post id from postsListTool'),
        date: z
          .string()
          .optional()
          .describe('New publish time in UTC, for example 2026-09-20T10:00:00'),
        content: z
          .string()
          .optional()
          .describe(
            'New HTML for the first post item. Each line in <p>. Tags: h1, h2, h3, u, strong, li, ul, p (not u+strong together)'
          ),
        attachments: z
          .array(attachmentUrl)
          .optional()
          .describe('Replacement image/video URLs for the first post item'),
        postsAndComments: z
          .array(
            z.object({
              content: z.string(),
              attachments: z.array(attachmentUrl).optional(),
            })
          )
          .optional()
          .describe(
            'Replace the full post + comments/thread. First item is the post.'
          ),
        settings: z
          .array(
            z.object({
              key: z.string(),
              value: z.any(),
            })
          )
          .optional()
          .describe(
            'Settings keys to merge. Relies on integrationSchema [input:settings]'
          ),
      }),
      outputSchema: z.object({
        output: z
          .object({
            postId: z.string(),
            publishDate: z.string(),
            state: z.string(),
          })
          .or(z.object({ errors: z.string() })),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;

        const settings = (inputData.settings || []).reduce(
          (acc: Record<string, any>, item: { key: string; value: any }) => ({
            ...acc,
            [item.key]: item.value,
          }),
          {} as Record<string, any>
        );

        try {
          const output = await this._postsService.updateUnpublishedPost(
            organizationId,
            inputData.id,
            {
              ...(inputData.date !== undefined ? { date: inputData.date } : {}),
              ...(inputData.content !== undefined
                ? { content: inputData.content }
                : {}),
              ...(inputData.attachments !== undefined
                ? { attachments: inputData.attachments }
                : {}),
              ...(inputData.postsAndComments !== undefined
                ? { postsAndComments: inputData.postsAndComments }
                : {}),
              ...(inputData.settings !== undefined ? { settings } : {}),
            },
            'MCP'
          );
          return { output };
        } catch (err) {
          return { output: toolError(err) };
        }
      },
    });
  }
}
