'use client';
import {useState} from 'react';
import {Portal} from '@/components/Portal';
import {PageTitle,useLoad,Alert} from '@/components/Shared';
import {post,money} from '@/lib/api';

type Shop={id:string;shopName:string;status:string;pincode:string;address:string;latitude:number|null;longitude:number|null;locationVerifiedAt:string|null;owner:{name:string|null;phone:string};services:{id:string;basePricePaise:string;category:{title:string}}[]};
type Draft={lat:string;lng:string};
export default function TailorAdmin(){
 const {data,refresh,error}=useLoad<Shop[]>('/admin/tailors');
 const [note,setNote]=useState('Shop and portfolio manually verified by operations');
 const [coords,setCoords]=useState<Record<string,Draft>>({});
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function act(id:string,approve:boolean){
  setMessage('');setBusy(true);
  try{await post(`/admin/tailors/${id}/${approve?'approve':'suspend'}`,
   approve?{verificationNotes:note}:{reason:'Administrative suspension pending further verification'});
   refresh();setMessage('Tailor status updated.');
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 function useCurrentPosition(id:string){
  if(!navigator.geolocation){setMessage('Geolocation is not supported by this browser.');return;}
  setMessage('');navigator.geolocation.getCurrentPosition(({coords:c})=>setCoords(old=>({...old,[id]:{lat:String(c.latitude),lng:String(c.longitude)}})),
   ()=>setMessage('Location access denied or unavailable. Enter the verified workshop pin manually.'),
   {enableHighAccuracy:true,timeout:12000});
 }
 async function savePin(t:Shop){
  const draft=coords[t.id]??{lat:String(t.latitude??''),lng:String(t.longitude??'')};
  const latitude=Number(draft.lat),longitude=Number(draft.lng);
  if(!draft.lat||!draft.lng||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180){setMessage('Enter valid latitude and longitude for the physical workshop.');return;}
  if(!window.confirm(`Confirm you verified the physical location of ${t.shopName} (not a nearby home or pincode centre)?`))return;
  setBusy(true);setMessage('');
  try{await post(`/admin/tailors/${t.id}/location`,{latitude,longitude});refresh();setMessage('Workshop map pin verified and published.');}
  catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 return <Portal role="admin">
  <PageTitle eyebrow="Partner network" title="Tailor approval & verified map pins" lead="Approve workshops after offline checks. Publish precise shop coordinates only when the physical location is verified."/>
  <Alert error={error||(message&&!message.includes('updated')&&!message.includes('published')?message:undefined)} success={message.includes('updated')||message.includes('published')?message:undefined}/>
  <label>Verification notes<input value={note} onChange={e=>setNote(e.target.value)}/></label>
  <div className="rows">{data?.map(t=>{
   const draft=coords[t.id]??{lat:t.latitude===null?'':String(t.latitude),lng:t.longitude===null?'':String(t.longitude)};
   return <div className="card" key={t.id}>
    <div className="list-header"><h3>{t.shopName}</h3><span className="pill">{t.status}</span></div>
    <p>{t.address}, {t.pincode} · {t.owner.phone}</p>
    <p className="small-note">{t.services.map(s=>`${s.category.title} (${money(s.basePricePaise)})`).join(' · ')}</p>
    {t.status==='PENDING'&&<button className="btn small" disabled={busy} onClick={()=>act(t.id,true)}>Approve after verification</button>}
    {t.status==='APPROVED'&&<>
     <hr className="divider"/><h3 style={{fontSize:'1.2rem'}}>Verified workshop location</h3>
     <p className="small-note">Use actual workshop GPS, not pincode midpoint. If on-site, you can use your device location. Otherwise enter the pin from a verified map.</p>
     <div className="field-grid"><label>Latitude<input inputMode="decimal" placeholder="e.g. 28.7" value={draft.lat} onChange={e=>setCoords({...coords,[t.id]:{...draft,lat:e.target.value}})}/></label><label>Longitude<input inputMode="decimal" placeholder="e.g. 77.1" value={draft.lng} onChange={e=>setCoords({...coords,[t.id]:{...draft,lng:e.target.value}})}/></label></div>
     <div className="form-actions"><button type="button" className="btn secondary small" disabled={busy} onClick={()=>useCurrentPosition(t.id)}>Use GPS (only if at shop)</button><button type="button" className="btn small" disabled={busy} onClick={()=>savePin(t)}>Save verified map pin</button><a className="text-link" href="https://www.openstreetmap.org" target="_blank" rel="noreferrer">Find coordinates on map</a></div>
     <p className="small-note">{t.locationVerifiedAt?`Last location verification: ${new Date(t.locationVerifiedAt).toLocaleString('en-IN')}`:'No verified map pin yet. Shop will remain in pincode results but not appear on map.'}</p>
     <hr className="divider"/><button className="btn secondary small" disabled={busy} onClick={()=>act(t.id,false)}>Suspend tailor</button>
    </>}
   </div>;
  })}</div>
 </Portal>;
}
