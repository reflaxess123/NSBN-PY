-- AlterTable
ALTER TABLE "ContentBlock" ADD COLUMN     "extractedUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
