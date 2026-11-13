'use client';
import {useState} from 'react';
import {Portal} from '@/components/Portal';
import {PageTitle,useLoad,Alert} from '@/components/Shared';
import {post} from '@/lib/api';
type Partner={id:string;displayName:string;vehicleType:string;status:string;servicePincode:string;available:boolean;user:{phone:string}};
export default function PartnerAdmin(){
 const {data,refresh,error}=useLoad<Partner[]>('/admin/delivery-partners');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[problem,setProblem]=useState('');
 async function act(id:string,action:'approve'|'suspend'){setBusy(true);setProblem('');setMessage('');
  try{await post('/admin/delivery-partners/'+id+'/'+action,{});refresh();setMessage('Partner status updated.');}
  catch(e){setProblem((e as Error).message);}finally{setBusy(false);}
 }
 return <Portal role="admin"><PageTitle eyebrow="Hyperlocal dispatch" title="Delivery partner verification" lead="Review and approve local riders before they can access customer addresses or accept jobs."/>
  <Alert error={error||problem} success={message}/>
  {data?.map(p=><section className="card" key={p.id} style={{marginBottom:16}}>
   <div className="list-header"><h3>{p.displayName}</h3><span className="pill">{p.status}</span></div>
   <p>{p.vehicleType} · {p.servicePincode} · {p.user.phone} · {p.available?'Online':'Offline'}</p>
   {p.status==='PENDING'&&<button className="btn small" disabled={busy} onClick={()=>act(p.id,'approve')}>Approve verified partner</button>}
   {p.status==='APPROVED'&&<button className="btn secondary small" disabled={busy} onClick={()=>act(p.id,'suspend')}>Suspend partner</button>}
  </section>)}
  {!data?.length&&<p>No rider applications yet.</p>}
 </Portal>;
}