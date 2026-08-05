-- CreateEnum
CREATE TYPE "TopicCategory" AS ENUM ('TUTORIAL', 'TIPS', 'NEWS', 'MISTAKES', 'COMPARISON', 'LIST', 'BEGINNER', 'ADVANCED');

-- CreateEnum
CREATE TYPE "TopicStatus" AS ENUM ('PLANNED', 'USED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'RESEARCHING', 'SCRIPTING', 'VOICING', 'SOURCING_MEDIA', 'RENDERING', 'READY', 'PUBLISHING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "RenderStatus" AS ENUM ('PENDING', 'RENDERING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "MediaProviderName" AS ENUM ('PEXELS', 'PIXABAY');

-- CreateEnum
CREATE TYPE "MediaAssetType" AS ENUM ('VIDEO', 'IMAGE');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PromptPurpose" AS ENUM ('TOPIC', 'RESEARCH', 'SCRIPT', 'CAPTION', 'HASHTAGS');

-- CreateEnum
CREATE TYPE "SchedulerJobStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "postingFrequency" TEXT NOT NULL DEFAULT 'daily',
    "videoDurationSeconds" INTEGER NOT NULL DEFAULT 45,
    "writingStyle" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL DEFAULT '0 9 * * *',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "envPrefix" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" TEXT NOT NULL,
    "settingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" "TopicCategory" NOT NULL,
    "hook" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "keywords" TEXT[],
    "status" "TopicStatus" NOT NULL DEFAULT 'PLANNED',
    "plannedFor" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "researchJson" JSONB,
    "script" JSONB,
    "captionText" TEXT,
    "hashtags" TEXT[],
    "igTitle" TEXT,
    "selectedVideoId" TEXT,
    "instagramMediaId" TEXT,
    "instagramContainerId" TEXT,
    "instagramPermalink" TEXT,
    "publishAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastPublishError" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "variantLabel" TEXT NOT NULL DEFAULT 'default',
    "filePath" TEXT NOT NULL,
    "publicUrl" TEXT,
    "subtitlesPath" TEXT,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 1080,
    "height" INTEGER NOT NULL DEFAULT 1920,
    "fileSizeBytes" INTEGER,
    "renderStatus" "RenderStatus" NOT NULL DEFAULT 'PENDING',
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "provider" "MediaProviderName" NOT NULL,
    "providerAssetId" TEXT NOT NULL,
    "type" "MediaAssetType" NOT NULL,
    "query" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "localPath" TEXT,
    "checksum" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduler_logs" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" "SchedulerJobStatus" NOT NULL,
    "message" TEXT,
    "executionId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduler_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_logs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "requestSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_history" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "purpose" "PromptPurpose" NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "tokensUsed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_history" (
    "id" TEXT NOT NULL,
    "settingId" TEXT NOT NULL,
    "postId" TEXT,
    "runDate" DATE NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "currentStep" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "execution_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_steps" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "stepName" TEXT NOT NULL,
    "status" "StepStatus" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "output" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "execution_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "topics_slug_key" ON "topics"("slug");

-- CreateIndex
CREATE INDEX "topics_settingId_status_idx" ON "topics"("settingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "topics_settingId_normalizedTitle_key" ON "topics"("settingId", "normalizedTitle");

-- CreateIndex
CREATE UNIQUE INDEX "posts_selectedVideoId_key" ON "posts"("selectedVideoId");

-- CreateIndex
CREATE INDEX "posts_status_idx" ON "posts"("status");

-- CreateIndex
CREATE INDEX "videos_postId_idx" ON "videos"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_checksum_key" ON "media_assets"("checksum");

-- CreateIndex
CREATE INDEX "media_assets_provider_providerAssetId_idx" ON "media_assets"("provider", "providerAssetId");

-- CreateIndex
CREATE INDEX "api_logs_provider_createdAt_idx" ON "api_logs"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "prompt_history_purpose_createdAt_idx" ON "prompt_history"("purpose", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "execution_history_settingId_runDate_key" ON "execution_history"("settingId", "runDate");

-- CreateIndex
CREATE UNIQUE INDEX "execution_steps_executionId_stepName_key" ON "execution_steps"("executionId", "stepName");

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_settingId_fkey" FOREIGN KEY ("settingId") REFERENCES "settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_selectedVideoId_fkey" FOREIGN KEY ("selectedVideoId") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduler_logs" ADD CONSTRAINT "scheduler_logs_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "execution_history"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_history" ADD CONSTRAINT "prompt_history_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_history" ADD CONSTRAINT "execution_history_settingId_fkey" FOREIGN KEY ("settingId") REFERENCES "settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_history" ADD CONSTRAINT "execution_history_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "execution_history"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
