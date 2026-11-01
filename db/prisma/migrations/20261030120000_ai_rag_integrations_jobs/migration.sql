-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('crevo', 'google');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('uploading', 'processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('scheduled', 'publishing', 'published', 'needs_manual', 'failed');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('contract');

-- CreateEnum
CREATE TYPE "ChunkSource" AS ENUM ('message', 'reply', 'document', 'transcript');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'done', 'failed');

-- DropIndex
DROP INDEX "ScheduledPost_scheduledAt_idx";

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "dedupeKey" TEXT;

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "googleEventId" TEXT,
ADD COLUMN     "source" "EventSource" NOT NULL DEFAULT 'crevo';

-- AlterTable
ALTER TABLE "ConnectedAccount" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "syncCursor" TEXT,
ADD COLUMN     "syncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ContentPost" ADD COLUMN     "externalId" TEXT;

-- AlterTable
ALTER TABLE "Deliverable" ADD COLUMN     "googleEventId" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "replyExternalId" TEXT,
ADD COLUMN     "threadId" TEXT;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "briefingSentOn" DATE,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- AlterTable
ALTER TABLE "ScheduledPost" ADD COLUMN     "clipPath" TEXT,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "externalUrl" TEXT,
ADD COLUMN     "googleEventId" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "status" "PostStatus" NOT NULL DEFAULT 'scheduled';

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "error" TEXT,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "status" "VideoStatus" NOT NULL DEFAULT 'ready',
ADD COLUMN     "storagePath" TEXT,
ALTER COLUMN "lengthSec" SET DEFAULT 0,
ALTER COLUMN "quality" SET DEFAULT '';

-- CreateTable
CREATE TABLE "GoogleConnection" (
    "id" TEXT NOT NULL,
    "profileId" UUID NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "scopes" TEXT[],
    "refreshTokenEnc" TEXT NOT NULL,
    "accessTokenEnc" TEXT,
    "accessExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "profileId" UUID NOT NULL,
    "dealId" TEXT,
    "kind" "DocumentKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chunk" (
    "id" TEXT NOT NULL,
    "profileId" UUID NOT NULL,
    "sourceType" "ChunkSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Chunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "profileId" UUID,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "key" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleConnection_profileId_key" ON "GoogleConnection"("profileId");

-- CreateIndex
CREATE INDEX "Document_profileId_idx" ON "Document"("profileId");

-- CreateIndex
CREATE INDEX "Chunk_profileId_sourceType_idx" ON "Chunk"("profileId", "sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "Chunk_sourceType_sourceId_position_key" ON "Chunk"("sourceType", "sourceId", "position");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "Job_key_status_idx" ON "Job"("key", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_profileId_dedupeKey_key" ON "Alert"("profileId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_profileId_googleEventId_key" ON "CalendarEvent"("profileId", "googleEventId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPost_profileId_externalId_key" ON "ContentPost"("profileId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_profileId_source_externalId_key" ON "Message"("profileId", "source", "externalId");

-- CreateIndex
CREATE INDEX "ScheduledPost_status_scheduledAt_idx" ON "ScheduledPost"("status", "scheduledAt");

-- AddForeignKey
ALTER TABLE "GoogleConnection" ADD CONSTRAINT "GoogleConnection_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

