'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Dialog,DialogBackdrop,DialogPanel,DialogTitle,Menu,MenuButton,MenuItem,MenuItems} from '@headlessui/react';
import {ArrowRight,ChevronDown,LogOut,Menu as MenuIcon,Package,Scissors,ShieldCheck,Truck,UserRound,X,Ruler} from 'lucide-react';
import {useEffect,useState} from 'react';
import {post} from '@/lib/api';
import {useAuth} from './Auth';

const discovery=[
 {href:'/services',label:'Services'},
 {href:'/gigs',label:'Explore gigs'},
 {href:'/tailors',label:'Find tailors'}
] as const;
export function Nav(){
 const {user,refresh}=useAuth();
 const pathname=usePathname();
 const [drawerOpen,setDrawerOpen]=useState(false);
 useEffect(()=>setDrawerOpen(false),[pathname]);
 const active=(href:string)=>pathname===href||(href!=='/'&&pathname.startsWith(href+'/'));
 const personal=[
  {href:'/orders',label:'My orders',Icon:Package},
  {href:'/measurements',label:'Measurements',Icon:Ruler},
  {href:'/profile',label:'My account',Icon:UserRound}
 ];
 const workspaces=[
  ...(user?.roles.some(r=>r==='tailor_owner'||r==='tailor_staff')?[{href:'/tailor/dashboard',label:'Tailor portal',Icon:Scissors}]:[]),
  ...(user?[{href:'/delivery',label:'Delivery partner',Icon:Truck}]:[]),
  ...(user?.roles.some(r=>r==='admin'||r==='finance')?[{href:'/admin',label:'Admin dashboard',Icon:ShieldCheck}]:[])
 ];
 async function signOut(){
  await post('/auth/logout');
  await refresh();
  window.location.assign('/');
 }
 return <header className="site-header">
   <a href="#main-content" className="skip-link">Skip to main content</a>
   <div className="nav container">
    <Link href="/" className="brand" aria-label="StitchMate home">
      <span className="brand-icon" aria-hidden="true"><Scissors size={22} strokeWidth={1.7}/></span>
      <span className="brand-wordmark">stitch<span className="brand-accent">mate</span><span className="brand-dot">.</span></span>
    </Link>
    <nav className="nav-primary" aria-label="Explore StitchMate">
      {discovery.map(link=><Link key={link.href} href={link.href} className={'nav-primary-link'+(active(link.href)?' active':'')} aria-current={active(link.href)?'page':undefined}>{link.label}</Link>)}
    </nav>
    <div className="nav-actions">
      {user?<>
       <Link className={'nav-orders-link'+(active('/orders')?' active':'')} href="/orders"><Package size={17}/><span>My orders</span></Link>
       <Menu as="div" className="account-menu">
        <MenuButton className="account-menu-button" aria-label="Open account navigation"><span className="account-avatar"><UserRound size={17}/></span><span className="account-text">Account</span><ChevronDown className="account-chevron" size={15}/></MenuButton>
        <MenuItems transition anchor="bottom end" className="account-dropdown">
          <div className="account-dropdown-heading"><span className="eyebrow">Your StitchMate</span><strong>{user.name?.trim()||'Welcome back'}</strong></div>
          {personal.map(({href,label,Icon})=><MenuItem key={href}><Link className={'account-dropdown-item'+(active(href)?' active':'')} href={href}><Icon size={17}/>{label}</Link></MenuItem>)}
          {workspaces.length>0&&<><div className="account-dropdown-divider"/><div className="account-dropdown-label">Workspaces</div>{workspaces.map(({href,label,Icon})=><MenuItem key={href}><Link className={'account-dropdown-item'+(active(href)?' active':'')} href={href}><Icon size={17}/>{label}</Link></MenuItem>)}</>}
          <div className="account-dropdown-divider"/>
          <MenuItem><button type="button" className="account-dropdown-item account-signout" onClick={signOut}><LogOut size={17}/>Sign out</button></MenuItem>
        </MenuItems>
       </Menu>
      </>:<Link className="nav-signin" href="/login">Sign in <ArrowRight size={16}/></Link>}
      <button type="button" className="mobile-menu" aria-label="Open navigation" aria-expanded={drawerOpen} onClick={()=>setDrawerOpen(true)}><MenuIcon size={23}/></button>
    </div>
   </div>
   <Dialog open={drawerOpen} onClose={setDrawerOpen} className="mobile-drawer-root">
     <DialogBackdrop transition className="mobile-drawer-backdrop"/>
     <div className="mobile-drawer-layout">
      <DialogPanel transition className="mobile-drawer-panel">
       <div className="mobile-drawer-top">
        <DialogTitle className="mobile-drawer-title">Explore StitchMate</DialogTitle>
        <button type="button" className="mobile-drawer-close" onClick={()=>setDrawerOpen(false)} aria-label="Close navigation"><X size={23}/></button>
       </div>
       <div className="mobile-drawer-body">
        <p className="mobile-nav-label">Discover</p>
        <nav className="mobile-nav-list" aria-label="Mobile discovery navigation">
         {discovery.map(link=><Link key={link.href} href={link.href} className={'mobile-nav-link'+(active(link.href)?' active':'')} aria-current={active(link.href)?'page':undefined} onClick={()=>setDrawerOpen(false)}><span>{link.label}</span><ArrowRight size={18}/></Link>)}
        </nav>
        {user&&<>
         <p className="mobile-nav-label">Your account</p>
         <nav className="mobile-nav-list" aria-label="Mobile account navigation">
          {personal.map(({href,label,Icon})=><Link key={href} href={href} className={'mobile-nav-link'+(active(href)?' active':'')} onClick={()=>setDrawerOpen(false)}><span className="mobile-nav-icon"><Icon size={18}/>{label}</span><ArrowRight size={16}/></Link>)}
         </nav>
         {workspaces.length>0&&<><p className="mobile-nav-label">Workspaces</p><nav className="mobile-nav-list" aria-label="Mobile workspace navigation">{workspaces.map(({href,label,Icon})=><Link key={href} href={href} className={'mobile-nav-link'+(active(href)?' active':'')} onClick={()=>setDrawerOpen(false)}><span className="mobile-nav-icon"><Icon size={18}/>{label}</span><ArrowRight size={16}/></Link>)}</nav></>}
        </>}
       </div>
       <div className="mobile-drawer-bottom">
        {user?<button type="button" className="btn secondary mobile-drawer-action" onClick={signOut}><LogOut size={18}/> Sign out</button>:<Link href="/login" className="btn mobile-drawer-action" onClick={()=>setDrawerOpen(false)}>Sign in to StitchMate <ArrowRight size={17}/></Link>}
        <p><Truck size={15}/> Pickup, tailored & delivered with care</p>
       </div>
      </DialogPanel>
     </div>
   </Dialog>
  </header>;
