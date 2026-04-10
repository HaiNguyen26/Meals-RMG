-- CreateTable
CREATE TABLE "DepartmentLunchActualHistory" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "actualQuantity" INTEGER NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentLunchActualHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DepartmentLunchActualHistory_date_idx" ON "DepartmentLunchActualHistory"("date");
CREATE INDEX "DepartmentLunchActualHistory_departmentId_date_idx" ON "DepartmentLunchActualHistory"("departmentId", "date");
