'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {BadgeIndianRupee,ClipboardList,FileCheck2,LayoutDashboard,MapPinned,Package,Scissors,ShieldCheck,Truck,UsersRound,Wallet} from 'lucide-react';
import {useAuth,RequireAuth} from './Auth';
import type {ReactNode} from 'react';

const tailorEntries=[
 {href:'/tailor/dashboard',label:'Overview',Icon:LayoutDashboard},
 {href:'/tailor/location',label:'Shop location',Icon:MapPinned},
 {href:'/tailor/requests',label:'Quote requests',Icon:ClipboardList},
 {href:'/tailor/orders',label:'Production orders',Icon:Package},
 {href:'/tailor/services',label:'Services & pricing',Icon:Scissors},
 {href:'/tailor/gigs',label:'Manage gigs',Icon:FileCheck2},
 {href:'/tailor/earnings',label:'Earnings',Icon:Wallet}
] as const;
const adminEntries=[
 {href:'/admin',label:'Overview',Icon:LayoutDashboard},
 {href:'/admin/tailors',label:'Tailor approval',Icon:UsersRound},
 {href:'/admin/orders',label:'All orders',Icon:Package},
 {href:'/admin/logistics',label:'Courier logistics',Icon:Truck},
 {href:'/admin/disputes',label:'Claims',Icon:ShieldCheck},
 {href:'/admin/finance',label:'Finance',Icon:BadgeIndianRupee},
 {href:'/admin/delivery-partners',label:'Delivery partners',Icon:MapPinned}
] as const;

export function Portal({role,children}:{role:'tailor'|'admin';children:ReactNode}){
 const pathname=usePathname(),{user}=useAuth();
 const entries=role==='tailor'?tailorEntries:adminEntries;
 const access=role==='admin'?user?.roles.some(r=>['admin','finance'].includes(r)):user?.roles.some(r=>['tailor_owner','tailor_staff'].includes(r));
 const selected=(href:string)=>pathname===href||(pathname.startsWith(href+'/')&&href!=='/'+role);
 return <RequireAuth><div className="container portal-layout">
   <aside className="portal-sidebar" aria-label={role==='tailor'?'Tailor workspace':'Admin workspace'}>
    <div className="portal-sidebar-heading">
     <span className="portal-sidebar-icon">{role==='tailor'?<Scissors size={19}/>:<ShieldCheck size={19}/>}</span>
     <div><span className="eyebrow">StitchMate workspace</span><strong>{role==='tailor'?'Tailor studio':'Operations'}</strong></div>
    </div>
    <div className="portal-sidebar-label">Workspace</div>
    <nav className="portal-nav" aria-label={role==='tailor'?'Tailor sections':'Admin sections'}>{entries.map(({href,label,Icon})=><Link key={href} href={href} className={'portal-nav-link'+(selected(href)?' active':'')} aria-current={selected(href)?'page':undefined}><Icon size={18} strokeWidth={1.8}/><span>{label}</span></Link>)}</nav>
    <div className="portal-sidebar-footer"><span className="portal-sidebar-footer-icon"><ShieldCheck size={18}/></span><p>Your workspace is protected with account permissions.</p></div>
   </aside>
   <section className="portal-content">
    {access?children:<div className="card access-required"><div className="access-icon"><ShieldCheck size={28}/></div><h2>Access required</h2><p>{role==='tailor'?'Register a tailor shop and wait for admin approval before accessing this portal.':'This area is restricted to StitchMate operations.'}</p>{role==='tailor'&&<Link className="btn" href="/tailor/onboarding">Register your shop</Link>}</div>}
   </section>
  </div></RequireAuth>;
}