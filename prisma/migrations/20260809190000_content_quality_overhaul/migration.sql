-- DropIndex
-- Guarded: this migration was generated against a drifted dev database.
-- Databases built from 20260803134242_init never had this index.
DROP INDEX IF EXISTS "execution_history_settingId_status_idx";

-- AlterTable
ALTER TABLE "execution_history" ALTER COLUMN "runDate" DROP DEFAULT,
ALTER COLUMN "runDate" SET DATA TYPE DATE;

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "qualityScore" JSONB;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "audienceLevel" TEXT NOT NULL DEFAULT 'beginner',
ADD COLUMN     "captionStylePreset" TEXT NOT NULL DEFAULT 'bold-highlight',
ADD COLUMN     "qualityMaxRetries" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "qualityThreshold" DOUBLE PRECISION NOT NULL DEFAULT 7.0,
ADD COLUMN     "voiceSpeed" TEXT NOT NULL DEFAULT 'normal',
ADD COLUMN     "voiceStyle" TEXT;

-- AlterTable
ALTER TABLE "topics" ADD COLUMN     "audienceLevel" TEXT NOT NULL DEFAULT 'beginner',
ADD COLUMN     "coreLesson" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "difficulty" TEXT NOT NULL DEFAULT 'beginner',
ADD COLUMN     "format" TEXT NOT NULL DEFAULT 'beginner-explanation',
ADD COLUMN     "hookCategory" TEXT NOT NULL DEFAULT 'curiosity',
ADD COLUMN     "visualIdea" TEXT NOT NULL DEFAULT '';

-- CreateIndex
-- Guarded: 20260803134242_init already creates this index.
CREATE UNIQUE INDEX IF NOT EXISTS "execution_history_settingId_runDate_key" ON "execution_history"("settingId", "runDate");

