-- Pending workshop location is private until the operations team verifies it.
-- Additive columns; existing verified map pins and customer orders stay unchanged.
ALTER TABLE "Tailor"
 ADD COLUMN "pendingLatitude" DOUBLE PRECISION,
 ADD COLUMN "pendingLongitude" DOUBLE PRECISION,
 ADD COLUMN "locationSubmittedAt" TIMESTAMP(3);
