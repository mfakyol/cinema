-- AlterEnum
ALTER TYPE "ShowFormat" ADD VALUE 'IMAX';
ALTER TYPE "ShowFormat" ADD VALUE 'IMAX_3D';

-- AlterTable
ALTER TABLE "Hall" ADD COLUMN     "formats" "ShowFormat"[] DEFAULT ARRAY['TWO_D']::"ShowFormat"[];
