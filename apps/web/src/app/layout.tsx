import type {Metadata} from 'next';
import './globals.css';
import 'leaflet/dist/leaflet.css';
import {AuthProvider} from '@/components/Auth';
import {Nav} from '@/components/Nav';
export const metadata:Metadata={title:'StitchMate | Tailoring at your doorstep',description:'Find verified local tailors for custom stitching and clothing alterations. We pick up and deliver your garments.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><AuthProvider><Nav/><main>{children}</main><footer className="footer"><div className="container foot-grid"><div><span className="brand footer-brand">stitchmate.</span><p>Made to fit your life.<br/>Custom stitching and alterations, right to your door.</p></div><div><strong>Explore</strong><a href="/services">Our services</a><a href="/tailors">Find a tailor</a><a href="/tailor/onboarding">Partner with us</a></div><div><strong>Help</strong><a href="/help">How it works & policies</a><a href="/profile">Your account</a><a href="/orders">Track an order</a></div></div><div className="container foot-bottom">© 2026 StitchMate. Pilot service area: selected Delhi NCR pincodes. All orders require an approved tailor quote.</div></footer></AuthProvider></body></html>}
