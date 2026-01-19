-- AlterTable
ALTER TABLE "DepartmentLunch" ADD COLUMN     "regularQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vegQuantity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "DepartmentLunchHistory" ADD COLUMN     "regularQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vegQuantity" INTEGER NOT NULL DEFAULT 0;
