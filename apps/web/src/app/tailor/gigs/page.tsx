'use client';
import {useState} from 'react';
import {Portal} from '@/components/Portal';
import {PageTitle,useLoad,Alert,Category} from '@/components/Shared';
import {post,upload,money} from '@/lib/api';
type Shop={id:string;shopName:string;status:string;services:{categoryId:string;category:Category}[]};
type Gig={id:string;title:string;status:string;slug:string;tailor:{shopName:string};packages:{tier:string;pricePaise:string}[]};
const tiers=['BASIC','STANDARD','PREMIUM'] as const;
type Tier=typeof tiers[number];
export default function TailorGigs(){
 const {data:shops}=useLoad<Shop[]>('/tailor/me');const {data:gigs,refresh}=useLoad<Gig[]>('/gigs/mine');
 const [shop,setShop]=useState(''),[category,setCategory]=useState(''),[title,setTitle]=useState(''),[desc,setDesc]=useState('');
 const [packages,setPackages]=useState<Record<Tier,{enabled:boolean;title:string;description:string;price:string;days:string;revisions:string}>>({
 BASIC:{enabled:true,title:'Essential tailoring',description:'Tailored to your measurements and specifications',price:'500',days:'7',revisions:'1'},
 STANDARD:{enabled:false,title:'Premium tailoring',description:'Additional finishing and custom design details',price:'850',days:'5',revisions:'2'},
 PREMIUM:{enabled:false,title:'Signature tailoring',description:'Priority, personalised tailoring and premium finish',price:'1400',days:'4',revisions:'3'}
 });
 const [imageIds,setImageIds]=useState<string[]>([]),[rights,setRights]=useState(false),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[err,setErr]=useState('');
 const selected=shops?.find(s=>s.id===(shop||shops[0]?.id));
 async function attach(fs:FileList|null){if(!fs)return;setBusy(true);setErr('');try{for(const file of Array.from(fs).slice(0,Math.max(0,6-imageIds.length))){const id=await upload(file,'DESIGN');setImageIds(x=>[...x,id]);}}catch(e){setErr((e as Error).message);}finally{setBusy(false);}}
 async function create(e:React.FormEvent){e.preventDefault();setBusy(true);setErr('');setMsg('');
  try{if(!selected)throw new Error('Create a tailor shop first');if(imageIds.length&&!rights)throw new Error('Confirm you own the gallery photos and have permission to publish them');
   const input={tailorId:selected.id,categoryId:category,title,description:desc,imageFileIds:imageIds,imageRightsConfirmed:rights,
    packages:tiers.filter(t=>packages[t].enabled).map(t=>({tier:t,title:packages[t].title,description:packages[t].description,pricePaise:String(Math.round(Number(packages[t].price)*100)),deliveryDays:Number(packages[t].days),revisions:Number(packages[t].revisions)}))};
   await post('/gigs',input);refresh();setMsg('Gig saved as draft. Publish after reviewing it.');setTitle('');setDesc('');setImageIds([]);setRights(false);
  }catch(e){setErr((e as Error).message);}finally{setBusy(false);}
 }
 async function action(id:string,mode:'publish'|'pause'){setBusy(true);setMsg('');setErr('');try{await post('/gigs/'+id+'/'+mode);refresh();setMsg('Gig '+(mode==='publish'?'published':'paused')+'.');}catch(e){setErr((e as Error).message);}finally{setBusy(false);}}
 return <Portal role="tailor"><PageTitle eyebrow="Your marketplace" title="Manage tailoring gigs" lead="Create Basic, Standard and Premium packages with design galleries and turnaround times."/>
  <Alert error={err} success={msg}/>
  <section className="card"><h3>Current gigs</h3>
   {gigs?.map(g=><div key={g.id} className="price-row"><div><strong>{g.title}</strong><br/><small>{g.tailor.shopName} · {g.status} · From {money(g.packages[0]?.pricePaise)}</small></div><button className="btn small" disabled={busy} onClick={()=>action(g.id,g.status==='PUBLISHED'?'pause':'publish')}>{g.status==='PUBLISHED'?'Pause':'Publish'}</button></div>)}
   {!gigs?.length&&<p>No gigs created. Start below.</p>}
  </section>
  <form className="card" style={{marginTop:20}} onSubmit={create}>
   <h3>Create a new gig</h3>
   <label>Tailor shop<select value={selected?.id||''} onChange={e=>{setShop(e.target.value);setCategory('');}}>{shops?.map(t=><option key={t.id} value={t.id}>{t.shopName} ({t.status})</option>)}</select></label>
   <label>Service category<select value={category} onChange={e=>setCategory(e.target.value)} required><option value="">Choose service</option>{selected?.services.map(s=><option key={s.categoryId} value={s.categoryId}>{s.category.title}</option>)}</select></label>
   <label>Gig title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Premium designer blouse stitching" minLength={8} required/></label>
   <label>Description<textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Describe fabric, measurements, fitting, finishing, inclusions…" minLength={40} required/></label>
   <h3 style={{marginTop:22}}>Service packages</h3>
   {tiers.map(t=><div key={t} className="card" style={{marginTop:12,background:'var(--cream)'}}>
    <label style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" style={{width:18}} disabled={t==='BASIC'} checked={packages[t].enabled} onChange={e=>setPackages(x=>({...x,[t]:{...x[t],enabled:e.target.checked}}))}/> {t}</label>
    {packages[t].enabled&&<><label>Package name<input value={packages[t].title} onChange={e=>setPackages(x=>({...x,[t]:{...x[t],title:e.target.value}}))}/></label>
     <label>What's included<textarea value={packages[t].description} onChange={e=>setPackages(x=>({...x,[t]:{...x[t],description:e.target.value}}))}/></label>
     <div className="field-grid"><label>Starting price (₹)<input type="number" min={1} value={packages[t].price} onChange={e=>setPackages(x=>({...x,[t]:{...x[t],price:e.target.value}}))}/></label>
     <label>Turnaround (days)<input type="number" min={1} value={packages[t].days} onChange={e=>setPackages(x=>({...x,[t]:{...x[t],days:e.target.value}}))}/></label>
     <label>Included revisions<input type="number" min={0} value={packages[t].revisions} onChange={e=>setPackages(x=>({...x,[t]:{...x[t],revisions:e.target.value}}))}/></label></div></>}
   </div>)}
   <label>Portfolio photos (up to 6)<input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={e=>attach(e.target.files)}/></label>
   <p className="small-note">{imageIds.length} uploaded. Only publish work you have permission to show.</p>
   <label style={{display:'flex',gap:10,alignItems:'center'}}><input type="checkbox" style={{width:18}} checked={rights} onChange={e=>setRights(e.target.checked)}/> I own or have permission to publish all uploaded portfolio images.</label>
   <button className="btn" disabled={busy||!selected||!category}>{busy?'Saving…':'Save gig as draft'}</button>
  </form>
 </Portal>;
}