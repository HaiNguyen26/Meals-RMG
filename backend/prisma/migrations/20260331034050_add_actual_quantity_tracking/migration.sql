-- AlterTable
ALTER TABLE "DepartmentLunch" ADD COLUMN     "actualQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "actualUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "actualUpdatedBy" TEXT;
