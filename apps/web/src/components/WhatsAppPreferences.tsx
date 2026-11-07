'use client';
import { useEffect, useState } from 'react';
import { api, post } from '@/lib/api';
export function WhatsAppPreferences(){
  const [enabled,setEnabled]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{
    let active=true;
    api<{enabled:boolean}>('/me/whatsapp-preferences').then(data=>{
      if(active)setEnabled(data.enabled);
    }).catch(()=>{if(active)setMessage('Could not load WhatsApp preference.');}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[]);
  async function change(next:boolean){
    setSaving(true);setMessage('');
    try{
      const result=await post<{enabled:boolean}>('/me/whatsapp-preferences',{enabled:next});
      setEnabled(result.enabled);
      setMessage(result.enabled?'WhatsApp order updates enabled.':'WhatsApp order updates disabled.');
    }catch(error){setMessage((error as Error).message);}
    finally{setSaving(false);}
  }
  return <section className="card" style={{marginBottom:32}} aria-label="WhatsApp notifications">
    <h3>WhatsApp order updates</h3>
    <p>Choose whether StitchMate may send order quotation, payment, tailoring, pickup, and delivery updates to your verified number through Twilio. Login OTPs are sent separately using MSGKART.</p>
    <label style={{display:'flex',alignItems:'flex-start',gap:12}}>
      <input type="checkbox" checked={enabled} disabled={saving||loading} onChange={e=>void change(e.target.checked)} aria-label="Receive StitchMate WhatsApp order updates"/>
      <span>I agree to receive StitchMate transactional order updates on WhatsApp. I can turn these off anytime.</span>
    </label>
    {loading&&<small>Loading preference…</small>}
    {message&&<p role="status">{message}</p>}
  </section>;
}
