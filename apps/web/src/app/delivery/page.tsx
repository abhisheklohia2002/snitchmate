'use client';
import {useState} from 'react';
import {RequireAuth} from '@/components/Auth';
import {PageTitle,useLoad,Alert} from '@/components/Shared';
import {post,upload,dateTime,textStatus} from '@/lib/api';
type Partner={id:string;displayName:string;servicePincode:string;vehicleType:string;status:string;available:boolean};
type Available={id:string;direction:string;status:string;scheduledAt:string|null;order:{orderNumber:string;tailor:{shopName:string;pincode:string};pickupAddress:{pincode:string};returnAddress:{pincode:string}}};
type Job={id:string;direction:string;status:string;packageId:string;sealId:string|null;scheduledAt:string|null;order:{orderNumber:string;tailor:{shopName:string;address:string;pincode:string};pickupAddress:{name:string;phone:string;line1:string;city:string;pincode:string};returnAddress:{name:string;phone:string;line1:string;city:string;pincode:string};items:{quantity:number}[]}};
export default function Delivery(){return <RequireAuth><Screen/></RequireAuth>}
function Screen(){
 const {data:p,refresh:refreshP,error:partnerError}=useLoad<Partner|null>('/delivery/me');
 const {data:available,refresh:refreshAvailable}=useLoad<Available[]>('/delivery/jobs/available',p?.status==='APPROVED'&&p.available);
 const {data:jobs,refresh:refreshJobs}=useLoad<Job[]>('/delivery/jobs',p?.status==='APPROVED');
 const [name,setName]=useState(''),[vehicle,setVehicle]=useState('BIKE'),[pin,setPin]=useState(''),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[err,setErr]=useState('');
 const [otp,setOtp]=useState<Record<string,string>>({}),[seals,setSeals]=useState<Record<string,string>>({}),[notes,setNotes]=useState<Record<string,string>>({}),[files,setFiles]=useState<Record<string,string>>({});
 async function act(path:string,body:unknown){setBusy(true);setMsg('');setErr('');try{await post(path,body);setMsg('Saved.');refreshP();refreshJobs();refreshAvailable();}catch(e){setErr((e as Error).message);}finally{setBusy(false);}}
 async function attach(jobId:string,file?:File){if(!file)return;setBusy(true);setErr('');try{const id=await upload(file,'HANDOFF');setFiles(prev=>({...prev,[jobId]:id}));setMsg('Handoff photo verified.');}catch(e){setErr((e as Error).message);}finally{setBusy(false);}}
 function dest(j:Job){const inbound=j.direction==='INBOUND'||j.direction==='REWORK_INBOUND';return inbound?'Customer → Tailor workshop':'Tailor workshop → Customer';}
 return <div className="container" style={{paddingBottom:70}}>
  <PageTitle eyebrow="Local delivery network" title="StitchMate delivery partner" lead="Accept nearby pickup and return jobs. Every fabric handoff is tracked with verified OTP, piece count and a condition photograph."/>
  <Alert error={err||partnerError} success={msg}/>
  {!p&&<form className="card" onSubmit={e=>{e.preventDefault();act('/delivery/onboarding',{displayName:name,vehicleType:vehicle,servicePincode:pin});}}>
    <h3>Register as delivery partner</h3>
    <p>Submit your details. Operations will verify you before giving access to customer addresses.</p>
    <label>Your name<input value={name} onChange={e=>setName(e.target.value)} required minLength={3}/></label>
    <label>Vehicle<select value={vehicle} onChange={e=>setVehicle(e.target.value)}><option value="BIKE">Motorbike</option><option value="SCOOTER">Scooter</option><option value="BICYCLE">Bicycle</option><option value="CAR">Car</option></select></label>
    <label>Operating pincode<input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} required pattern="[0-9]{6}"/></label>
    <button disabled={busy} className="btn">Apply to deliver</button>
  </form>}
  {p&&<section className="card">
    <h3>{p.displayName}</h3><p>Verification: <strong>{textStatus(p.status)}</strong> · Zone {p.servicePincode} · {textStatus(p.vehicleType)}</p>
    {p.status==='APPROVED'&&<><p>You are {p.available?'online and accepting jobs':'offline'}.</p><button className="btn small" disabled={busy} onClick={()=>act('/delivery/availability',{available:!p.available})}>{p.available?'Go offline':'Go online'}</button></>}
    {p.status==='PENDING'&&<p className="notice">Admin approval required before you can accept deliveries.</p>}
    {p.status==='SUSPENDED'&&<p className="error">This account has been suspended by operations.</p>}
   </section>}
  {p?.status==='APPROVED'&&<><section className="card" style={{marginTop:20}}><h3>Available jobs in your area</h3>
   {!p.available&&<p>Go online to view nearby pickup requests.</p>}
   {available?.map(j=><div className="row-card" key={j.id}><div><strong>{j.order.orderNumber}</strong><p>{j.direction==='INBOUND'?'Collect customer garment':'Return completed garment'} · {j.order.tailor.shopName} · {j.order.pickupAddress.pincode}</p></div><button className="btn small" disabled={busy} onClick={()=>act('/delivery/jobs/'+j.id+'/accept',{})}>Accept job</button></div>)}
   {p.available&&!available?.length&&<p>No unassigned jobs at the moment.</p>}
  </section>
  <section className="card" style={{marginTop:20}}><h3>My deliveries</h3>
   {jobs?.map(j=><div key={j.id} className="card" style={{background:'var(--cream)',marginTop:14}}>
    <div className="price-row"><strong>{j.order.orderNumber}</strong><span className="pill">{textStatus(j.status)}</span></div>
    <p>{dest(j)} · Parcel {j.packageId}</p><p className="small-note">{j.scheduledAt?dateTime(j.scheduledAt):'Time assigned by operations'}</p>
    <p><strong>Workshop:</strong> {j.order.tailor.shopName}, {j.order.tailor.address}</p>
    <p><strong>Customer:</strong> {j.order.pickupAddress.name}, {j.order.pickupAddress.line1}, {j.order.pickupAddress.city} · {j.order.pickupAddress.phone}</p>
    {['ASSIGNED','PICKED_UP'].includes(j.status)&&(()=>{
     const step=j.status==='ASSIGNED'?'SENDER_PICKUP':'RECIPIENT_DROPOFF';
     const count=j.order.items.reduce((n,item)=>n+item.quantity,0);
     return <div className="card" style={{marginTop:15}}>
      <h3>{step==='SENDER_PICKUP'?'Collect parcel':'Deliver parcel'}</h3>
      <p className="small-note">The sender or recipient will receive a fresh OTP. Confirm the seal, all {count} garment(s), and the actual parcel condition.</p>
      <button className="btn secondary small" disabled={busy} onClick={()=>act('/courier/jobs/'+j.id+'/otp',{step})}>Send {step==='SENDER_PICKUP'?'pickup':'drop-off'} OTP</button>
      <label>OTP shown by sender / recipient<input value={otp[j.id]||''} maxLength={6} inputMode="numeric" onChange={e=>setOtp(v=>({...v,[j.id]:e.target.value.replace(/\D/g,'')}))}/></label>
      <label>Parcel seal ID<input value={seals[j.id]||''} placeholder="Tamper-evident seal" onChange={e=>setSeals(v=>({...v,[j.id]:e.target.value}))}/></label>
      <label>Condition photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>attach(j.id,e.target.files?.[0])}/></label>
      <p className="small-note">{files[j.id]?'Verified photo uploaded':'Upload a photo before confirming.'}</p>
      <label>Condition notes<textarea value={notes[j.id]||''} onChange={e=>setNotes(v=>({...v,[j.id]:e.target.value}))} placeholder="Seal intact, all pieces counted, no visible damage"/></label>
      <button className="btn" disabled={busy||!files[j.id]||!/^[0-9]{6}$/.test(otp[j.id]||'')||(seals[j.id]||'').trim().length<3||(notes[j.id]||'').trim().length<3} onClick={()=>act('/courier/jobs/'+j.id+'/handoffs',{step,otp:otp[j.id],itemCount:count,sealId:seals[j.id].trim(),conditionNote:notes[j.id].trim(),proofFileId:files[j.id]})}>Verify {step==='SENDER_PICKUP'?'pickup':'delivery'} & update tracking</button>
     </div>;
    })()}
   </div>)}
   {!jobs?.length&&<p>No assigned delivery jobs.</p>}
  </section></>}
 </div>;
}