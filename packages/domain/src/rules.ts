/** No NestJS/Prisma dependencies: business invariants shared by all runtimes. */
export const ORDER_STATUSES = [
  'DRAFT','QUOTE_REQUESTED','QUOTE_PENDING','QUOTE_READY','QUOTE_ACCEPTED',
  'PAYMENT_PENDING','PAID','PICKUP_SCHEDULED','INBOUND_TRANSIT',
  'MATERIAL_RECEIVED','IN_PRODUCTION','QUALITY_CHECK','RETURN_PICKUP_SCHEDULED',
  'OUTBOUND_TRANSIT','DELIVERED','COMPLETED','CANCELLED','QUOTE_EXPIRED',
  'TAILOR_DECLINED','PAYMENT_FAILED','MATERIAL_ISSUE','AMENDMENT_PENDING','DISPUTED',
  'REWORK_REQUESTED','REWORK_APPROVED','REWORK_IN_PROGRESS'
] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];
export const ALLOWED_ORDER_TRANSITIONS: Partial<Record<OrderStatus, readonly OrderStatus[]>> = {
  DRAFT:['QUOTE_REQUESTED','CANCELLED'],
  QUOTE_REQUESTED:['QUOTE_PENDING','TAILOR_DECLINED','CANCELLED'],
  QUOTE_PENDING:['QUOTE_READY','TAILOR_DECLINED','CANCELLED'],
  QUOTE_READY:['QUOTE_ACCEPTED','QUOTE_EXPIRED','QUOTE_READY','CANCELLED'],
  QUOTE_ACCEPTED:['PAYMENT_PENDING','CANCELLED'],
  PAYMENT_PENDING:['PAID','PAYMENT_FAILED','CANCELLED'],
  PAYMENT_FAILED:['PAYMENT_PENDING','CANCELLED'],
  PAID:['PICKUP_SCHEDULED','CANCELLED'],
  PICKUP_SCHEDULED:['INBOUND_TRANSIT','CANCELLED'],
  INBOUND_TRANSIT:['MATERIAL_RECEIVED','MATERIAL_ISSUE'],
  MATERIAL_RECEIVED:['IN_PRODUCTION','MATERIAL_ISSUE'],
  MATERIAL_ISSUE:['MATERIAL_RECEIVED','CANCELLED'],
  IN_PRODUCTION:['QUALITY_CHECK','AMENDMENT_PENDING','MATERIAL_ISSUE'],
  AMENDMENT_PENDING:['IN_PRODUCTION','CANCELLED'],
  QUALITY_CHECK:['IN_PRODUCTION','RETURN_PICKUP_SCHEDULED'],
  RETURN_PICKUP_SCHEDULED:['OUTBOUND_TRANSIT'],
  OUTBOUND_TRANSIT:['DELIVERED'],
  DELIVERED:['COMPLETED','DISPUTED','REWORK_REQUESTED'],
  DISPUTED:['COMPLETED','REWORK_APPROVED'],
  REWORK_REQUESTED:['REWORK_APPROVED','COMPLETED'],
  REWORK_APPROVED:['REWORK_IN_PROGRESS'],
  REWORK_IN_PROGRESS:['QUALITY_CHECK'],
  COMPLETED:['DISPUTED'],
};
export function canTransition(from: string, to: string): boolean {
  return (ALLOWED_ORDER_TRANSITIONS[from as OrderStatus] ?? []).includes(to as OrderStatus);
}
export function assertTransition(from:string,to:string):void {
  if (!canTransition(from,to)) throw new Error(`Invalid order transition ${from} -> ${to}`);
}
export function parsePaise(input: string | number | bigint): bigint {
  if (typeof input === 'bigint') return input;
  if (typeof input === 'number' && (!Number.isSafeInteger(input) || input < 0)) throw new Error('Amount must be a nonnegative safe integer');
  if (typeof input === 'string' && !/^(0|[1-9]\d{0,14})$/.test(input)) throw new Error('Invalid integer paise');
  const value = BigInt(input);
  if (value < 0n || value > 999999999999999n) throw new Error('Amount out of range');
  return value;
}
export type QuoteLineInput = {unitPricePaise:bigint;quantity:number};
export function calculateQuote(lines: QuoteLineInput[], logisticsPaise:bigint, taxPaise:bigint, discountPaise:bigint) {
  if (!lines.length || lines.some(x=>!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>20||x.unitPricePaise<0n)) throw new Error('Invalid quote lines');
  if ([logisticsPaise,taxPaise,discountPaise].some(x=>x<0n)) throw new Error('Negative adjustment');
  const subtotalPaise = lines.reduce((s,l)=>s+l.unitPricePaise*BigInt(l.quantity),0n);
  const totalPaise = subtotalPaise+logisticsPaise+taxPaise-discountPaise;
  if(totalPaise<0n) throw new Error('Discount exceeds charge');
  return {subtotalPaise,logisticsPaise,taxPaise,discountPaise,totalPaise};
}
export function commissionPaise(subtotalPaise:bigint, basisPoints:number):bigint {
  if(!Number.isInteger(basisPoints)||basisPoints<0||basisPoints>10000) throw new Error('Invalid commission rate');
  return (subtotalPaise*BigInt(basisPoints)+5000n)/10000n;
}
export function isQuoteAcceptable(latest:{id:string;status:string;validUntil:Date},requestedId:string, now=new Date()): boolean {
  return latest.id===requestedId && latest.status==='ISSUED' && latest.validUntil.getTime()>now.getTime();
}
export function requiredMaterialReady(serviceType:string, item:{hasMeasurement:boolean;hasSample:boolean;hasReference:boolean;hasBeforePhoto:boolean;hasInstructions:boolean}):boolean {
  if(serviceType==='CUSTOM_STITCHING') return (item.hasMeasurement || item.hasSample) && item.hasReference;
  if(serviceType==='ALTERATION') return item.hasBeforePhoto && item.hasInstructions;
  return false;
}
