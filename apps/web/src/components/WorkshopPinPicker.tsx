'use client';
import {useEffect,useRef} from 'react';

type Props={latitude:number|null;longitude:number|null;onPick:(latitude:number,longitude:number)=>void};
export function WorkshopPinPicker({latitude,longitude,onPick}:Props){
 const root=useRef<HTMLDivElement>(null);
 const map=useRef<import('leaflet').Map|null>(null);
 const marker=useRef<import('leaflet').CircleMarker|null>(null);
 const leaflet=useRef<typeof import('leaflet')|null>(null);
 const latestOnPick=useRef(onPick);
 const latestCoordinates=useRef({latitude,longitude});
 useEffect(()=>{latestOnPick.current=onPick;},[onPick]);
 useEffect(()=>{latestCoordinates.current={latitude,longitude};},[latitude,longitude]);
 useEffect(()=>{
  let cancelled=false;
  void import('leaflet').then(L=>{
   if(cancelled||!root.current)return;
   leaflet.current=L;
   const view=L.map(root.current,{scrollWheelZoom:false}).setView([28.7,77.1],10);
   map.current=view;
   L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap contributors'}).addTo(view);
   view.on('click',event=>latestOnPick.current(Number(event.latlng.lat.toFixed(6)),Number(event.latlng.lng.toFixed(6))));
   const current=latestCoordinates.current;
   if(current.latitude!==null&&current.longitude!==null){
    marker.current=L.circleMarker([current.latitude,current.longitude],{radius:10,color:'#173b33',fillColor:'#bb684f',fillOpacity:1,weight:3}).addTo(view);
    view.setView([current.latitude,current.longitude],15);
   }
   requestAnimationFrame(()=>{if(!cancelled)view.invalidateSize();});
  }).catch(()=>{if(root.current)root.current.textContent='Map unavailable. Enter coordinates manually or use workshop GPS.';});
  return ()=>{cancelled=true;map.current?.remove();map.current=null;marker.current=null;leaflet.current=null;};
  // This map is created once; coordinate changes move its selection marker below.
 },[]);
 useEffect(()=>{
  if(!map.current||!leaflet.current||latitude===null||longitude===null)return;
  const L=leaflet.current;
  if(!marker.current)marker.current=L.circleMarker([latitude,longitude],{radius:10,color:'#173b33',fillColor:'#bb684f',fillOpacity:1,weight:3}).addTo(map.current);
  else marker.current.setLatLng([latitude,longitude]);
  map.current.panTo([latitude,longitude]);
 },[latitude,longitude]);
 return <div>
  <p className="small-note">Click your actual workshop location on the map to select a pin. Zoom in before submitting.</p>
  <div ref={root} className="stitchmate-map" style={{height:260}} role="region" aria-label="Select workshop location on interactive map"/>
 </div>;
}
