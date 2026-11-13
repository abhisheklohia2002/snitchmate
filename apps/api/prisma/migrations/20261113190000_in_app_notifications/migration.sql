-- Durable in-app notifications. Domain logic remains unchanged: notifications are
-- projected from committed database events, not guessed by frontend clients.
CREATE TABLE "InAppNotification" (
 "id" UUID NOT NULL, "userId" UUID NOT NULL,
 "eventKey" TEXT NOT NULL, "kind" TEXT NOT NULL, "title" TEXT NOT NULL,
 "body" TEXT NOT NULL, "href" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "readAt" TIMESTAMP(3), CONSTRAINT "InAppNotification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InAppNotification_userId_eventKey_key" ON "InAppNotification"("userId","eventKey");
CREATE INDEX "InAppNotification_userId_createdAt_id_idx" ON "InAppNotification"("userId","createdAt" DESC,"id" DESC);
CREATE INDEX "InAppNotification_userId_readAt_createdAt_idx" ON "InAppNotification"("userId","readAt","createdAt" DESC);
ALTER TABLE "InAppNotification" ADD CONSTRAINT "InAppNotification_userId_fkey"
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every domain event is attached to recipients by trusted relationships:
-- customers from orders, assigned tailors and riders, and active admin users.
CREATE OR REPLACE FUNCTION sm_notify(
  recipient UUID, ekey TEXT, event_type TEXT, heading TEXT, content TEXT, target TEXT
) RETURNS VOID AS $$
BEGIN
  IF recipient IS NULL THEN RETURN; END IF;
  INSERT INTO "InAppNotification" ("id","userId","eventKey","kind","title","body","href")
  VALUES (gen_random_uuid(),recipient,ekey,event_type,heading,content,target)
  ON CONFLICT ("userId","eventKey") DO NOTHING;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sm_notify_admin(
  ekey TEXT, event_type TEXT, heading TEXT, content TEXT, target TEXT
) RETURNS VOID AS $$
DECLARE admin_user RECORD;
BEGIN
  FOR admin_user IN
    SELECT DISTINCT u."id" FROM "User" u
    JOIN "UserRole" r ON r."userId"=u."id"
    WHERE r."role"='admin' AND u."status"='ACTIVE'
  LOOP
    PERFORM sm_notify(admin_user.id,ekey,event_type,heading,content,target);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sm_order_recipients(order_uuid UUID, event_key TEXT, kind TEXT, heading TEXT, content TEXT)
RETURNS VOID AS $$
DECLARE o RECORD;
BEGIN
 SELECT o1."customerId",t."ownerId",o1."orderNumber" INTO o
 FROM "Order" o1 JOIN "Tailor" t ON t."id"=o1."tailorId"
 WHERE o1."id"=order_uuid;
 IF NOT FOUND THEN RETURN; END IF;
 PERFORM sm_notify(o."customerId", event_key,kind,heading,content,'/orders/'||order_uuid::TEXT);
 PERFORM sm_notify(o."ownerId", event_key,kind,heading,content,'/tailor/orders/'||order_uuid::TEXT);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sm_order_status_trigger() RETURNS TRIGGER AS $$
DECLARE o RECORD; msg TEXT; kind TEXT;
BEGIN
 SELECT o1."customerId",t."ownerId",o1."orderNumber"
 INTO o FROM "Order" o1 JOIN "Tailor" t ON t."id"=o1."tailorId" WHERE o1."id"=NEW."orderId";
 IF NOT FOUND THEN RETURN NEW; END IF;
 kind := 'ORDER_'||NEW."to";
 msg := 'Order '||o."orderNumber"||' is now '||replace(NEW."to",'_',' ')||'.';
 IF NEW."to"='QUOTE_REQUESTED' THEN
   PERFORM sm_notify(o."ownerId",'order-status:'||NEW."id",kind,'New customer request',msg,'/tailor/requests');
 ELSIF NEW."to"='QUOTE_PENDING' THEN
   PERFORM sm_notify(o."customerId",'order-status:'||NEW."id",kind,'Tailor accepted your request',msg,'/orders/'||NEW."orderId");
 ELSIF NEW."to"='QUOTE_READY' THEN
   PERFORM sm_notify(o."customerId",'order-status:'||NEW."id",kind,'New quotation received',msg,'/orders/'||NEW."orderId");
 ELSIF NEW."to"='QUOTE_ACCEPTED' THEN
   PERFORM sm_notify(o."ownerId",'order-status:'||NEW."id",kind,'Customer approved a quotation',msg,'/tailor/orders/'||NEW."orderId");
 ELSIF NEW."to"='PAID' THEN
   PERFORM sm_notify(o."customerId",'order-status:'||NEW."id",kind,'Payment confirmed',msg,'/orders/'||NEW."orderId");
   PERFORM sm_notify(o."ownerId",'order-status:'||NEW."id",kind,'Order payment received',msg,'/tailor/orders/'||NEW."orderId");
 ELSIF NEW."to" IN ('INBOUND_TRANSIT','MATERIAL_RECEIVED','IN_PRODUCTION','QUALITY_CHECK','RETURN_PICKUP_SCHEDULED','OUTBOUND_TRANSIT','DELIVERED','COMPLETED','DISPUTED','MATERIAL_ISSUE','PAYMENT_FAILED') THEN
   PERFORM sm_notify(o."customerId",'order-status:'||NEW."id",kind,'Order progress updated',msg,'/orders/'||NEW."orderId");
   IF NEW."to" IN ('MATERIAL_RECEIVED','IN_PRODUCTION','RETURN_PICKUP_SCHEDULED','COMPLETED') THEN
     PERFORM sm_notify(o."ownerId",'order-status:'||NEW."id",kind,'Workshop order update',msg,'/tailor/orders/'||NEW."orderId");
   END IF;
   IF NEW."to" IN ('DISPUTED','MATERIAL_ISSUE','PAYMENT_FAILED') THEN
     PERFORM sm_notify_admin('order-exception:'||NEW."id",kind,'Order needs attention',msg,'/admin/orders');
   END IF;
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sm_order_status AFTER INSERT ON "OrderStatusEvent"
 FOR EACH ROW EXECUTE FUNCTION sm_order_status_trigger();

CREATE OR REPLACE FUNCTION sm_quote_trigger() RETURNS TRIGGER AS $$
DECLARE o RECORD;
BEGIN
 SELECT o1."customerId",o1."orderNumber" INTO o FROM "Order" o1 WHERE o1."id"=NEW."orderId";
 IF FOUND THEN
 PERFORM sm_notify(o."customerId",'quote:'||NEW."id",'QUOTE_READY','Quotation received',
 'Your tailor sent a quotation for '||o."orderNumber"||'.','/orders/'||NEW."orderId");
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sm_quote_notify AFTER INSERT ON "Quote" FOR EACH ROW EXECUTE FUNCTION sm_quote_trigger();

CREATE OR REPLACE FUNCTION sm_courier_job_trigger() RETURNS TRIGGER AS $$
DECLARE o RECORD; action_key TEXT; new_assignment BOOLEAN;
BEGIN
 SELECT o1."customerId",t."ownerId",o1."orderNumber"
 INTO o FROM "Order" o1 JOIN "Tailor" t ON t."id"=o1."tailorId" WHERE o1."id"=NEW."orderId";
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
   PERFORM sm_notify_admin('delivery-job:'||NEW."id",'DELIVERY_AVAILABLE','Delivery job available',
    'A new parcel job was created for '||o."orderNumber"||'.','/admin/logistics');
 ELSIF OLD."courierId" IS DISTINCT FROM NEW."courierId" AND NEW."courierId" IS NOT NULL THEN
   action_key := 'courier-assigned:'||NEW."id"||':'||NEW."courierId";
   PERFORM sm_notify(NEW."courierId",action_key,'DELIVERY_ASSIGNED','New delivery assignment',
    'You have a delivery for '||o."orderNumber"||'.','/delivery');
   PERFORM sm_notify(o."customerId",action_key,'COURIER_ASSIGNED','Delivery partner assigned',
    'A delivery partner was assigned to '||o."orderNumber"||'.','/orders/'||NEW."orderId");
   PERFORM sm_notify(o."ownerId",action_key,'COURIER_ASSIGNED','Courier assigned to order',
    'A courier is assigned to '||o."orderNumber"||'.','/tailor/orders/'||NEW."orderId");
 END IF;
 IF TG_OP='UPDATE' AND NEW."status"='FAILED_ATTEMPT' AND OLD."status" IS DISTINCT FROM NEW."status" THEN
   PERFORM sm_notify_admin('failed-delivery:'||NEW."id"||':'||NEW."attempts",'DELIVERY_EXCEPTION',
    'Delivery attempt failed','Parcel for '||o."orderNumber"||' needs reassignment.','/admin/logistics');
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sm_courier_job_notify AFTER INSERT OR UPDATE OF "status","courierId","attempts" ON "LogisticsJob"
 FOR EACH ROW EXECUTE FUNCTION sm_courier_job_trigger();

CREATE OR REPLACE FUNCTION sm_handoff_trigger() RETURNS TRIGGER AS $$
DECLARE j RECORD;
BEGIN
 SELECT j1."orderId",j1."courierId",o."orderNumber" INTO j
 FROM "LogisticsJob" j1 JOIN "Order" o ON o."id"=j1."orderId" WHERE j1."id"=NEW."jobId";
 IF FOUND AND j."courierId" IS NOT NULL THEN
 PERFORM sm_notify(j."courierId",'handoff:'||NEW."id",'HANDOFF_COMPLETE','Handoff verified',
  'Handoff evidence recorded for '||j."orderNumber"||'.','/delivery');
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sm_handoff_notify AFTER INSERT ON "LogisticsHandoff"
 FOR EACH ROW EXECUTE FUNCTION sm_handoff_trigger();

CREATE OR REPLACE FUNCTION sm_dispute_trigger() RETURNS TRIGGER AS $$
DECLARE o RECORD;
BEGIN
 SELECT o1."customerId",o1."orderNumber" INTO o FROM "Order" o1 WHERE o1."id"=NEW."orderId";
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  PERFORM sm_notify_admin('new-dispute:'||NEW."id",'CLAIM_OPENED','New claim awaiting review',
    'A claim was opened for '||o."orderNumber"||'.','/admin/disputes');
 ELSIF OLD."status" IS DISTINCT FROM NEW."status" THEN
  PERFORM sm_notify(o."customerId",'claim:'||NEW."id"||':'||NEW."status",'CLAIM_UPDATED',
   'Claim status updated','Your claim for '||o."orderNumber"||' is '||NEW."status"||'.','/orders/'||NEW."orderId");
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sm_dispute_notify AFTER INSERT OR UPDATE OF "status" ON "Dispute" FOR EACH ROW EXECUTE FUNCTION sm_dispute_trigger();

CREATE OR REPLACE FUNCTION sm_refund_trigger() RETURNS TRIGGER AS $$
DECLARE o RECORD;
BEGIN
 SELECT "customerId","orderNumber" INTO o FROM "Order" WHERE "id"=NEW."orderId";
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
  PERFORM sm_notify(o."customerId",'refund:'||NEW."id"||':'||NEW."status",'REFUND_UPDATED',
   'Refund update','Refund status for '||o."orderNumber"||' is '||NEW."status"||'.','/orders/'||NEW."orderId");
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sm_refund_notify AFTER INSERT OR UPDATE OF "status" ON "Refund" FOR EACH ROW EXECUTE FUNCTION sm_refund_trigger();

CREATE OR REPLACE FUNCTION sm_tailor_trigger() RETURNS TRIGGER AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW."status"='PENDING' THEN
  PERFORM sm_notify_admin('tailor-application:'||NEW."id",'TAILOR_APPLICATION','New tailor application',
   'A tailoring workshop is awaiting approval.','/admin/tailors');
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sm_tailor_notify AFTER INSERT ON "Tailor" FOR EACH ROW EXECUTE FUNCTION sm_tailor_trigger();

CREATE OR REPLACE FUNCTION sm_delivery_partner_trigger() RETURNS TRIGGER AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW."status"='PENDING' THEN
  PERFORM sm_notify_admin('rider-application:'||NEW."id",'RIDER_APPLICATION','Delivery partner application',
    'A delivery partner is awaiting verification.','/admin/delivery-partners');
 ELSIF TG_OP='UPDATE' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
  PERFORM sm_notify(NEW."userId",'rider-status:'||NEW."id"||':'||NEW."status",
   'RIDER_STATUS','Delivery partner status updated',
   'Your delivery account status is now '||NEW."status"||'.','/delivery');
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sm_delivery_partner_notify AFTER INSERT OR UPDATE OF "status" ON "DeliveryPartner" FOR EACH ROW EXECUTE FUNCTION sm_delivery_partner_trigger();

CREATE OR REPLACE FUNCTION sm_review_trigger() RETURNS TRIGGER AS $$
DECLARE t RECORD;
BEGIN
 SELECT o."tailorId",t1."ownerId",o."orderNumber" INTO t
 FROM "Order" o JOIN "Tailor" t1 ON t1."id"=o."tailorId" WHERE o."id"=NEW."orderId";
 IF FOUND THEN
 PERFORM sm_notify(t."ownerId",'review:'||NEW."id",'NEW_REVIEW','New customer review',
  'A customer reviewed '||t."orderNumber"||'.','/tailor/orders/'||NEW."orderId");
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sm_review_notify AFTER INSERT ON "Review" FOR EACH ROW EXECUTE FUNCTION sm_review_trigger();

CREATE OR REPLACE FUNCTION sm_payout_trigger() RETURNS TRIGGER AS $$
DECLARE t RECORD;
BEGIN
 SELECT "ownerId" INTO t FROM "Tailor" WHERE "id"=NEW."tailorId";
 IF FOUND AND (TG_OP='INSERT' OR (TG_OP='UPDATE' AND NEW."status" IS DISTINCT FROM OLD."status")) THEN
 PERFORM sm_notify(t."ownerId",'payout:'||NEW."id"||':'||NEW."status",'PAYOUT_UPDATED',
  'Payout status updated','Your payout is now '||NEW."status"||'.','/tailor/earnings');
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sm_payout_notify AFTER INSERT OR UPDATE OF "status" ON "TailorPayout" FOR EACH ROW EXECUTE FUNCTION sm_payout_trigger();

-- Driver availability: only approved drivers in the matching service zone are notified.
-- No addresses or customer PII are included in the notification body.
CREATE OR REPLACE FUNCTION sm_available_job_trigger() RETURNS TRIGGER AS $$
DECLARE rider RECORD; code TEXT; o RECORD;
BEGIN
 SELECT o1."orderNumber",a."pincode" INTO o FROM "Order" o1
 JOIN "Address" a ON a."id"=o1."pickupAddressId" WHERE o1."id"=NEW."orderId";
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF NEW."courierId" IS NULL AND NEW."status" IN ('UNASSIGNED','PICKUP_SCHEDULED') THEN
 FOR rider IN SELECT dp."userId" FROM "DeliveryPartner" dp
 WHERE dp."status"='APPROVED' AND dp."available"=true AND dp."servicePincode"=(
   CASE WHEN NEW."direction" IN ('OUTBOUND','REWORK_OUTBOUND')
   THEN (SELECT "pincode" FROM "Tailor" WHERE "id"=(SELECT "tailorId" FROM "Order" WHERE "id"=NEW."orderId"))
   ELSE o."pincode" END
 )
 LOOP
 PERFORM sm_notify(rider."userId",'available-job:'||NEW."id",'DELIVERY_AVAILABLE',
  'New delivery available','A new delivery is available near your service area.','/delivery');
 END LOOP;
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sm_available_job_notify AFTER INSERT ON "LogisticsJob" FOR EACH ROW EXECUTE FUNCTION sm_available_job_trigger();
