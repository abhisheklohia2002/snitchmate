'use client';
import Link from 'next/link';
import {RequireAuth} from '@/components/Auth';
import {PageTitle,useLoad,Alert,Order,Busy} from '@/components/Shared';
import {dateTime,money,textStatus} from '@/lib/api';
export default function Orders(){return <RequireAuth><Screen/></RequireAuth>}
function Screen(){const {data,error,loading}=useLoad<Order[]>('/orders');return <div className="container"><PageTitle eyebrow="Track every stitch" title="My orders" lead="Follow quote requests, payment confirmation, pickup, stitching and return delivery."/><Alert error={error}/><Busy loading={loading}/><div className="rows" style={{paddingBottom:80}}>{data?.length?data.map(o=><div key={o.id} className="row-card"><div><span className="eyebrow">{o.orderNumber}</span><h3 style={{margin:'8px 0'}}>{o.tailor?.shopName||'Tailoring order'}</h3><p>{o.items.map(i=>i.category.title).join(', ')} · {dateTime(o.createdAt)}</p><span className="pill orange">{textStatus(o.status)}</span></div><Link className="btn small" href={`/orders/${o.id}`}>View details →</Link></div>):!loading&&<div className="empty"><h3>No orders yet</h3><p>Explore verified tailors and request your first quote.</p><Link className="btn" href="/tailors">Find a tailor</Link></div>}</div></div>}
