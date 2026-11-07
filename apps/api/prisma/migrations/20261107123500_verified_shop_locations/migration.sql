-- Additive migration: store verified workshop coordinates; never derive exact pins from pincodes.
ALTER TABLE "Tailor"
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "locationVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Tailor" ADD CONSTRAINT "Tailor_verified_coordinates_check" CHECK (
  ("latitude" IS NULL AND "longitude" IS NULL AND "locationVerifiedAt" IS NULL) OR
  ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180 AND "locationVerifiedAt" IS NOT NULL)
);
