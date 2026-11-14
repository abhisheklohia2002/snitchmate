-- AI Studio tables only; the existing booking/payment/delivery schema is untouched.
CREATE TABLE "AiConversation" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'New tailoring idea',
  "requirements" JSONB,
  "brief" JSONB,
  "referenceImageIds" JSONB,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AiMessage" (
  "id" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "imageFileIds" JSONB,
  "requestId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AiDailyUsage" (
  "userId" UUID NOT NULL,
  "day" TEXT NOT NULL,
  "requests" INTEGER NOT NULL DEFAULT 0,
  "tokensUsed" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "AiDailyUsage_pkey" PRIMARY KEY ("userId","day")
);
CREATE INDEX "AiConversation_userId_updatedAt_idx" ON "AiConversation"("userId","updatedAt" DESC);
CREATE UNIQUE INDEX "AiMessage_conversationId_role_requestId_key" ON "AiMessage"("conversationId","role","requestId");
CREATE INDEX "AiMessage_conversationId_createdAt_idx" ON "AiMessage"("conversationId","createdAt");
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiDailyUsage" ADD CONSTRAINT "AiDailyUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
