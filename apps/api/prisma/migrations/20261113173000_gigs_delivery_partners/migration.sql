-- Additive gig marketplace and approved delivery partner schema.
ALTER TABLE "Order" ADD COLUMN "gigId" UUID, ADD COLUMN "gigTier" TEXT, ADD COLUMN "gigPackagePricePaise" BIGINT;
CREATE TABLE "Gig" (
 "id" UUID NOT NULL, "tailorId" UUID NOT NULL, "categoryId" UUID NOT NULL,
 "slug" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT NOT NULL, "imageRightsConfirmed" BOOLEAN NOT NULL DEFAULT false,
 "status" TEXT NOT NULL DEFAULT 'DRAFT',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "Gig_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "GigPackage" (
 "id" UUID NOT NULL, "gigId" UUID NOT NULL, "tier" TEXT NOT NULL,
 "title" TEXT NOT NULL, "description" TEXT NOT NULL, "pricePaise" BIGINT NOT NULL,
 "deliveryDays" INTEGER NOT NULL, "revisions" INTEGER NOT NULL DEFAULT 0,
 "expressPricePaise" BIGINT, "expressDays" INTEGER,
 CONSTRAINT "GigPackage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "GigImage" (
 "id" UUID NOT NULL, "gigId" UUID NOT NULL, "fileId" UUID NOT NULL,
 "position" INTEGER NOT NULL DEFAULT 0,
 CONSTRAINT "GigImage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DeliveryPartner" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL,
 "displayName" TEXT NOT NULL, "vehicleType" TEXT NOT NULL,
 "servicePincode" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
 "available" BOOLEAN NOT NULL DEFAULT false, "reviewedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "DeliveryPartner_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Gig_slug_key" ON "Gig"("slug");
CREATE INDEX "Gig_tailorId_status_idx" ON "Gig"("tailorId","status");
CREATE INDEX "Gig_status_categoryId_createdAt_idx" ON "Gig"("status","categoryId","createdAt");
CREATE UNIQUE INDEX "GigPackage_gigId_tier_key" ON "GigPackage"("gigId","tier");
CREATE UNIQUE INDEX "GigImage_gigId_fileId_key" ON "GigImage"("gigId","fileId");
CREATE INDEX "GigImage_gigId_position_idx" ON "GigImage"("gigId","position");
CREATE UNIQUE INDEX "DeliveryPartner_userId_key" ON "DeliveryPartner"("userId");
CREATE INDEX "DeliveryPartner_status_servicePincode_available_idx" ON "DeliveryPartner"("status","servicePincode","available");
CREATE INDEX "Order_gigId_createdAt_idx" ON "Order"("gigId","createdAt" DESC);
ALTER TABLE "Gig" ADD CONSTRAINT "Gig_tailorId_fkey" FOREIGN KEY ("tailorId") REFERENCES "Tailor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Gig" ADD CONSTRAINT "Gig_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GigPackage" ADD CONSTRAINT "GigPackage_gigId_fkey" FOREIGN KEY ("gigId") REFERENCES "Gig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GigImage" ADD CONSTRAINT "GigImage_gigId_fkey" FOREIGN KEY ("gigId") REFERENCES "Gig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GigImage" ADD CONSTRAINT "GigImage_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "UploadedFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryPartner" ADD CONSTRAINT "DeliveryPartner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_gigId_fkey" FOREIGN KEY ("gigId") REFERENCES "Gig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
