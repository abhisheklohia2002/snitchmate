import type {Metadata} from 'next';
import Link from 'next/link';
import {ArrowUpRight,Scissors,ShieldCheck,Truck} from 'lucide-react';
import './globals.css';
import 'leaflet/dist/leaflet.css';
import {AuthProvider} from '@/components/Auth';
import {Nav} from '@/components/Nav';
import {AntdRegistry} from '@ant-design/nextjs-registry';
import {StitchThemeProvider} from '@/components/ThemeProvider';
import {NotificationProvider} from '@/components/NotificationProvider';
import {initialThemeScript} from '@/lib/theme-script';

export const metadata:Metadata={
 title:'StitchMate | Tailoring at your doorstep',
 description:'Find verified local tailors for custom stitching and clothing alterations. We pick up and deliver your garments.'
};

export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:initialThemeScript}}/></head><body><AntdRegistry><StitchThemeProvider><AuthProvider><NotificationProvider><Nav/>
  {process.env.NEXT_PUBLIC_STITCHMATE_STAGE==='true'&&<div role="status" className="staging-banner">STITCHMATE STAGING DEMO — No real payments, OTPs or deliveries. Test data only.</div>}
  <main id="main-content">{children}</main>
  <footer className="footer">
    <div className="container footer-main">
     <div className="footer-intro">
      <Link href="/" className="brand footer-brand"><span className="brand-icon"><Scissors size={21}/></span><span className="brand-wordmark">stitch<span className="brand-accent">mate</span><span className="brand-dot">.</span></span></Link>
      <p>Good tailoring should feel effortless. We bring local craftsmanship, thoughtful fitting and doorstep convenience together.</p>
      <div className="footer-trust"><span><ShieldCheck size={15}/> Verified local tailors</span><span><Truck size={15}/> Two-way delivery</span></div>
     </div>
     <div className="footer-column"><h3>Discover</h3><Link href="/services">Our services</Link><Link href="/gigs">Tailoring gigs</Link><Link href="/tailors">Find a tailor</Link></div>
     <div className="footer-column"><h3>Your StitchMate</h3><Link href="/orders">Track an order</Link><Link href="/measurements">Measurements</Link><Link href="/profile">Your account</Link></div>
     <div className="footer-column"><h3>For partners</h3><Link href="/tailor/onboarding">Become a tailor</Link><Link href="/delivery">Deliver with us</Link><Link href="/help">Help & policies</Link></div>
    </div>
    <div className="container footer-bottom"><span>© {new Date().getFullYear()} StitchMate. Made to fit your life.</span><span>Currently serving selected Delhi NCR pincodes · <Link href="/help">Policies <ArrowUpRight size={13}/></Link></span></div>
  </footer>
 </NotificationProvider></AuthProvider></StitchThemeProvider></AntdRegistry></body></html>;
}
