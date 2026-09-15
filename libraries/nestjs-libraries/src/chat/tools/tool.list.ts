import { IntegrationValidationTool } from '@gitroom/nestjs-libraries/chat/tools/integration.validation.tool';
import { IntegrationTriggerTool } from '@gitroom/nestjs-libraries/chat/tools/integration.trigger.tool';
import { IntegrationSchedulePostTool } from './integration.schedule.post';
import { GenerateVideoOptionsTool } from '@gitroom/nestjs-libraries/chat/tools/generate.video.options.tool';
import { VideoFunctionTool } from '@gitroom/nestjs-libraries/chat/tools/video.function.tool';
import { GenerateVideoTool } from '@gitroom/nestjs-libraries/chat/tools/generate.video.tool';
import { VideoStatusTool } from '@gitroom/nestjs-libraries/chat/tools/video.status.tool';
import { GenerateImageTool } from '@gitroom/nestjs-libraries/chat/tools/generate.image.tool';
import { IntegrationListTool } from '@gitroom/nestjs-libraries/chat/tools/integration.list.tool';
import { GroupListTool } from '@gitroom/nestjs-libraries/chat/tools/group.list.tool';
import { UploadFromUrlTool } from '@gitroom/nestjs-libraries/chat/tools/upload.from.url.tool';
import { PostsListTool } from '@gitroom/nestjs-libraries/chat/tools/posts.list.tool';
import { PostSettingsTool } from '@gitroom/nestjs-libraries/chat/tools/post.settings.tool';
import { ResetPostToDraftTool } from '@gitroom/nestjs-libraries/chat/tools/reset.post.to.draft.tool';
import { UpdatePostTool } from '@gitroom/nestjs-libraries/chat/tools/update.post.tool';
import { DeletePostTool } from '@gitroom/nestjs-libraries/chat/tools/delete.post.tool';
import { ListMediaTool } from '@gitroom/nestjs-libraries/chat/tools/list.media.tool';
import { ListMediaCategoriesTool } from '@gitroom/nestjs-libraries/chat/tools/list.media.categories.tool';
import { UpdateMediaMetadataTool } from '@gitroom/nestjs-libraries/chat/tools/update.media.metadata.tool';
import { AnalyzeMediaTechnicalTool } from '@gitroom/nestjs-libraries/chat/tools/analyze.media.technical.tool';

export const toolList = [
  IntegrationListTool,
  GroupListTool,
  IntegrationValidationTool,
  IntegrationTriggerTool,
  IntegrationSchedulePostTool,
  PostsListTool,
  PostSettingsTool,
  ResetPostToDraftTool,
  UpdatePostTool,
  DeletePostTool,
  ListMediaTool,
  ListMediaCategoriesTool,
  UpdateMediaMetadataTool,
  AnalyzeMediaTechnicalTool,
  GenerateVideoOptionsTool,
  VideoFunctionTool,
  GenerateVideoTool,
  VideoStatusTool,
  GenerateImageTool,
  UploadFromUrlTool,
];
