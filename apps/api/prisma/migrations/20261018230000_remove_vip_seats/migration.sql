-- Former VIP seats become standard seats.
UPDATE "Seat" SET "type" = 'STANDARD' WHERE "type" = 'VIP';

-- AlterEnum
BEGIN;
CREATE TYPE "SeatType_new" AS ENUM ('STANDARD', 'WHEELCHAIR');
ALTER TABLE "public"."Seat" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Seat" ALTER COLUMN "type" TYPE "SeatType_new" USING ("type"::text::"SeatType_new");
ALTER TYPE "SeatType" RENAME TO "SeatType_old";
ALTER TYPE "SeatType_new" RENAME TO "SeatType";
DROP TYPE "public"."SeatType_old";
ALTER TABLE "Seat" ALTER COLUMN "type" SET DEFAULT 'STANDARD';
COMMIT;

