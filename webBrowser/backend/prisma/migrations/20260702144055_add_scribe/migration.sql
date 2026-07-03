-- CreateTable
CREATE TABLE "ScribeNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "doc" JSONB NOT NULL,
    "strokes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScribeNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScribeNote_userId_updatedAt_idx" ON "ScribeNote"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "ScribeNote" ADD CONSTRAINT "ScribeNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
