'use client';
import {useEffect,useRef} from 'react';
import type {Tailor} from './Shared';

type Coordinates={latitude:number;longitude:number};
export function TailorMap({tailors,customer}:{tailors:Tailor[];customer?:Coordinates|null}){
 const root=useRef<HTMLDivElement>(null);
 const locations=tailors.filter((t):t is Tailor & Coordinates =>
  typeof t.latitude==='number' && typeof t.longitude==='number' &&
  Number.isFinite(t.latitude) && Number.isFinite(t.longitude));
 useEffect(()=>{
  if(!root.current||!locations.length)return;
  let cancelled=false;
  let cleanup:undefined|(()=>void);
  void import('leaflet').then(L=>{
   if(cancelled||!root.current)return;
   const first=locations[0];
   if(!first)return;
   const map=L.map(root.current,{scrollWheelZoom:false}).setView([first.latitude,first.longitude],12);
   cleanup=()=>map.remove();
   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:18,attribution:'&copy; OpenStreetMap contributors'
   }).addTo(map);
   const icon=L.divIcon({className:'stitchmate-map-marker',html:'<span aria-hidden="true">✂</span>',iconSize:[36,36],iconAnchor:[18,34]});
   const positions: [number,number][]=locations.map(t=>[t.latitude,t.longitude]);
   for(const t of locations){
    const card=document.createElement('div');
    const title=document.createElement('strong');title.textContent=t.shopName;
    const info=document.createElement('p');info.textContent=`Verified workshop · ${t.pincode}${t.distanceKm!==undefined?` · ${t.distanceKm.toFixed(1)} km away`:''}`;
    const link=document.createElement('a');link.href=`/tailors/${encodeURIComponent(t.slug)}`;link.textContent='View tailor & book';
    card.append(title,info,link);
    L.marker([t.latitude,t.longitude],{icon}).addTo(map).bindPopup(card);
   }
   if(customer){
    positions.push([customer.latitude,customer.longitude]);
    L.circleMarker([customer.latitude,customer.longitude],{radius:9,color:'#173b33',fillColor:'#bb684f',fillOpacity:1,weight:3})
     .addTo(map).bindPopup('Your approximate location');
   }
   map.fitBounds(L.latLngBounds(positions),{padding:[35,35],maxZoom:14});
   // Leaflet can size incorrectly if the panel was just mounted.
   requestAnimationFrame(()=>{if(!cancelled)map.invalidateSize();});
  }).catch(()=>{if(root.current)root.current.textContent='Map tiles are currently unavailable. Tailors remain accessible in the list.';});
  return ()=>{cancelled=true;cleanup?.();};
  // All coordinates are delivered from an authenticated admin-verification flow.
 },[tailors,customer]);
 if(!locations.length)return <div className="notice">No verified workshop map pins are available for this search yet. Tailors without confirmed coordinates remain visible in the list.</div>;
 return <section className="card" style={{marginBottom:24}}>
  <div className="list-header"><h3>Tailors on the map</h3><span className="pill">{locations.length} verified shop {locations.length===1?'pin':'pins'}</span></div>
  <p className="small-note">Only actual workshop coordinates verified by StitchMate operations appear here. Drag to explore; use + / − to zoom.</p>
  <div ref={root} className="stitchmate-map" role="region" aria-label="Map showing verified nearby tailors"/>
  <p className="small-note" style={{marginBottom:0}}>Map data © OpenStreetMap contributors. Distances are straight-line estimates, not driving distances.</p>
 </section>;
}
