/*
  Warnings:

  - You are about to drop the `LunchRegistration` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "LunchRegistration" DROP CONSTRAINT "LunchRegistration_userId_fkey";

-- DropTable
DROP TABLE "LunchRegistration";

-- CreateTable
CREATE TABLE "DepartmentLunch" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalQuantity" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentLunch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DepartmentLunch_date_idx" ON "DepartmentLunch"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentLunch_departmentId_date_key" ON "DepartmentLunch"("departmentId", "date");
