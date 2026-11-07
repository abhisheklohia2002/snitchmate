/**
 * StitchMate durable outbox worker. Order and money state remain owned by API.
 * MSGKART is used ONLY for authentication/handoff OTP in the API.
 * Twilio is used for opted-in customer order-status WhatsApp notifications here.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { isWhatsAppTopic, sendTwilioWhatsApp, validateTwilioConfig } from './twilio-whatsapp';

const db = new PrismaClient();
const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
const queue = new Queue('notifications', { connection });
const production = process.env.NODE_ENV === 'production';
const provider = process.env.NOTIFICATION_PROVIDER ?? 'mock';
const supportedTopics = ['order.completed', 'payment.captured', 'order.quote_ready', 'order.status_changed'];
if (!['twilio', 'mock'].includes(provider)) throw new Error('NOTIFICATION_PROVIDER must be twilio or mock');
if (production && provider !== 'twilio') throw new Error('Production requires Twilio for WhatsApp notifications');
if (provider === 'twilio') validateTwilioConfig();

type EventPayload = { eventId: string; topic: string; data: unknown };
function orderDetails(data: unknown): { orderId: string; status?: string } {
  if (!data || typeof data !== 'object' || !('orderId' in data) || typeof data.orderId !== 'string' || !/^[a-f0-9-]{36}$/i.test(data.orderId)) {
    throw new Error('Notification event is missing a valid orderId');
  }
  const status = 'status' in data && typeof data.status === 'string' ? data.status : undefined;
  return { orderId: data.orderId, status };
}
async function dispatch(payload: EventPayload): Promise<'SENT' | 'SKIPPED'> {
  if (!isWhatsAppTopic(payload.topic)) throw new Error('Unsupported notification topic');
  const { orderId, status } = orderDetails(payload.data);
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { orderNumber: true, customer: { select: { phone: true, whatsappNotificationsOptInAt: true } } },
  });
  if (!order) throw new Error('Notification order no longer exists');
  if (!order.customer.whatsappNotificationsOptInAt) return 'SKIPPED';
  if (provider === 'mock') {
    console.info('[DEV ONLY] WhatsApp notification preview', payload.eventId, payload.topic, order.orderNumber);
    return 'SENT';
  }
  await sendTwilioWhatsApp(order.customer.phone, payload.topic, order.orderNumber, status);
  return 'SENT';
}
const worker = new Worker('notifications', async job => {
  const result = await dispatch(job.data as EventPayload);
  await db.outboxEvent.updateMany({
    where: { id: job.id, status: { notIn: ['SENT', 'SKIPPED'] } },
    data: { status: result, processedAt: new Date() },
  });
}, { connection, concurrency: 3, limiter: { max: 5, duration: 1000 } });
worker.on('failed', (job, error) => console.error('Notification attempt failed', job?.id, error.message));

async function drain() {
  const events = await db.outboxEvent.findMany({
    where: { status: { in: ['PENDING', 'RETRY'] }, nextRunAt: { lte: new Date() }, topic: { in: supportedTopics } },
    orderBy: { createdAt: 'asc' }, take: 50,
  });
  for (const e of events) {
    try {
      await queue.add('dispatch', { eventId: e.id, topic: e.topic, data: e.payload }, {
        jobId: e.id, attempts: 5, backoff: { type: 'exponential', delay: 1500 },
        removeOnComplete: { age: 86400 }, removeOnFail: { age: 7 * 86400 },
      });
      await db.outboxEvent.updateMany({
        where: { id: e.id, status: { in: ['PENDING', 'RETRY'] } },
        data: { status: 'QUEUED', attempts: { increment: 1 } },
      });
    } catch (error) { console.error('Notification enqueue failed', e.id, error); }
  }
  await db.outboxEvent.updateMany({
    where: { status: 'QUEUED', processedAt: null, createdAt: { lt: new Date(Date.now() - 30 * 60_000) } },
    data: { status: 'RETRY', nextRunAt: new Date(Date.now() + 60_000) },
  });
}
let stopped = false;
async function run() { while (!stopped) { try { await drain(); } catch (error) { console.error('Outbox poll failed', error); } await new Promise(resolve => setTimeout(resolve, 10000)); } }
async function stop() { stopped = true; await worker.close(); await queue.close(); await connection.quit(); await db.$disconnect(); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
run().catch(error => { console.error(error); process.exitCode = 1; });
