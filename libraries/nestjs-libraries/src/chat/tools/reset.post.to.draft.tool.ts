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
      err instanceof Error ? err.message : 'Failed to reset the post to draft',
  };
};

@Injectable()
export class ResetPostToDraftTool implements AgentToolInterface {
  constructor(private _postsService: PostsService) {}
  name = 'resetPostToDraftTool';

  run() {
    return createTool({
      id: 'resetPostToDraftTool',
      mcp: {
        annotations: {
          title: 'Reset Unpublished Post To Draft',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      description: `
Reset an unpublished post (QUEUE or ERROR) to DRAFT so it can then be edited with updatePostTool / postSettingsTool or deleted with deletePostTool.
This cancels the scheduled publish workflow. Already-draft posts succeed with alreadyDraft: true.
Published posts and already-due scheduled posts are rejected.
Find the post first with postsListTool and pass its root "id". Confirm with the user before un-scheduling.
`,
      inputSchema: z.object({
        id: z.string().describe('Root post id from postsListTool'),
      }),
      outputSchema: z.object({
        output: z
          .object({
            postId: z.string(),
            state: z.string(),
            alreadyDraft: z.boolean(),
          })
          .or(z.object({ errors: z.string() })),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;

        try {
          const output = await this._postsService.resetUnpublishedPostToDraft(
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
