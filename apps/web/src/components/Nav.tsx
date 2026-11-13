'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Menu,Scissors,ShoppingBag,UserRound} from 'lucide-react';
import {useState} from 'react';
import {post} from '@/lib/api';
import {useAuth} from './Auth';
export function Nav(){const {user,refresh}=useAuth();const path=usePathname();const [open,setOpen]=useState(false);const links = [['/services','Services'],['/gigs','Gigs'],['/tailors','Find tailors'],['/orders','My orders'],['/measurements','Measurements']] as const;return <header className="site-header"><nav className="nav container"><Link href="/" className="brand"><span className="brand-icon"><Scissors size={22}/></span><span>stitch<span className="brand-accent">mate.</span></span></Link><button className="mobile-menu" onClick={()=>setOpen(!open)} aria-label="Toggle menu"><Menu size={24}/></button><div className={`nav-links ${open?'nav-links-open':''}`}>{links.map(([href,label])=><Link key={href} onClick={()=>setOpen(false)} className={path===href?'active':''} href={href}>{label}</Link>)}{user?.roles.includes('tailor_owner')&&<Link href="/tailor/dashboard">Tailor portal</Link>}{user&&<Link href="/delivery">Deliver with us</Link>}{user?.roles.includes('admin')&&<Link href="/admin">Admin</Link>}{user?<><Link href="/profile" className="outline-btn"><UserRound size={16}/> Account</Link><button className="link-button" onClick={async()=>{await post('/auth/logout');await refresh();location.href='/';}}>Sign out</button></>:<Link className="nav-cta" href="/login">Sign in <ShoppingBag size={16}/></Link>}</div></nav></header>}
