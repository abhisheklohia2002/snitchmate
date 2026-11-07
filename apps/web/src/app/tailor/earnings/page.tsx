'use client';
import {Portal} from '@/components/Portal';
import {PageTitle,useLoad} from '@/components/Shared';
import {money,dateTime,textStatus} from '@/lib/api';
type Payout={id:string;orderId:string;grossPaise:string;commissionPaise:string;netPaise:string;status:string;paidAt:string};
export default function Earnings(){const {data,error}=useLoad<Payout[]>('/tailor/earnings');return <Portal role="tailor"><PageTitle eyebrow="Transparent finance" title="Earnings & payouts" lead="See gross service fees, marketplace commission and payment status for completed orders."/>{error&&<p className="error">{error}</p>}<div className="card table-scroll"><table><thead><tr><th>Order</th><th>Gross</th><th>Commission</th><th>Net</th><th>Status</th></tr></thead><tbody>{data?.map(p=><tr key={p.id}><td>{p.orderId.slice(0,8)}…</td><td>{money(p.grossPaise)}</td><td>{money(p.commissionPaise)}</td><td><strong>{money(p.netPaise)}</strong></td><td><span className="pill">{textStatus(p.status)}</span></td></tr>)}</tbody></table>{!data?.length&&<p>No payable earnings yet. Payouts are approved only after order completion and the fitting claim window.</p>}</div></Portal>}
