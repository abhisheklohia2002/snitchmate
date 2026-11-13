'use client';
import Link from 'next/link';
import {useState} from 'react';
import {Scissors,Clock3} from 'lucide-react';
import {PageTitle,useLoad} from '@/components/Shared';
import {money} from '@/lib/api';
type Gig={id:string;slug:string;title:string;description:string;category:{title:string};tailor:{shopName:string;pincode:string};packages:{tier:string;pricePaise:string;deliveryDays:number}[];images:{fileId:string}[]};
export default function Gigs(){
 const [pin,setPin]=useState(''),[filter,setFilter]=useState('');
 const {data,loading,error}=useLoad<{items:Gig[];total:number}>('/gigs'+(filter?'?pincode='+encodeURIComponent(filter):''));
 return <div className="container">
  <PageTitle eyebrow="Tailor-made services" title="Discover tailoring gigs" lead="Explore verified local tailors, choose a package, and request a quote with doorstep pickup and delivery."/>
  <form className="card" style={{display:'flex',gap:12,alignItems:'end',flexWrap:'wrap'}} onSubmit={e=>{e.preventDefault();if(!pin||/^\d{6}$/.test(pin))setFilter(pin);}}>
   <label style={{flex:'1 1 240px',margin:0}}>Serviceable pincode<input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="All areas / enter pincode"/></label>
   <button type="submit" className="btn">Find gigs</button>
   {filter&&<button type="button" className="btn secondary" onClick={()=>{setFilter('');setPin('');}}>Show all</button>}
  </form>
  {loading&&<p>Loading gigs…</p>}{error&&<p className="error">{error}</p>}
  {!loading&&data?.items.length===0&&<div className="empty"><h3>No gigs here yet</h3><p>Approved tailors can publish gigs from their dashboard.</p></div>}
  <div className="grid-3" style={{paddingBottom:65,marginTop:26}}>
   {data?.items.map(g=><article className="card" key={g.id}>
    <div className="service-illustration" style={{height:175,marginBottom:16}}>
     {g.images[0]?<img src={'/api/v1/gigs/'+encodeURIComponent(g.slug)+'/images/'+g.images[0].fileId} alt={g.title} style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:10}}/>:<Scissors size={72}/>}
    </div>
    <span className="pill">{g.category.title}</span><h3 style={{marginTop:12}}>{g.title}</h3>
    <p>{g.description.slice(0,135)}{g.description.length>135?'…':''}</p>
    <p className="small-note">{g.tailor.shopName} · {g.tailor.pincode}</p>
    <div className="price-row"><strong>From {money(g.packages[0]?.pricePaise)}</strong><span className="small-note"><Clock3 size={14} style={{verticalAlign:'middle'}}/> {g.packages[0]?.deliveryDays} days</span></div>
    <Link href={'/gigs/'+g.slug} className="btn small">View packages →</Link>
   </article>)}
  </div>
 </div>;
}