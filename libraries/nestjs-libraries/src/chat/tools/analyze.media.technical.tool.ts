import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HttpException, Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class AnalyzeMediaTechnicalTool implements AgentToolInterface {
  constructor(private _mediaService: MediaService) {}
  name = 'analyzeMediaTechnicalTool';

  run() {
    return createTool({
      id: 'analyzeMediaTechnicalTool',
      description: `Run technical analysis on a Media Library item (dimensions, duration, mime, dominant color, fileSize) and backfill contentHash (SHA-256) when missing.
Use after upload or when listMediaTool shows contentHash is null and uniqueness/backfill is needed.
Does not invent editorial metadata (title/tags) — use updateMediaMetadataTool for that.`,
      mcp: {
        annotations: {
          title: 'Analyze Media Technical Metadata',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({
        id: z.string().describe('Media id from listMediaTool'),
      }),
      outputSchema: z.object({
        id: z.string().optional(),
        width: z.number().optional().nullable(),
        height: z.number().optional().nullable(),
        durationMs: z.number().optional().nullable(),
        mimeType: z.string().optional().nullable(),
        fileSize: z.number().optional().nullable(),
        type: z.string().optional().nullable(),
        dominantColor: z.string().optional().nullable(),
        contentHash: z.string().optional().nullable(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const org = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        );

        try {
          const updated = await this._mediaService.analyzeTechnicalMetadata(
            org.id,
            inputData.id
          );
          return {
            id: updated.id,
            width: updated.width ?? null,
            height: updated.height ?? null,
            durationMs: updated.durationMs ?? null,
            mimeType: updated.mimeType ?? null,
            fileSize: updated.fileSize ?? null,
            type: updated.type ?? null,
            dominantColor: updated.dominantColor ?? null,
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
                : 'Failed to analyze media technical metadata',
          };
        }
      },
    });
  }
}
