-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lockPinDigest" TEXT,
ADD COLUMN     "lockPinSalt" TEXT;
