-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'REFUNDED';
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "refundReason" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3);
-- AlterTable
ALTER TABLE "Showtime" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3);
-- AlterTable
ALTER TABLE "daily_sales" ADD COLUMN     "refunds" INTEGER NOT NULL DEFAULT 0;
