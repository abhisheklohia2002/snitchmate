'use client';
import {useState} from 'react';
import {RequireAuth} from '@/components/Auth';
import {Alert,PageTitle,useLoad} from '@/components/Shared';
import {post} from '@/lib/api';
import {WorkshopPinPicker} from '@/components/WorkshopPinPicker';

type Shop={id:string;shopName:string;status:string;address:string;pincode:string;
 latitude:number|null;longitude:number|null;locationVerifiedAt:string|null;
 pendingLatitude:number|null;pendingLongitude:number|null;locationSubmittedAt:string|null};
type Draft={lat:string;lng:string};
function parseCoordinates(draft:Draft):{latitude:number;longitude:number}|null{
 if(draft.lat.trim()===''||draft.lng.trim()==='')return null;
 const latitude=Number(draft.lat),longitude=Number(draft.lng);
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return null;
 if(latitude===0&&longitude===0)return null;
 return {latitude,longitude};
}
export default function TailorLocation(){
 const {data,error,loading,refresh}=useLoad<Shop[]>('/tailor/me');
 const [drafts,setDrafts]=useState<Record<string,Draft>>({});
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[success,setSuccess]=useState('');
 function draftOf(shop:Shop):Draft{return drafts[shop.id]??{
  lat:String(shop.pendingLatitude??shop.latitude??''),lng:String(shop.pendingLongitude??shop.longitude??'')
 };}
 function update(id:string,change:Partial<Draft>,shop:Shop){setDrafts(old=>({...old,[id]:{...draftOf(shop),...old[id],...change}}));}
 function useGps(shop:Shop){
  if(!navigator.geolocation){setMessage('Browser geolocation is unavailable. Enter coordinates manually.');return;}
  setMessage('');setSuccess('');
  navigator.geolocation.getCurrentPosition(({coords})=>{
   update(shop.id,{lat:coords.latitude.toFixed(6),lng:coords.longitude.toFixed(6)},shop);
  },()=>setMessage('Location permission denied or GPS unavailable. Use the map or enter coordinates.'),{enableHighAccuracy:true,timeout:12000});
 }
 async function submit(shop:Shop){
  const payload=parseCoordinates(draftOf(shop));
  if(!payload){setMessage('Select a valid location on the map or enter latitude and longitude.');return;}
  if(!window.confirm('Confirm this pin is your physical tailoring workshop, not your home or the pincode centre?'))return;
  setBusy(true);setMessage('');setSuccess('');
  try{await post(`/tailor/me/${shop.id}/location-request`,payload);
   setSuccess(`${shop.shopName}: Location submitted for admin verification. Your old verified pin remains public until approval.`);
   refresh();
  }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 return <RequireAuth><div className="container">
  <PageTitle eyebrow="Workshop location" title="Submit your shop map pin" lead="Choose your actual physical workshop on the map, then request operations verification. Customers see only approved locations."/>
  <Alert error={message||error} success={success}/>
  {loading&&<p>Loading your workshops...</p>}
  <div className="rows">{data?.map(shop=>{
   const draft=draftOf(shop),coord=parseCoordinates(draft);
   return <section className="card" key={shop.id}>
    <div className="list-header"><h3>{shop.shopName}</h3><span className="pill">{shop.status}</span></div>
    <p>{shop.address}, {shop.pincode}</p>
    {shop.locationSubmittedAt&&<div className="notice">Location review pending since {new Date(shop.locationSubmittedAt).toLocaleString('en-IN')}. You may submit a corrected pin before approval.</div>}
    {shop.locationVerifiedAt&&<p className="small-note">Current public pin verified on {new Date(shop.locationVerifiedAt).toLocaleString('en-IN')}: {shop.latitude}, {shop.longitude}</p>}
    {!shop.locationVerifiedAt&&<p className="small-note">Your shop has no published map pin yet. An admin must approve your location.</p>}
    <WorkshopPinPicker latitude={coord?.latitude??null} longitude={coord?.longitude??null} onPick={(lat,lng)=>update(shop.id,{lat:String(lat),lng:String(lng)},shop)}/>
    <div className="field-grid" style={{marginTop:14}}>
     <label>Latitude<input value={draft.lat} inputMode="decimal" onChange={e=>update(shop.id,{lat:e.target.value},shop)} placeholder="28.7"/></label>
     <label>Longitude<input value={draft.lng} inputMode="decimal" onChange={e=>update(shop.id,{lng:e.target.value},shop)} placeholder="77.1"/></label>
    </div>
    <div className="form-actions"><button type="button" className="btn secondary small" disabled={busy} onClick={()=>useGps(shop)}>Use GPS (at workshop only)</button>
     <button type="button" className="btn small" disabled={busy||shop.status==='SUSPENDED'} onClick={()=>submit(shop)}>Submit location for approval</button>
    </div>
    {shop.status==='PENDING'&&<p className="small-note">Shop approval and location verification are separate. Your map pin can be published after shop approval.</p>}
   </section>;
  })}</div>
  {!loading&&!data?.length&&<div className="notice">Register a shop first, then submit its location.</div>}
 </div></RequireAuth>;
}
