-- CreateTable
CREATE TABLE "TheoryCard" (
    "id" TEXT NOT NULL,
    "ankiGuid" TEXT NOT NULL,
    "cardType" TEXT NOT NULL,
    "deck" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subCategory" TEXT,
    "questionBlock" TEXT NOT NULL,
    "answerBlock" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TheoryCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTheoryProgress" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "cardId" TEXT NOT NULL,
    "solvedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTheoryProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TheoryCard_ankiGuid_key" ON "TheoryCard"("ankiGuid");

-- CreateIndex
CREATE INDEX "TheoryCard_category_idx" ON "TheoryCard"("category");

-- CreateIndex
CREATE INDEX "TheoryCard_deck_idx" ON "TheoryCard"("deck");

-- CreateIndex
CREATE INDEX "UserTheoryProgress_cardId_idx" ON "UserTheoryProgress"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTheoryProgress_userId_cardId_key" ON "UserTheoryProgress"("userId", "cardId");

-- AddForeignKey
ALTER TABLE "UserTheoryProgress" ADD CONSTRAINT "UserTheoryProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTheoryProgress" ADD CONSTRAINT "UserTheoryProgress_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "TheoryCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
