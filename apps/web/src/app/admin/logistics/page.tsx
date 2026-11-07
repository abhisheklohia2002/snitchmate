'use client';
import {useState} from 'react';
import Link from 'next/link';
import {Portal} from '@/components/Portal';
import {PageTitle,useLoad,Alert} from '@/components/Shared';
import {post,upload,textStatus,dateTime} from '@/lib/api';

type Address={name:string;phone:string;line1:string;line2?:string;city:string;pincode:string};
type Job={id:string;direction:string;status:string;packageId:string;sealId:string|null;courierId:string|null;scheduledAt:string|null;attempts:number;order:{orderNumber:string;status:string;tailor:{shopName:string;address:string;pincode:string};pickupAddress:Address;returnAddress:Address;items:{quantity:number}[]}};
type Courier={id:string;name:string|null;phone:string};
function handoffLabel(job:Job){const inbound=job.direction==='INBOUND'||job.direction==='REWORK_INBOUND';if(job.status==='PICKED_UP')return inbound?'Courier → Tailor shop':'Courier → Customer';return inbound?'Customer → Courier':'Tailor → Courier';}
function addressDetails(job:Job){
 const inbound=job.direction==='INBOUND'||job.direction==='REWORK_INBOUND';
 const shop=`${job.order.tailor.address}, ${job.order.tailor.pincode}`;
 const customer=`${job.order.pickupAddress?.line1}, ${job.order.pickupAddress?.city} ${job.order.pickupAddress?.pincode}`;
 const returning=`${job.order.returnAddress?.line1}, ${job.order.returnAddress?.city} ${job.order.returnAddress?.pincode}`;
 return {from:inbound?customer:shop,to:inbound?shop:returning};
}
export default function Logistics(){
 const {data:jobs,refresh,error}=useLoad<Job[]>('/admin/logistics/jobs');
 const {data:couriers}=useLoad<Courier[]>('/admin/couriers');
 const [courierIds,setCouriers]=useState<Record<string,string>>({});
 const [codes,setCodes]=useState<Record<string,string>>({});
 const [count,setCount]=useState<Record<string,string>>({});
 const [seals,setSeals]=useState<Record<string,string>>({});
 const [photos,setPhotos]=useState<Record<string,string>>({});
 const [condition,setCondition]=useState<Record<string,string>>({});
 const [message,setMessage]=useState(''),[errorMessage,setErrorMessage]=useState(''),[busy,setBusy]=useState(false);
 async function act(path:string,body:unknown,jobId?:string,clearProof=false){
  setBusy(true);setMessage('');setErrorMessage('');
  try{await post(path,body);if(clearProof&&jobId){setCodes(x=>({...x,[jobId]:''}));setPhotos(x=>({...x,[jobId]:''}));}
   refresh();setMessage('Operation recorded. The workflow status has been updated.');}
  catch(e){setErrorMessage((e as Error).message);}finally{setBusy(false);}
 }
 async function attach(jobId:string,file?:File){
  if(!file)return;setBusy(true);setErrorMessage('');
  try{const id=await upload(file,'HANDOFF');setPhotos(x=>({...x,[jobId]:id}));setMessage('Handoff photograph verified.');}
  catch(e){setErrorMessage((e as Error).message);}finally{setBusy(false);}
 }
 return <Portal role="admin">
  <PageTitle eyebrow="Verified parcel custody" title="Pickup, handoff & return delivery" lead="Manage both delivery legs for every paid order. Each handoff needs a real courier, fresh OTP, matching piece count and verified condition photo."/>
  <div className="notice">Pilot dispatch is manual. Assign a courier with an existing <strong>courier</strong> role (seed locally using <code>COURIER_BOOTSTRAP_PHONE</code> and <code>pnpm db:seed</code>). Do not request OTP before the sender or receiver is present.</div>
  {!couriers?.length&&<div className="notice">No courier accounts yet. Configure a dedicated courier phone in project .env and run <code>pnpm db:seed</code>, then refresh.</div>}
  <Alert error={error||errorMessage} success={message}/>
  <div className="rows">{jobs?.map(j=>{
   const isInbound=j.direction==='INBOUND'||j.direction==='REWORK_INBOUND';
   const step=j.status==='PICKED_UP'?'RECIPIENT_DROPOFF':'SENDER_PICKUP';
   const canVerify=['ASSIGNED','PICKED_UP'].includes(j.status);
   const expected=j.order.items.reduce((sum,i)=>sum+i.quantity,0);
   const addresses=addressDetails(j);
   const stage=j.status==='PICKED_UP'?'Step 2 of 2: Deliver the parcel':'Step 1 of 2: Collect the parcel';
   const parcelCount=count[j.id]??String(expected);
   const seal=seals[j.id]??(j.sealId||'');
   return <section className="card" key={j.id}>
    <div className="list-header"><h3>{j.order.orderNumber} · {isInbound?'Customer fabric pickup':'Finished garment return'}</h3><span className="pill orange">{textStatus(j.status)}</span></div>
    <p><strong>{j.order.tailor.shopName}</strong> · Parcel <code>{j.packageId}</code></p>
    <p className="small-note">Order: {textStatus(j.order.status)} · {expected} item(s) · {j.scheduledAt?`Scheduled ${dateTime(j.scheduledAt)}`:'Time to be coordinated by operations'} · Attempts: {j.attempts}</p>
    <div className="field-grid"><div><strong>Pickup from</strong><p>{addresses.from}</p></div><div><strong>Deliver to</strong><p>{addresses.to}</p></div></div>
    <p><Link className="text-link" href={`/admin/orders`}>Review order in operations →</Link></p>
    {['UNASSIGNED','ASSIGNED','PICKUP_SCHEDULED','FAILED_ATTEMPT'].includes(j.status)&&<div className="field-grid">
     <label>Assigned courier<select value={courierIds[j.id]??j.courierId??''} onChange={e=>setCouriers(x=>({...x,[j.id]:e.target.value}))}><option value="">Choose courier…</option>{couriers?.map(c=><option key={c.id} value={c.id}>{c.name||c.phone} · {c.phone}</option>)}</select></label>
     <div style={{alignSelf:'end',paddingBottom:7}}><button className="btn small" disabled={busy||!(courierIds[j.id]||j.courierId)} onClick={()=>act(`/admin/logistics/jobs/${j.id}/assign`,{courierId:courierIds[j.id]||j.courierId})}>{j.status==='FAILED_ATTEMPT'?'Reassign / retry':'Assign courier'}</button></div>
    </div>}
    {canVerify&&<div className="card" style={{marginTop:18,boxShadow:'none',background:'#faf8f3'}}>
     <h3>{stage}</h3><p><strong>Handoff:</strong> {handoffLabel(j)}. The {step==='SENDER_PICKUP'?'sender':'recipient'} must show their OTP to courier/operations.</p>
     <button className="btn secondary small" disabled={busy} onClick={()=>act(`/admin/logistics/jobs/${j.id}/otp`,{step})}>Send {step==='SENDER_PICKUP'?'pickup':'delivery'} verification OTP</button>
     <div className="field-grid">
      <label>OTP shown by {step==='SENDER_PICKUP'?'sender':'recipient'}<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={codes[j.id]||''} onChange={e=>setCodes(x=>({...x,[j.id]:e.target.value.replace(/\D/g,'')}))}/></label>
      <label>Actual pieces (expected {expected})<input type="number" min={1} max={100} value={parcelCount} onChange={e=>setCount(x=>({...x,[j.id]:e.target.value}))}/></label>
      <label>Parcel seal ID<input placeholder="Physical tamper-seal identifier" value={seal} onChange={e=>setSeals(x=>({...x,[j.id]:e.target.value}))}/></label>
      <label>Condition photograph (required)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>attach(j.id,e.target.files?.[0])}/></label>
     </div>
     <label>Package condition notes<textarea value={condition[j.id]??'Garment count, condition and sealed package verified at handoff.'} onChange={e=>setCondition(x=>({...x,[j.id]:e.target.value}))}/></label>
     <p className="small-note">{photos[j.id]?'Verified photograph attached':'Upload a condition photo first.'} The system blocks a mismatch in the item count.</p>
     <button className="btn" disabled={busy||!photos[j.id]||!/^[0-9]{6}$/.test(codes[j.id]||'')||seal.trim().length<3||Number(parcelCount)!==expected||(condition[j.id]??'Garment count, condition and sealed package verified at handoff.').trim().length<3}
      onClick={()=>act(`/admin/logistics/jobs/${j.id}/handoffs`,{step,otp:codes[j.id],itemCount:Number(parcelCount),sealId:seal.trim(),conditionNote:condition[j.id]??'Garment count, condition and sealed package verified at handoff.',proofFileId:photos[j.id]},j.id,true)}>
      Confirm {step==='SENDER_PICKUP'?'pickup':'recipient delivery'} & record custody
     </button>
    </div>}
    {j.status==='DELIVERED'&&<p className="success">This delivery leg is finished with recorded handoff proof.</p>}
    {!['DELIVERED','CANCELLED'].includes(j.status)&&<p style={{marginTop:18}}><button className="link-button" disabled={busy} onClick={()=>{const reason=window.prompt('Describe failed pickup or delivery (minimum 10 characters)');if(reason&&reason.trim().length>=10)void act(`/admin/logistics/jobs/${j.id}/fail-attempt`,{reason:reason.trim()});}}>Record failed attempt / exception</button></p>}
   </section>;
  })}
  {!jobs?.length&&<div className="card"><h3>No courier jobs yet</h3><p>Once a customer’s payment is verified, they select a pickup slot on their order page. The system then creates an inbound job here.</p></div>}
  </div>
 </Portal>;
}
