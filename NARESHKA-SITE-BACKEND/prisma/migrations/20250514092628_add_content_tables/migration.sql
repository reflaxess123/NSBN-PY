-- CreateTable
CREATE TABLE "ContentFile" (
    "id" TEXT NOT NULL,
    "webdavPath" TEXT NOT NULL,
    "mainCategory" TEXT NOT NULL,
    "subCategory" TEXT NOT NULL,
    "lastFileHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentBlock" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "pathTitles" JSONB NOT NULL,
    "blockTitle" TEXT NOT NULL,
    "blockLevel" INTEGER NOT NULL,
    "orderInFile" INTEGER NOT NULL,
    "textContent" TEXT,
    "codeContent" TEXT,
    "codeLanguage" TEXT,
    "isCodeFoldable" BOOLEAN NOT NULL DEFAULT false,
    "codeFoldTitle" TEXT,
    "rawBlockContentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserContentProgress" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "blockId" TEXT NOT NULL,
    "solvedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserContentProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentFile_webdavPath_key" ON "ContentFile"("webdavPath");

-- CreateIndex
CREATE INDEX "ContentBlock_fileId_idx" ON "ContentBlock"("fileId");

-- CreateIndex
CREATE INDEX "UserContentProgress_blockId_idx" ON "UserContentProgress"("blockId");

-- CreateIndex
CREATE UNIQUE INDEX "UserContentProgress_userId_blockId_key" ON "UserContentProgress"("userId", "blockId");

-- AddForeignKey
ALTER TABLE "ContentBlock" ADD CONSTRAINT "ContentBlock_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ContentFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserContentProgress" ADD CONSTRAINT "UserContentProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserContentProgress" ADD CONSTRAINT "UserContentProgress_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ContentBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
