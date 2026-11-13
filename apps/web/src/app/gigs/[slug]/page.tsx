'use client';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {useState} from 'react';
import {Clock3,Scissors,MapPin,Star} from 'lucide-react';
import {PageTitle,useLoad} from '@/components/Shared';
import {money} from '@/lib/api';
type Pack={tier:string;title:string;description:string;pricePaise:string;deliveryDays:number;revisions:number;expressDays:number|null;expressPricePaise:string|null};
type Gig={id:string;slug:string;title:string;description:string;category:{id:string;title:string;serviceType:string};tailor:{id:string;slug:string;shopName:string;pincode:string};packages:Pack[];images:{fileId:string}[];rating:number|null;reviewCount:number;reviews:{score:number;text:string|null}[]};
export default function GigDetail(){
 const {slug}=useParams<{slug:string}>();const {data:g,loading,error}=useLoad<Gig>('/gigs/'+encodeURIComponent(slug));
 const [tier,setTier]=useState('BASIC');
 const chosen=g?.packages.find(p=>p.tier===tier)||g?.packages[0];
 return <div className="container">
  <PageTitle eyebrow="Tailoring gig" title={g?.title||'Gig details'} lead={g?.description}/>
  {loading&&<p>Loading gig…</p>}{error&&<p className="error">{error}</p>}
  {g&&<div className="grid-2" style={{paddingBottom:75}}>
   <div><section className="card">
    <div className="service-illustration" style={{minHeight:250,marginBottom:16}}>
     {g.images[0]?<img src={'/api/v1/gigs/'+encodeURIComponent(g.slug)+'/images/'+g.images[0].fileId} alt={g.title} style={{width:'100%',maxHeight:320,objectFit:'cover',borderRadius:12}}/>:<Scissors size={100}/>}
    </div>
    {g.images.length>1&&<div className="gig-gallery">{g.images.slice(1).map(img=><img key={img.fileId} alt="Sample work" src={'/api/v1/gigs/'+encodeURIComponent(g.slug)+'/images/'+img.fileId}/>)}</div>}
    <p><strong>{g.category.title}</strong> · <Link className="text-link" href={'/tailors/'+g.tailor.slug}>{g.tailor.shopName}</Link></p>
    <p><MapPin size={15} style={{verticalAlign:'middle'}}/> {g.tailor.pincode}{g.rating!==null&&<> · <Star size={15} style={{verticalAlign:'middle'}}/> {g.rating} ({g.reviewCount} reviews)</>}</p>
   </section>
   {g.reviews?.length>0&&<section className="card" style={{marginTop:18}}><h3>Customer reviews</h3>{g.reviews.map((v,i)=><p key={i}>★ {v.score}/5 — {v.text||'Verified order review'}</p>)}</section>}
   </div>
   <aside className="card" style={{alignSelf:'start'}}>
    <span className="eyebrow">Select your package</span>
    <div className="tag-grid" style={{margin:'20px 0'}}>{g.packages.map(p=><button key={p.tier} type="button" className={'tag '+(chosen?.tier===p.tier?'active':'')} onClick={()=>setTier(p.tier)}>{p.tier}</button>)}</div>
    {chosen&&<><h2 style={{fontSize:'2rem'}}>{money(chosen.pricePaise)}</h2>
     <h3 style={{marginTop:12}}>{chosen.title}</h3><p>{chosen.description}</p>
     <p><Clock3 size={16} style={{verticalAlign:'middle'}}/> Estimated {chosen.deliveryDays} days · {chosen.revisions} revisions</p>
     {chosen.expressDays&&<p className="small-note">Optional express: {chosen.expressDays} days · +{money(chosen.expressPricePaise)}</p>}
     <p className="notice">Package prices are indicative. Tailor sends an itemized final quote for your approval before payment.</p>
     <Link className="btn" href={'/book/'+g.tailor.id+'?'+new URLSearchParams({gigId:g.id,gigTier:chosen.tier,categoryId:g.category.id,serviceType:g.category.serviceType}).toString()}>Select package & request quote →</Link>
    </>}
   </aside>
  </div>}
 </div>;
}