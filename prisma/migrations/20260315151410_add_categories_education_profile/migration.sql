-- AlterTable
ALTER TABLE "Instrument" ADD COLUMN     "categoryId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "city" TEXT,
ADD COLUMN     "exchangeExperience" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "specializations" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "workplace" TEXT;

-- CreateTable
CREATE TABLE "Education" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "university" TEXT NOT NULL,
    "faculty" TEXT,
    "specialty" TEXT,
    "yearEnd" INTEGER,

    CONSTRAINT "Education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstrumentCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstrumentCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Education_userId_idx" ON "Education"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InstrumentCategory_name_key" ON "InstrumentCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "InstrumentCategory_slug_key" ON "InstrumentCategory"("slug");

-- CreateIndex
CREATE INDEX "Instrument_categoryId_idx" ON "Instrument"("categoryId");

-- AddForeignKey
ALTER TABLE "Education" ADD CONSTRAINT "Education_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instrument" ADD CONSTRAINT "Instrument_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "InstrumentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
