-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "authCompletedAt" TIMESTAMP(3),
ADD COLUMN     "authNotes" TEXT,
ADD COLUMN     "authVerdict" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "receivedByAuthAt" TIMESTAMP(3),
ADD COLUMN     "shippedToAuthAt" TIMESTAMP(3),
ADD COLUMN     "shippedToBuyerAt" TIMESTAMP(3);
