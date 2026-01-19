-- CreateTable
CREATE TABLE "DepartmentLunchHistory" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalQuantity" INTEGER NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentLunchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DepartmentLunchHistory_departmentId_date_idx" ON "DepartmentLunchHistory"("departmentId", "date");
