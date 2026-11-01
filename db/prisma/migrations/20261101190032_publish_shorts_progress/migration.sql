-- AlterTable
ALTER TABLE "Clip" ADD COLUMN     "focus" JSONB,
ADD COLUMN     "renderError" TEXT,
ADD COLUMN     "renderPath" TEXT,
ADD COLUMN     "renderProgress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "renderStatus" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "renderedEndSec" INTEGER,
ADD COLUMN     "renderedStartSec" INTEGER;

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stage" TEXT NOT NULL DEFAULT '';
