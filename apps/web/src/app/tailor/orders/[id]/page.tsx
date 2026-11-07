'use client';
import {useParams} from 'next/navigation';
import {useState} from 'react';
import {Portal} from '@/components/Portal';
import {PageTitle,useLoad,Alert,Order} from '@/components/Shared';
import {post,textStatus,money,upload,dateTime} from '@/lib/api';

export default function TailorOrder(){
 const {id}=useParams<{id:string}>();
 const {data:o,refresh,error}=useLoad<Order>(`/tailor/orders/${id}`);
 const {data:context}=useLoad<{logisticsPaise:string}>(`/tailor/orders/${id}/quote-context`);
 const [prices,setPrices]=useState<Record<string,string>>({});
 const [notes,setNotes]=useState(''),[receipt,setReceipt]=useState('Materials match the request');
 const [issuePhoto,setIssuePhoto]=useState('');
 const [progressNotes,setProgressNotes]=useState<Record<string,string>>({});
 const [qcFiles,setQcFiles]=useState<Record<string,string>>({});
 const [err,setErr]=useState(''),[busy,setBusy]=useState(false);
 async function action(path:string,body:unknown={}){
  setBusy(true);setErr('');
  try{await post(path,body);setErr('Saved successfully.');refresh();}
  catch(e){setErr((e as Error).message);}finally{setBusy(false);}
 }
 async function attach(file:File|undefined,purpose:'HANDOFF'|'QC',itemId?:string){
  if(!file)return;setBusy(true);setErr('');
  try{const fileId=await upload(file,purpose);if(itemId)setQcFiles(old=>({...old,[itemId]:fileId}));else setIssuePhoto(fileId);setErr('Photograph verified.');}
  catch(e){setErr((e as Error).message);}finally{setBusy(false);}
 }
 async function quote(){
  if(!o||!context)return;
  const lines=o.items.map(item=>({orderItemId:item.id,description:`${item.category.title} tailoring`,quantity:item.quantity,unitPricePaise:String(Math.round(Number(prices[item.id]||0)*100))}));
  await action(`/tailor/orders/${id}/quotes`,{lines,logisticsPaise:String(context.logisticsPaise),taxPaise:'0',discountPaise:'0',validHours:48,notes});
 }
 return <Portal role="tailor">
  <PageTitle eyebrow="Workshop order" title={o?.orderNumber||'Order'} lead="Review customer requirements and record fabric receipt, production, finished photos and quality handoff."/>
  <Alert error={error||(err!=='Saved successfully.'&&!err.startsWith('Photograph verified')?err:undefined)} success={err==='Saved successfully.'||err.startsWith('Photograph verified')?err:undefined}/>
  {o&&<div className="grid-2">
   <div>
    <section className="card"><h3>Garments and instructions</h3>
     {o.items.map(item=><div key={item.id} style={{padding:'10px 0',borderBottom:'1px solid #e2ddd2'}}><strong>{item.category.title} × {item.quantity}</strong><p>{item.instructions||'No additional instructions'}</p><span className="pill">{textStatus(item.productionStatus)}</span></div>)}
     <p>Order state: <span className="pill orange">{textStatus(o.status)}</span></p>
    </section>
    {['QUOTE_PENDING','QUOTE_READY'].includes(o.status)&&<section className="card"><h3>Send itemized quotation</h3>
     {o.items.map(item=><label key={item.id}>{item.category.title} — stitching per piece (₹)<input type="number" min="1" value={prices[item.id]||''} onChange={e=>setPrices({...prices,[item.id]:e.target.value})}/></label>)}
     <label>Terms and turnaround notes<textarea value={notes} onChange={e=>setNotes(e.target.value)}/></label>
     <p className="small-note">Two-way delivery: {money(context?.logisticsPaise)} (server-calculated). Confirm taxes before live collections.</p>
     <button className="btn" disabled={busy||!context||o.items.some(i=>!Number(prices[i.id]))} onClick={quote}>Send quotation</button>
    </section>}
    {o.status==='MATERIAL_RECEIVED'&&<section className="card"><h3>Check incoming fabric</h3>
     <p>Count every piece and inspect material, seal and condition before beginning stitching. Any discrepancy must be recorded with a photo.</p>
     <label>Material notes<textarea value={receipt} onChange={e=>setReceipt(e.target.value)}/></label>
     <button className="btn" disabled={busy||receipt.trim().length<3} onClick={()=>action(`/tailor/orders/${id}/receipt`,{accepted:true,note:receipt})}>Fabric verified — begin stitching</button>
     <hr className="divider"/><h3>Material discrepancy?</h3>
     <p className="small-note">Do not work on damaged, short or mismatched fabric. Submit evidence to pause this order for operations review.</p>
     <label>Evidence photograph<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>attach(e.target.files?.[0],'HANDOFF')}/></label>
     <button className="btn secondary small" disabled={busy||!issuePhoto||receipt.trim().length<3} onClick={()=>action(`/tailor/orders/${id}/receipt`,{accepted:false,note:receipt,proofFileId:issuePhoto})}>Report material issue (pause order)</button>
    </section>}
    {['IN_PRODUCTION','REWORK_IN_PROGRESS'].includes(o.status)&&<section className="card"><h3>Stitching progress</h3>
     <p>Each garment needs a final verified photo before it can be submitted for quality checking.</p>
     {o.items.map(item=><div key={item.id} style={{padding:'15px 0',borderBottom:'1px solid #e2ddd2'}}>
      <strong>{item.category.title} × {item.quantity}</strong> <span className="pill">{textStatus(item.productionStatus)}</span>
      <label>Progress note<textarea value={progressNotes[item.id]??'Stitching completed and garment checked against instructions.'} onChange={e=>setProgressNotes(x=>({...x,[item.id]:e.target.value}))}/></label>
      <label>Finished garment photograph<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>attach(e.target.files?.[0],'QC',item.id)}/></label>
      <div className="form-actions"><button className="btn secondary small" disabled={busy} onClick={()=>action(`/tailor/orders/${id}/progress`,{itemId:item.id,status:'IN_PROGRESS',note:progressNotes[item.id]??'Garment stitching is in progress.'})}>Log progress</button>
       <button className="btn small" disabled={busy||!qcFiles[item.id]} onClick={()=>action(`/tailor/orders/${id}/progress`,{itemId:item.id,status:'READY_FOR_QC',note:progressNotes[item.id]??'Finished garment photo ready for QC.',fileId:qcFiles[item.id]})}>Mark ready for QC</button></div>
      {item.productionEvents?.slice(0,3).map(e=><p className="small-note" key={e.id}>{dateTime(e.createdAt)} · {textStatus(e.status)} · {e.note}</p>)}
     </div>)}
     <button className="btn" style={{marginTop:18}} disabled={busy||o.items.some(i=>i.productionStatus!=='READY_FOR_QC')} onClick={()=>action(`/tailor/orders/${id}/ready-for-qc`)}>Submit finished garments to QC</button>
    </section>}
    {o.status==='QUALITY_CHECK'&&<section className="card"><h3>Awaiting operations QC</h3><p>Finished photographs were submitted. StitchMate operations will inspect them and create a courier return job only after approval.</p></section>}
    {['RETURN_PICKUP_SCHEDULED','OUTBOUND_TRANSIT','DELIVERED','COMPLETED'].includes(o.status)&&<section className="card"><h3>Return & completion</h3><p>{o.status==='RETURN_PICKUP_SCHEDULED'?'Prepare the sealed finished garment parcel. Operations will dispatch a return courier.':'The return leg is underway or completed. Follow confirmed custody events.'}</p></section>}
   </div>
   <div>
    <section className="card"><h3>Quote history</h3>{o.quotes?.map(q=><div key={q.id} className="price-row"><span>Version {q.revision} — {q.status}</span><strong>{money(q.totalPaise)}</strong></div>)}</section>
    <section className="card"><h3>Order journey</h3>{o.events?.map(e=><p key={e.id}><span className="pill">{textStatus(e.to)}</span><br/><span className="small-note">{dateTime(e.createdAt)} {e.reason&&` · ${e.reason}`}</span></p>)}</section>
    <section className="card"><h3>Courier legs</h3>{o.logistics?.map(j=><div className="price-row" key={j.id}><strong>{textStatus(j.direction)}</strong><span className="pill">{textStatus(j.status)}</span></div>)}{!o.logistics?.length&&<p>Delivery jobs appear after payment and scheduling.</p>}</section>
   </div>
  </div>}
 </Portal>;
}
