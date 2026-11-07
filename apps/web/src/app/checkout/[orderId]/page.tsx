'use client';
import {useParams,useRouter} from 'next/navigation';
import {useRef,useState} from 'react';
import Link from 'next/link';
import {RequireAuth} from '@/components/Auth';
import {Order,PageTitle,useLoad,Alert} from '@/components/Shared';
import {money,post} from '@/lib/api';

type RazorpayInstance={open:()=>void;on?:(event:string,handler:(details:unknown)=>void)=>void};
declare global{interface Window{Razorpay?:new(options:Record<string,unknown>)=>RazorpayInstance}}
type PaymentMode={mode:'demo'|'razorpay_test'|'razorpay_live'|'unconfigured'|'live_keys_blocked'|'invalid_key_id';checkoutAvailable:boolean;simulationConfirmAvailable?:boolean};
async function ensureRazorpayLoaded():Promise<void>{
 if(window.Razorpay)return;
 await new Promise<void>((resolve,reject)=>{
  const script=document.createElement('script');
  const timeout=window.setTimeout(()=>{script.remove();reject(new Error('Razorpay Checkout script timed out. Check browser network/ad-blocker.'));},12000);
  script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;
  script.onload=()=>{window.clearTimeout(timeout);resolve();};
  script.onerror=()=>{window.clearTimeout(timeout);script.remove();reject(new Error('Could not load Razorpay Checkout. Check browser network/ad-blocker.'));};
  document.head.appendChild(script);
 });
 if(!window.Razorpay)throw new Error('Razorpay Checkout did not initialize.');
}
export default function Checkout(){return <RequireAuth><Screen/></RequireAuth>}
function Screen(){
 const {orderId}=useParams<{orderId:string}>(),router=useRouter();
 const {data:o,error}=useLoad<Order>(`/orders/${orderId}`);
 const {data:mode,error:modeError}=useLoad<PaymentMode>('/payments/mode');
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[failure,setFailure]=useState(''),[dev,setDev]=useState(false);
 const key=useRef<string>('');
 const quote=o?.quotes?.find(q=>q.id===o.acceptedQuoteId);
 const allowed=['QUOTE_ACCEPTED','PAYMENT_PENDING','PAYMENT_FAILED'].includes(o?.status||'');
 async function checkout(){
  setBusy(true);setNotice('');setFailure('');
  try{
   if(mode&&!mode.checkoutAvailable)throw new Error('Razorpay is not configured for testing. Check the payment-mode notice below.');
   if(!key.current)key.current=crypto.randomUUID()+'-checkout';
   const data=await post<{provider:string;providerOrderId:string;amountPaise:string;keyId?:string;simulated:boolean}>(
    `/orders/${orderId}/checkout`,{}, {'Idempotency-Key':key.current});
   if(data.simulated){setDev(true);setNotice('Local demo payment selected. Razorpay UI intentionally will not open in mock mode.');return;}
   if(data.provider!=='RAZORPAY'||!data.keyId?.startsWith('rzp_'))throw new Error('Razorpay checkout key is missing or payment provider is invalid.');
   setDev(false);
   await ensureRazorpayLoaded();
   if(!window.Razorpay)throw new Error('Razorpay Checkout is unavailable.');
   const razorpay=new window.Razorpay({
    key:data.keyId,amount:Number(data.amountPaise),currency:'INR',name:'StitchMate',
    description:'Tailoring and doorstep delivery',order_id:data.providerOrderId,
    handler:()=>setNotice('Payment submitted. Your order will update only after a verified Razorpay capture webhook.'),
    modal:{ondismiss:()=>setNotice('Checkout window closed. No payment confirmation received.')}
   });
   razorpay.on?.('payment.failed',()=>setFailure('Razorpay payment failed. You can retry the checkout; no order will be marked paid without verification.'));
   razorpay.open();
  }catch(e){setFailure((e as Error).message);}finally{setBusy(false);}
 }
 async function simulate(){
  setBusy(true);setNotice('');setFailure('');
  try{await post(`/dev/payments/${orderId}/confirm`);router.push(`/orders/${orderId}`);}
  catch(e){setFailure((e as Error).message);}finally{setBusy(false);}
 }
 const modeLabel=mode?.mode==='demo'?'Local simulation — Razorpay popup disabled':
  mode?.mode==='razorpay_test'?'Razorpay TEST checkout (no real funds)':
  mode?.mode==='razorpay_live'?'Razorpay LIVE checkout':
  mode?.mode==='live_keys_blocked'?'Live keys are blocked in local development. Use rzp_test_ keys.':
  mode?.mode==='invalid_key_id'?'Invalid Razorpay Key ID format':
  mode?.mode==='unconfigured'?'Razorpay keys missing from API .env':'Checking payment mode...';
 return <div className="container">
  <PageTitle eyebrow="Secure payment" title="Review your order" lead="Pay only after accepting your tailor's quotation. Backend verification confirms a successful payment."/>
  <div className="grid-2" style={{paddingBottom:100}}><section className="card">
   <h3>Quotation summary</h3>
   <div className="notice"><strong>Payment mode:</strong> {modeLabel}
    {mode?.mode==='demo'&&<p className="small-note">To open real Razorpay TEST Checkout, set MOCK_PAYMENT_ENABLED=false in the API .env, configure rzp_test_ keys, and restart the API.</p>}
    {mode?.mode==='live_keys_blocked'&&<p className="small-note">Do not use live company/merchant keys on this local pilot site.</p>}
   </div>
   {quote?<>
    <div className="price-row">Garment work<span>{money(quote.subtotalPaise)}</span></div>
    <div className="price-row">Pickup and return delivery<span>{money(quote.logisticsPaise)}</span></div>
    <div className="price-row">Taxes<span>{money(quote.taxPaise)}</span></div>
    <div className="price-row">Discount<span>-{money(quote.discountPaise)}</span></div>
    <div className="price-row"><strong>Total</strong><strong>{money(quote.totalPaise)}</strong></div>
    <p className="small-note">Order: {o?.orderNumber}</p>
    <button className="btn" disabled={busy||!allowed||!mode?.checkoutAvailable} onClick={checkout}>
     {busy?'Opening checkout...':mode?.mode==='demo'?'Continue with demo payment':'Open Razorpay secure checkout'}
    </button>
    {!allowed&&o&&<p className="small-note">Accept your tailor's quotation before checkout. Current status: {o.status}.</p>}
    {dev&&<div className="notice"><strong>Local simulation only</strong><p>No money will be collected. This is not a Razorpay test payment.</p>
     {mode?.simulationConfirmAvailable?<button className="btn clay" disabled={busy} onClick={simulate}>Simulate successful payment</button>:<p className="small-note">Local demo confirmation is disabled. Set ENABLE_DEMO_PAYMENT_CONFIRM=true in local .env only if you intend to simulate payments.</p>}</div>}
    <Alert error={failure||modeError} success={notice}/>
   </>:<p>Accepted quote unavailable. <Link className="text-link" href={`/orders/${orderId}`}>Return to order</Link></p>}
   {error&&<p className="error">{error}</p>}
  </section><aside className="card"><h3>What happens after payment?</h3>
   <p>1. Razorpay verifies and captures your payment.<br/>2. The signed backend webhook marks your order paid.<br/>3. Schedule your doorstep fabric pickup.<br/>4. Your tailor completes the work and returns your garment.</p>
   <p className="small-note">For local test checkout, configure test merchant credentials and a publicly reachable, signed test webhook. Checkout success alone never marks an order paid.</p>
  </aside></div>
 </div>;
}
