-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('employee', 'manager', 'admin', 'kitchen');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'employee',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LunchRegistration" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "willEat" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LunchRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LunchLock" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LunchLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_externalId_key" ON "User"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "LunchRegistration_date_idx" ON "LunchRegistration"("date");

-- CreateIndex
CREATE UNIQUE INDEX "LunchRegistration_userId_date_key" ON "LunchRegistration"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "LunchLock_date_key" ON "LunchLock"("date");

-- AddForeignKey
ALTER TABLE "LunchRegistration" ADD CONSTRAINT "LunchRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
