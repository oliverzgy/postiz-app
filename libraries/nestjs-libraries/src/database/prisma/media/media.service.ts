import { HttpException, Injectable } from '@nestjs/common';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { generationError } from '@gitroom/nestjs-libraries/openai/generation.error';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { Organization, Prisma } from '@prisma/client';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { TemporalService } from 'nestjs-temporal-core';
import { TypedSearchAttributes } from '@temporalio/common';
import { organizationId } from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import sharp from 'sharp';
import { createHash } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, normalize } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

@Injectable()
export class MediaService {
  private storage = UploadFactory.createStorage();

  constructor(
    private _mediaRepository: MediaRepository,
    private _openAi: OpenaiService,
    private _subscriptionService: SubscriptionService,
    private _videoManager: VideoManager,
    private _temporalService: TemporalService
  ) {}

  async deleteMedia(org: string, id: string) {
    return this._mediaRepository.deleteMedia(org, id);
  }

  getMediaById(id: string, org?: string) {
    return this._mediaRepository.getMediaById(id, org);
  }

  async generateImage(
    prompt: string,
    org: Organization,
    generatePromptFirst?: boolean
  ) {
    try {
      const generating = await this._subscriptionService.useCredit(
        org,
        'ai_images',
        async () => {
          if (generatePromptFirst) {
            prompt = await this._openAi.generatePromptForPicture(prompt);
            console.log('Prompt:', prompt);
          }
          return this._openAi.generateImage(prompt);
        }
      );

      return generating;
    } catch (err) {
      throw generationError(err);
    }
  }

  private hashContent(buffer: Buffer) {
    return createHash('sha256').update(buffer).digest('hex');
  }

  async saveFile(
    org: string,
    fileName: string,
    filePath: string,
    originalName?: string,
    knownBuffer?: Buffer
  ) {
    const buffer = knownBuffer ?? (await this.loadMediaBuffer(filePath));
    const contentHash = this.hashContent(buffer);
    const existing = await this._mediaRepository.findActiveByContentHash(
      org,
      contentHash
    );
    // Same bytes already in the library: reuse the row so upload still
    // succeeds (UI / launch flows get a media object) without a second insert.
    if (existing) {
      return { ...existing, reused: true as const };
    }

    try {
      const media = await this._mediaRepository.saveFile(
        org,
        fileName,
        filePath,
        originalName,
        contentHash
      );
      void this.analyzeTechnicalMetadata(org, media.id, buffer).catch(
        () => undefined
      );
      return media;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const raced = await this._mediaRepository.findActiveByContentHash(
          org,
          contentHash
        );
        if (raced) {
          return { ...raced, reused: true as const };
        }
      }
      throw err;
    }
  }

  getMedia(org: string, page: number, search?: string, filters?: Record<string, string | string[] | undefined>) {
    return this._mediaRepository.getMedia(org, page, search, filters);
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._mediaRepository.saveMediaInformation(org, data);
  }

  getCategories(org: string) { return this._mediaRepository.getCategories(org); }
  createCategory(org: string, name: string, color?: string) { return this._mediaRepository.createCategory(org, name, color); }
  updateCategory(org: string, id: string, name: string, color?: string) { return this._mediaRepository.updateCategory(org, id, name, color); }
  deleteCategory(org: string, id: string) { return this._mediaRepository.deleteCategory(org, id); }

  private async loadMediaBuffer(path: string) {
    // Prefer the known-safe /uploads/ disk prefix (local store URLs often look
    // like http://127.0.0.1:4007/uploads/... and are unreachable from inside
    // the container). Never read arbitrary absolute filesystem paths.
    const uploadsIndex = path.indexOf('/uploads/');
    if (uploadsIndex >= 0) {
      const localPath = normalize(path.slice(uploadsIndex));
      if (localPath === '/uploads' || localPath.startsWith('/uploads/')) {
        try {
          return await readFile(localPath);
        } catch {
          // Fall through to HTTP fetch for remote/object-storage paths.
        }
      }
    }
    const url = path.startsWith('http')
      ? path
      : `${process.env.MAIN_URL || 'http://127.0.0.1:5000'}${path}`;
    if (!(await isSafePublicHttpsUrl(url))) {
      throw new Error('Unsafe media URL');
    }
    const response = await fetch(url, {
      // @ts-ignore — undici option, not in lib.dom fetch types
      dispatcher: ssrfSafeDispatcher,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch media (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async analyzeTechnicalMetadata(org: string, id: string, knownBuffer?: Buffer) {
    const media = await this._mediaRepository.getMediaById(id, org);
    if (!media) throw new HttpException('Media not found', 404);
    const buffer = knownBuffer ?? (await this.loadMediaBuffer(media.path));
    const contentHash = media.contentHash || this.hashContent(buffer);
    const extension = (media.originalName || media.name).split('.').pop()?.toLowerCase();
    const isVideo = ['mp4', 'mov', 'webm', 'mkv'].includes(extension || '');
    const base = {
      fileSize: buffer.length,
      type: isVideo ? 'video' : 'image',
      mimeType: isVideo ? `video/${extension === 'mov' ? 'quicktime' : extension || 'mp4'}` : undefined,
      contentHash,
    };
    if (!isVideo) {
      const image = sharp(buffer);
      const [metadata, stats] = await Promise.all([image.metadata(), image.stats()]);
      const color = stats.dominant ? `#${[stats.dominant.r, stats.dominant.g, stats.dominant.b].map((v) => v.toString(16).padStart(2, '0')).join('')}` : undefined;
      return this._mediaRepository.updateTechnicalMetadata(org, id, { ...base, width: metadata.width || null, height: metadata.height || null, dominantColor: color || null, mimeType: metadata.format ? `image/${metadata.format}` : null });
    }
    const dir = await mkdtemp(join(tmpdir(), 'postiz-media-'));
    const file = join(dir, `source.${extension || 'mp4'}`);
    try {
      await writeFile(file, buffer);
      const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,duration', '-of', 'json', file]);
      const stream = JSON.parse(stdout).streams?.[0] || {};
      return this._mediaRepository.updateTechnicalMetadata(org, id, { ...base, width: Number(stream.width) || null, height: Number(stream.height) || null, durationMs: stream.duration ? Math.round(Number(stream.duration) * 1000) : null });
    } finally { await rm(dir, { recursive: true, force: true }); }
  }

  async suggestMetadata(org: string, id: string) {
    if (!process.env.OPENAI_API_KEY) throw new HttpException('AI analysis is not configured', 503);
    const media = await this._mediaRepository.getMediaById(id, org);
    if (!media) throw new HttpException('Media not found', 404);
    return this._openAi.analyzeMedia(await this.loadMediaBuffer(media.path), media.mimeType || 'image/jpeg');
  }

  getVideoOptions() {
    return this._videoManager.getAllVideos();
  }

  async generateVideoAllowed(org: Organization, type: string) {
    const video = this._videoManager.getVideoByName(type);
    if (!video) {
      throw new Error(`Video type ${type} not found`);
    }

    if (!video.trial && org.isTrailing) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    return true;
  }

  private async validateVideoRequest(org: Organization, body: VideoDto) {
    const totalCredits = await this._subscriptionService.checkCredits(
      org,
      'ai_videos'
    );

    if (totalCredits.credits <= 0) {
      throw new SubscriptionException({
        action: AuthorizationActions.Create,
        section: Sections.VIDEOS_PER_MONTH,
      });
    }

    const video = this._videoManager.getVideoByName(body.type);
    if (!video) {
      throw new Error(`Video type ${body.type} not found`);
    }

    if (!video.trial && org.isTrailing) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    await video.instance.processAndValidate(body.customParams);
    return video;
  }

  async generateVideo(org: Organization, body: VideoDto) {
    try {
      const video = await this.validateVideoRequest(org, body);

      return await this._subscriptionService.useCredit(
        org,
        'ai_videos',
        async () => {
          const loadedData = await video.instance.process(
            body.output,
            body.customParams
          );

          const file = await this.storage.uploadSimple(loadedData);
          return this.saveFile(org.id, file.split('/').pop(), file);
        }
      );
    } catch (err) {
      throw generationError(err);
    }
  }

  // Generating a video takes minutes, longer than an MCP request can stay open,
  // so the generation runs in a workflow and the caller polls its status by job id
  async startGenerateVideo(org: Organization, body: VideoDto) {
    // validated here as well as in the workflow so bad input fails before a job exists
    try {
      await this.validateVideoRequest(org, body);
    } catch (err) {
      throw generationError(err);
    }

    const client = this._temporalService.client.getRawClient();
    if (!client) {
      throw new HttpException('Video generation is not available', 503);
    }

    const jobId = `video_${org.id}_${makeId(10)}`;
    await client.workflow.start('generateVideoWorkflow', {
      workflowId: jobId,
      taskQueue: 'main',
      args: [
        {
          organizationId: org.id,
          body,
        },
      ],
      typedSearchAttributes: new TypedSearchAttributes([
        {
          key: organizationId,
          value: org.id,
        },
      ]),
    });

    return { jobId };
  }

  async getGenerateVideoStatus(
    org: Organization,
    jobId: string
  ): Promise<{
    status: 'pending' | 'completed' | 'failed';
    id?: string;
    path?: string;
    error?: string;
  }> {
    // the job id carries the organization, so one org can't poll another's job
    if (!jobId.startsWith(`video_${org.id}_`)) {
      throw new HttpException('Video job not found', 404);
    }

    const handle = await this._temporalService.client.getWorkflowHandle(jobId);
    let status: string;
    try {
      status = (await handle.describe()).status.name;
    } catch (err) {
      throw new HttpException('Video job not found', 404);
    }

    if (status === 'RUNNING') {
      return { status: 'pending' };
    }

    try {
      const media = (await handle.result()) as Awaited<
        ReturnType<MediaService['saveFile']>
      >;
      return { status: 'completed', id: media.id, path: media.path };
    } catch (err) {
      // the workflow failure wraps the activity failure which wraps the actual error
      let cause: any = err;
      while (cause?.cause && cause.cause !== cause) {
        cause = cause.cause;
      }
      return {
        status: 'failed',
        error: cause?.message || String(err),
      };
    }
  }

  async videoFunction(identifier: string, functionName: string, body: any) {
    const video = this._videoManager.getVideoByName(identifier);
    if (!video) {
      throw new Error(`Video with identifier ${identifier} not found`);
    }

    // @ts-ignore
    const functionToCall = video.instance[functionName];
    if (
      typeof functionToCall !== 'function' ||
      this._videoManager.checkAvailableVideoFunction(functionToCall)
    ) {
      throw new HttpException(
        `Function ${functionName} not found on video instance`,
        400
      );
    }

    return functionToCall(body);
  }
}
