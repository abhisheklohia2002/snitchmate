'use client';
import {useParams} from 'next/navigation';
import Link from 'next/link';
import {useState} from 'react';
import {Portal} from '@/components/Portal';
import {PageTitle,useLoad,Alert} from '@/components/Shared';
import {api,post,dateTime,textStatus} from '@/lib/api';

type QC={orderNumber:string;status:string;items:{id:string;garment:string;quantity:number;status:string;evidence:{fileId:string;note:string|null;createdAt:string}[]}[]};
export default function QCReview(){
 const {id}=useParams<{id:string}>();
 const {data,error}=useLoad<QC>(`/admin/orders/${id}/qc-evidence`);
 const [links,setLinks]=useState<Record<string,string>>({}),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function view(fileId:string){
  setBusy(true);setMessage('');
  try{const r=await api<{url:string}>(`/uploads/${fileId}/access`);setLinks(x=>({...x,[fileId]:r.url}));}
  catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
 }
 async function approve(){
  if(!reviewed||!data||data.items.some(i=>i.status!=='READY_FOR_QC'||!i.evidence.length))return;
  if(!window.confirm('Approve every garment after checking the finished photos and their condition?'))return;
  setBusy(true);setMessage('');
  try{await post(`/admin/orders/${id}/approve-qc`);window.location.assign('/admin/logistics');}
  catch(e){setMessage((e as Error).message);setBusy(false);}
 }
 const eligible=!!data&&data.items.length>0&&data.items.every(i=>i.status==='READY_FOR_QC'&&i.evidence.length>0);
 return <Portal role="admin">
  <PageTitle eyebrow="Quality gate" title={data?.orderNumber??'Review garment evidence'} lead="Inspect each completed garment photograph before releasing the order for return pickup."/>
  <Alert error={error||message}/>
  <div className="rows">{data?.items.map(i=><section className="card" key={i.id}>
   <div className="list-header"><h3>{i.garment} × {i.quantity}</h3><span className="pill">{textStatus(i.status)}</span></div>
   {i.evidence.length?i.evidence.map(e=><div key={e.fileId} style={{marginTop:12}}>
    <p className="small-note">Submitted {dateTime(e.createdAt)} · {e.note}</p>
    {links[e.fileId]?<><a className="text-link" href={links[e.fileId]} target="_blank" rel="noreferrer">Open full-size evidence photo →</a><img src={links[e.fileId]} alt={`QC evidence for ${i.garment}`} style={{display:'block',maxWidth:'100%',maxHeight:320,borderRadius:10,marginTop:12}}/></>:
     <button className="btn secondary small" onClick={()=>view(e.fileId)} disabled={busy}>Load private QC photograph</button>}
   </div>):<p className="error">No QC evidence for this item. Do not approve.</p>}
  </section>)}</div>
  <div className="card" style={{marginTop:20}}>
   <label style={{display:'flex',alignItems:'flex-start',gap:12}}><input type="checkbox" style={{width:18,marginTop:2}} checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/><span>I have examined the evidence for every garment and verified the completed item condition.</span></label>
   <div className="form-actions"><button className="btn" disabled={busy||!eligible||!reviewed} onClick={approve}>Approve QC & create return courier job</button><Link className="btn secondary" href="/admin/orders">Back to orders</Link></div>
  </div>
 </Portal>;
}
