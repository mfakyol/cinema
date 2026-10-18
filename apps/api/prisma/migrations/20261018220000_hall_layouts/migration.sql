-- AlterEnum
ALTER TYPE "SeatType" ADD VALUE 'WHEELCHAIR';

-- AlterTable
ALTER TABLE "Hall" ADD COLUMN     "layoutId" TEXT;

-- AlterTable
ALTER TABLE "Seat" ADD COLUMN     "column" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "HallLayout" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rows" JSONB NOT NULL,

    CONSTRAINT "HallLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HallLayout_name_key" ON "HallLayout"("name");

-- AddForeignKey
ALTER TABLE "Hall" ADD CONSTRAINT "Hall_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "HallLayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

