'use client';
import Link from 'next/link';
import {Portal} from '@/components/Portal';
import {PageTitle,useLoad,Order} from '@/components/Shared';
import {textStatus} from '@/lib/api';
export default function TailorOrders(){const {data,error}=useLoad<Order[]>('/tailor/orders');return <Portal role="tailor"><PageTitle eyebrow="Workshop queue" title="Production orders" lead="Material receipts, stitching milestones and quality handoffs are tracked per garment."/>{error&&<p className="error">{error}</p>}<div className="rows">{data?.map(o=><div key={o.id} className="row-card"><div><h3>{o.orderNumber}</h3><p>{o.items.map(i=>i.category.title).join(', ')}</p><span className="pill">{textStatus(o.status)}</span></div><Link className="btn small" href={`/tailor/orders/${o.id}`}>Manage →</Link></div>)}{!data?.length&&<p>Your production queue is empty.</p>}</div></Portal>}
