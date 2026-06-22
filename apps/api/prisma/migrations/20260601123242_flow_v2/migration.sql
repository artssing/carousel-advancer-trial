-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('SHIP', 'MEETUP_AUTH', 'MEETUP_3WAY', 'MEETUP_DIRECT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ONLINE_ESCROW', 'OFFLINE_CASH');

-- AlterTable
ALTER TABLE "Authenticator" ADD COLUMN     "acceptsMeetup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "businessHours" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "feeMinHKD" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "feeRatePct" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
ADD COLUMN     "locationAddress" TEXT,
ADD COLUMN     "yearsExperience" INTEGER;

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "allowedDeliveryMethods" "DeliveryMethod"[] DEFAULT ARRAY['SHIP']::"DeliveryMethod"[],
ADD COLUMN     "sellerDistrict" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryMethod" "DeliveryMethod" NOT NULL DEFAULT 'SHIP',
ADD COLUMN     "escrowHeld" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "meetupLocation" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'ONLINE_ESCROW';

-- CreateTable
CREATE TABLE "AuthenticatorReview" (
    "id" TEXT NOT NULL,
    "authenticatorId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthenticatorReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthenticatorReview_orderId_key" ON "AuthenticatorReview"("orderId");

-- CreateIndex
CREATE INDEX "AuthenticatorReview_authenticatorId_idx" ON "AuthenticatorReview"("authenticatorId");

-- AddForeignKey
ALTER TABLE "AuthenticatorReview" ADD CONSTRAINT "AuthenticatorReview_authenticatorId_fkey" FOREIGN KEY ("authenticatorId") REFERENCES "Authenticator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
