import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HttpException, Injectable } from '@nestjs/common';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

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
      err instanceof Error ? err.message : 'Failed to delete the post',
  };
};

@Injectable()
export class DeletePostTool implements AgentToolInterface {
  constructor(private _postsService: PostsService) {}
  name = 'deletePostTool';

  run() {
    return createTool({
      id: 'deletePostTool',
      mcp: {
        annotations: {
          title: 'Delete Draft Post',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      description: `
Delete a DRAFT post only. Scheduled (QUEUE) or failed (ERROR) posts must first be reset with resetPostToDraftTool.
Published posts and already-due scheduled posts are rejected — never offer to delete a live post through this tool.
If this tool returns that the post must be reset to draft, call resetPostToDraftTool (after user confirmation) and then retry.
Find the post first with postsListTool and pass its root "id" (never a comment id). Soft-deletes the whole group (post + comments/thread) and stops the publish workflow.
Always confirm the post id, channel, and publish time with the user before calling.
`,
      inputSchema: z.object({
        id: z.string().describe('Root post id from postsListTool'),
      }),
      outputSchema: z.object({
        output: z
          .object({
            deleted: z.boolean(),
            postId: z.string(),
            group: z.string(),
          })
          .or(z.object({ errors: z.string() })),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;

        try {
          const output = await this._postsService.deleteUnpublishedPost(
            organizationId,
            inputData.id
          );
          return { output };
        } catch (err) {
          return { output: toolError(err) };
        }
      },
    });
  }
}
