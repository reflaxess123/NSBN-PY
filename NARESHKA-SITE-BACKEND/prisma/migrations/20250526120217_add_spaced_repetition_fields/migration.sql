-- CreateEnum
CREATE TYPE "CardState" AS ENUM ('NEW', 'LEARNING', 'REVIEW', 'RELEARNING');

-- AlterTable
ALTER TABLE "UserTheoryProgress" ADD COLUMN     "cardState" "CardState" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "easeFactor" DECIMAL(3,2) NOT NULL DEFAULT 2.50,
ADD COLUMN     "interval" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "lapseCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastReviewDate" TIMESTAMP(3),
ADD COLUMN     "learningStep" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reviewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "UserTheoryProgress_dueDate_idx" ON "UserTheoryProgress"("dueDate");

-- CreateIndex
CREATE INDEX "UserTheoryProgress_cardState_idx" ON "UserTheoryProgress"("cardState");
