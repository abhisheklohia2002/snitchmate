'use client';
import Link from 'next/link';
import {Input} from 'antd';
import {useState} from 'react';
import {MapPin,Clock3,Scissors,LocateFixed} from 'lucide-react';
import {money} from '@/lib/api';
import {PageTitle,useLoad,Alert,Tailor} from '@/components/Shared';
import {TailorMap} from '@/components/TailorMap';

type Location={latitude:number;longitude:number};
export default function Tailors(){
 const [pin,setPin]=useState('110086'),[search,setSearch]=useState('110086');
 const [location,setLocation]=useState<Location|null>(null),[locating,setLocating]=useState(false),[localError,setLocalError]=useState('');
 const path=`/tailors?pincode=${encodeURIComponent(search)}${location?`&lat=${location.latitude}&lng=${location.longitude}&radiusKm=7`:''}`;
 const {data,error,loading}=useLoad<{items:Tailor[];total:number;radiusKm?:number}>(path);
 function getLocation(){
  if(!navigator.geolocation){setLocalError('This browser does not support location services.');return;}
  setLocating(true);setLocalError('');
  navigator.geolocation.getCurrentPosition(({coords})=>{
   setLocation({latitude:coords.latitude,longitude:coords.longitude});setLocating(false);
  },()=>{setLocalError('Location was unavailable or declined. You can still search by pincode.');setLocating(false);},
  {enableHighAccuracy:false,timeout:10000,maximumAge:60000});
 }
 const listed=data?.items??[];
 return <div className="container">
  <PageTitle eyebrow="Meet the makers" title="Find your perfect tailor" lead="See approved local specialists on a real map, compare stitching services, and book doorstep collection."/>
  <div className="card" style={{marginBottom:24}}>
   <form onSubmit={e=>{e.preventDefault();if(/^\d{6}$/.test(pin)){setSearch(pin);setLocalError('');}else setLocalError('Enter a valid 6-digit Indian pincode.');}} className="form-actions" style={{alignItems:'end'}}>
    <label style={{flex:'1 1 210px',margin:0}}>Your pickup pincode<Input maxLength={6} inputMode="numeric" placeholder="Enter 6-digit pincode" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))}/></label>
    <button className="btn" type="submit">Find tailors</button>
    <button className="btn secondary" type="button" onClick={getLocation} disabled={locating}><LocateFixed size={16}/>{locating?'Locating…':'Within 7 km of me'}</button>
    {location&&<button type="button" className="link-button" onClick={()=>setLocation(null)}>Clear location</button>}
   </form>
   <p className="small-note" style={{marginBottom:0}}>Location sharing is optional. With your permission, your approximate coordinates are sent to StitchMate to rank serviceable, verified workshops within 7 km.</p>
  </div>
  <Alert error={error||localError}/>
  {loading?<p>Finding verified tailors…</p>:<>
   <TailorMap tailors={listed} customer={location}/>
   {listed.length===0?<div className="empty"><h3>No matching tailors yet</h3><p>{location?'Try clearing the 7 km filter or another serviceable pincode.':'Only approved tailors in your selected service zone appear.'}</p></div>:
    <><p className="small-note">{data?.total??listed.length} verified {location?'nearby ':'serviceable '}tailor(s) found. Only location-verified workshops appear as map pins.</p>
     <div className="grid-3">{listed.map(t=><article key={t.id} className="card">
      <div className="service-illustration" style={{height:145,marginBottom:18}}><Scissors size={55}/></div>
      <span className="pill">Verified tailor</span><h3 style={{marginTop:12}}>{t.shopName}</h3>
      <p style={{minHeight:50}}>{t.description||'Local tailoring partner.'}</p>
      <p><MapPin size={14} style={{verticalAlign:'middle'}}/> {t.pincode} {t.distanceKm!==undefined&&` · ~${t.distanceKm.toFixed(1)} km`} &nbsp; · &nbsp; <Clock3 size={14} style={{verticalAlign:'middle'}}/> {t.turnaroundDays} days</p>
      <p className="small-note">{t.services.length} services · Starting from {money(t.services.length?t.services.reduce((min,s)=>Math.min(min,Number(s.basePricePaise)),Infinity).toString():undefined)}</p>
      <Link href={`/tailors/${t.slug}`} className="btn small">View tailor & book →</Link>
     </article>)}</div>
    </>}
  </>}
  <div style={{height:65}}/>
 </div>;
}
