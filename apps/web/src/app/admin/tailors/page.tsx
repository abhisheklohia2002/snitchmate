'use client';
import {useState} from 'react';
import {Portal} from '@/components/Portal';
import {PageTitle,useLoad,Alert} from '@/components/Shared';
import {post,money} from '@/lib/api';

type Shop={id:string;shopName:string;status:string;pincode:string;address:string;
 latitude:number|null;longitude:number|null;locationVerifiedAt:string|null;
 pendingLatitude:number|null;pendingLongitude:number|null;locationSubmittedAt:string|null;
 owner:{name:string|null;phone:string};services:{id:string;basePricePaise:string;category:{title:string}}[]};
type Draft={lat:string;lng:string};
export default function TailorAdmin(){
 const {data,refresh,error}=useLoad<Shop[]>('/admin/tailors');
 const [note,setNote]=useState('Workshop address and shop map location manually verified on-site');
 const [coords,setCoords]=useState<Record<string,Draft>>({});
 const [message,setMessage]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(false);
 async function act(id:string,approve:boolean){
  setMessage('');setSuccess('');setBusy(true);
  try{await post(`/admin/tailors/${id}/${approve?'approve':'suspend'}`,
   approve?{verificationNotes:note}:{reason:'Administrative suspension pending further verification'});
   refresh();setSuccess('Tailor status updated.');
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 function useCurrentPosition(id:string){
  if(!navigator.geolocation){setMessage('Geolocation is unavailable. Enter workshop coordinates manually.');return;}
  setMessage('');navigator.geolocation.getCurrentPosition(({coords:c})=>setCoords(old=>({...old,[id]:{lat:String(c.latitude),lng:String(c.longitude)}})),
   ()=>setMessage('Location access denied or unavailable. Enter the verified workshop pin manually.'),
   {enableHighAccuracy:true,timeout:12000});
 }
 async function savePin(t:Shop){
  const draft=coords[t.id]??{lat:String(t.latitude??''),lng:String(t.longitude??'')};
  const latitude=Number(draft.lat),longitude=Number(draft.lng);
  if(!draft.lat||!draft.lng||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180){setMessage('Enter valid coordinates for the physical workshop.');return;}
  if(!window.confirm(`Confirm you verified the physical location of ${t.shopName} (not a pincode centre)?`))return;
  setBusy(true);setMessage('');setSuccess('');
  try{await post(`/admin/tailors/${t.id}/location`,{latitude,longitude});refresh();setSuccess('Verified shop map pin published.');}
  catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 async function reviewLocation(t:Shop,action:'approve'|'reject'){
  if(action==='approve'&&note.trim().length<10){setMessage('Enter at least 10 characters of on-site verification notes.');return;}
  const reason=action==='reject'?window.prompt('Explain why the workshop location was rejected (at least 10 characters):','Location does not match the verified workshop address'):null;
  if(action==='reject'&&(reason===null||reason.trim().length<10)){setMessage('Rejection reason must have at least 10 characters.');return;}
  if(action==='approve'&&!window.confirm(`Publish ${t.shopName}'s submitted coordinates to customers after physical verification?`))return;
  setBusy(true);setMessage('');setSuccess('');
  try{await post(`/admin/tailors/${t.id}/location/${action}`,action==='approve'?{verificationNotes:note}:{reason});
   refresh();setSuccess(action==='approve'?'Tailor-submitted map pin approved and published.':'Location rejected. Tailor can submit a corrected pin.');
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 return <Portal role="admin">
  <PageTitle eyebrow="Partner network" title="Tailor approval & workshop map pins" lead="Review tailors, approve submitted shop coordinates, and publish only physically verified workshop locations."/>
  <Alert error={error||message} success={success}/>
  <label>Verification notes<input value={note} onChange={e=>setNote(e.target.value)}/></label>
  <div className="rows">{data?.map(t=>{
   const draft=coords[t.id]??{lat:t.latitude===null?'':String(t.latitude),lng:t.longitude===null?'':String(t.longitude)};
   const hasPending=t.locationSubmittedAt!==null&&t.pendingLatitude!==null&&t.pendingLongitude!==null;
   return <section className="card" key={t.id}>
    <div className="list-header"><h3>{t.shopName}</h3><span className="pill">{t.status}</span></div>
    <p>{t.address}, {t.pincode} · {t.owner.phone}</p>
    <p className="small-note">{t.services.map(s=>`${s.category.title} (${money(s.basePricePaise)})`).join(' · ')}</p>
    {t.status==='PENDING'&&<button className="btn small" disabled={busy} onClick={()=>act(t.id,true)}>Approve shop after verification</button>}
    {hasPending&&<div className="notice" style={{marginTop:14}}>
     <strong>New location submitted by tailor — pending review</strong>
     <p>Submitted {new Date(t.locationSubmittedAt!).toLocaleString('en-IN')} · Lat: {t.pendingLatitude}, Lng: {t.pendingLongitude}</p>
     <a className="text-link" href={`https://www.openstreetmap.org/?mlat=${t.pendingLatitude}&mlon=${t.pendingLongitude}#map=17/${t.pendingLatitude}/${t.pendingLongitude}`} target="_blank" rel="noreferrer">Inspect proposed shop pin on OpenStreetMap</a>
     <p className="small-note">Verify against the actual workshop address before publishing. Existing public location remains unchanged while review is pending.</p>
     <div className="form-actions">
      <button className="btn small" disabled={busy||t.status!=='APPROVED'} onClick={()=>reviewLocation(t,'approve')}>Approve location</button>
      <button className="btn secondary small" disabled={busy} onClick={()=>reviewLocation(t,'reject')}>Reject location</button>
     </div>
     {t.status!=='APPROVED'&&<p className="small-note">Approve the shop itself first; a pending shop cannot have a public map pin.</p>}
    </div>}
    {t.status==='APPROVED'&&<>
     <hr className="divider"/><h3 style={{fontSize:'1.2rem'}}>Admin manual map-pin override</h3>
     <p className="small-note">Use only if you have verified the exact shop coordinates. Saving manually replaces any pending tailor request.</p>
     <div className="field-grid"><label>Latitude<input inputMode="decimal" placeholder="28.7" value={draft.lat} onChange={e=>setCoords({...coords,[t.id]:{...draft,lat:e.target.value}})}/></label>
      <label>Longitude<input inputMode="decimal" placeholder="77.1" value={draft.lng} onChange={e=>setCoords({...coords,[t.id]:{...draft,lng:e.target.value}})}/></label></div>
     <div className="form-actions"><button type="button" className="btn secondary small" disabled={busy} onClick={()=>useCurrentPosition(t.id)}>Use GPS (at shop only)</button>
      <button type="button" className="btn small" disabled={busy} onClick={()=>savePin(t)}>Save verified map pin</button></div>
     <p className="small-note">{t.locationVerifiedAt?`Last verified: ${new Date(t.locationVerifiedAt).toLocaleString('en-IN')}`:'No verified map pin yet. This shop stays off the customer map.'}</p>
     <hr className="divider"/><button className="btn secondary small" disabled={busy} onClick={()=>act(t.id,false)}>Suspend tailor</button>
    </>}
   </section>;
  })}</div>
 </Portal>;
}
