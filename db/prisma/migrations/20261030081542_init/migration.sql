-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('gmail', 'calendar', 'youtube', 'instagram', 'tiktok');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('connected', 'disconnected', 'imported', 'soon');

-- CreateEnum
CREATE TYPE "BriefingSection" AS ENUM ('todo', 'inbox', 'ideas', 'deals');

-- CreateEnum
CREATE TYPE "Tone" AS ENUM ('friendly', 'professional', 'shorter');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('brand_deal', 'collab', 'fan_question', 'spam');

-- CreateEnum
CREATE TYPE "MessageSource" AS ENUM ('gmail', 'youtube', 'instagram');

-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('new_offer', 'negotiating', 'in_production', 'invoiced', 'paid');

-- CreateEnum
CREATE TYPE "AlertTone" AS ENUM ('warn', 'bad');

-- CreateEnum
CREATE TYPE "IdeaPlatform" AS ENUM ('instagram', 'youtube', 'tiktok', 'shorts', 'reels');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('deadline', 'post', 'film', 'call');

-- CreateEnum
CREATE TYPE "PublishPlatform" AS ENUM ('reel', 'short', 'tiktok');

-- CreateEnum
CREATE TYPE "AlertKind" AS ENUM ('overdue', 'new_deal', 'deadline', 'weekly');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('youtube', 'instagram', 'tiktok');

-- CreateTable
CREATE TABLE "Profile" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "channel" TEXT NOT NULL DEFAULT '',
    "niche" TEXT NOT NULL DEFAULT '',
    "goals" TEXT[],
    "briefingTime" TEXT NOT NULL DEFAULT '8:00',
    "briefingEmail" BOOLEAN NOT NULL DEFAULT true,
    "briefingSections" "BriefingSection"[] DEFAULT ARRAY['todo', 'inbox', 'ideas', 'deals']::"BriefingSection"[],
    "tone" "Tone" NOT NULL DEFAULT 'friendly',
    "signOff" TEXT NOT NULL DEFAULT '',
    "autoDraft" "Category"[] DEFAULT ARRAY['brand_deal', 'collab', 'fan_question']::"Category"[],
    "notifications" "AlertKind"[] DEFAULT ARRAY['overdue', 'new_deal', 'deadline']::"AlertKind"[],
    "onboardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectedAccount" (
    "id" TEXT NOT NULL,
    "profileId" UUID NOT NULL,
    "provider" "Provider" NOT NULL,
    "status" "AccountStatus" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "profileId" UUID NOT NULL,
    "dealId" TEXT,
    "source" "MessageSource" NOT NULL,
    "category" "Category" NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "avatarInitial" TEXT NOT NULL,
    "avatarColor" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preview" TEXT NOT NULL,
    "body" TEXT[],
    "senderSignOff" TEXT NOT NULL,
    "summary" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "draftReady" BOOLEAN NOT NULL DEFAULT false,
    "draftRequested" BOOLEAN NOT NULL DEFAULT false,
    "minutesSaved" INTEGER NOT NULL DEFAULT 0,
    "tone" "Tone",
    "editedReply" TEXT,
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedReply" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageDraft" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "tone" "Tone" NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "MessageDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "profileId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "campaign" TEXT NOT NULL,
    "stage" "DealStage" NOT NULL,
    "amount" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "alertText" TEXT,
    "alertTone" "AlertTone",
    "healthFinancial" INTEGER NOT NULL,
    "healthDeadline" INTEGER NOT NULL,
    "healthContract" INTEGER NOT NULL,
    "healthScope" INTEGER NOT NULL,
    "invoiceNumber" TEXT,
    "invoiceDueDate" DATE,
    "paidAt" DATE,
    "reminderDraft" TEXT,
    "inCalendar" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealTerm" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "clause" TEXT,
    "missing" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DealTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealRisk" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "fix" TEXT NOT NULL,

    CONSTRAINT "DealRisk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Deliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Todo" (
    "id" TEXT NOT NULL,
    "profileId" UUID NOT NULL,
    "ideaId" TEXT,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "dueDate" DATE NOT NULL,
    "dueMinutes" INTEGER,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Todo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "profileId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "why" TEXT NOT NULL,
    "platforms" "IdeaPlatform"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "profileId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "date" DATE NOT NULL,
    "startMinutes" INTEGER,
    "endMinutes" INTEGER,
    "detail" TEXT,
    "linkHref" TEXT,
    "linkLabel" TEXT,
    "tentative" BOOLEAN NOT NULL DEFAULT false,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "profileId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "lengthSec" INTEGER NOT NULL,
    "quality" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptLine" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "sec" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "TranscriptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clip" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "short" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "startSec" INTEGER NOT NULL,
    "endSec" INTEGER NOT NULL,
    "suggestedStartSec" INTEGER NOT NULL,
    "suggestedEndSec" INTEGER NOT NULL,
    "why" TEXT NOT NULL,
    "hook" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "hashtags" TEXT[],

    CONSTRAINT "Clip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClipCaption" (
    "id" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "platform" "PublishPlatform" NOT NULL,
    "options" TEXT[],
    "variant" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT,

    CONSTRAINT "ClipCaption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledPost" (
    "id" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "platform" "PublishPlatform" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "why" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "profileId" UUID NOT NULL,
    "dealId" TEXT,
    "kind" "AlertKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelDay" (
    "id" TEXT NOT NULL,
    "profileId" UUID NOT NULL,
    "channel" "Channel" NOT NULL,
    "date" DATE NOT NULL,
    "views" INTEGER NOT NULL,
    "followers" INTEGER NOT NULL,
    "watchMinutes" INTEGER,

    CONSTRAINT "ChannelDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPost" (
    "id" TEXT NOT NULL,
    "profileId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "format" TEXT NOT NULL,
    "views" INTEGER NOT NULL,
    "engagement" DOUBLE PRECISION NOT NULL,
    "postedAt" DATE NOT NULL,

    CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedAccount_profileId_provider_key" ON "ConnectedAccount"("profileId", "provider");

-- CreateIndex
CREATE INDEX "Message_profileId_archivedAt_receivedAt_idx" ON "Message"("profileId", "archivedAt", "receivedAt");

-- CreateIndex
CREATE INDEX "Message_dealId_idx" ON "Message"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageDraft_messageId_tone_key" ON "MessageDraft"("messageId", "tone");

-- CreateIndex
CREATE INDEX "Deal_profileId_stage_idx" ON "Deal"("profileId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_profileId_slug_key" ON "Deal"("profileId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "DealTerm_dealId_position_key" ON "DealTerm"("dealId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "DealRisk_dealId_position_key" ON "DealRisk"("dealId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Deliverable_dealId_position_key" ON "Deliverable"("dealId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Todo_ideaId_key" ON "Todo"("ideaId");

-- CreateIndex
CREATE INDEX "Todo_profileId_dueDate_idx" ON "Todo"("profileId", "dueDate");

-- CreateIndex
CREATE INDEX "Idea_profileId_idx" ON "Idea"("profileId");

-- CreateIndex
CREATE INDEX "CalendarEvent_profileId_date_idx" ON "CalendarEvent"("profileId", "date");

-- CreateIndex
CREATE INDEX "Video_profileId_createdAt_idx" ON "Video"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "TranscriptLine_videoId_sec_idx" ON "TranscriptLine"("videoId", "sec");

-- CreateIndex
CREATE UNIQUE INDEX "Clip_videoId_position_key" ON "Clip"("videoId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ClipCaption_clipId_platform_key" ON "ClipCaption"("clipId", "platform");

-- CreateIndex
CREATE INDEX "ScheduledPost_scheduledAt_idx" ON "ScheduledPost"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledPost_clipId_platform_key" ON "ScheduledPost"("clipId", "platform");

-- CreateIndex
CREATE INDEX "Alert_profileId_createdAt_idx" ON "Alert"("profileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelDay_profileId_channel_date_key" ON "ChannelDay"("profileId", "channel", "date");

-- CreateIndex
CREATE INDEX "ContentPost_profileId_views_idx" ON "ContentPost"("profileId", "views");

-- AddForeignKey
ALTER TABLE "ConnectedAccount" ADD CONSTRAINT "ConnectedAccount_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDraft" ADD CONSTRAINT "MessageDraft_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealTerm" ADD CONSTRAINT "DealTerm_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealRisk" ADD CONSTRAINT "DealRisk_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptLine" ADD CONSTRAINT "TranscriptLine_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipCaption" ADD CONSTRAINT "ClipCaption_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPost" ADD CONSTRAINT "ScheduledPost_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelDay" ADD CONSTRAINT "ChannelDay_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
