'use client';
import Link from 'next/link';
import {Button,Input,InputNumber,Select,Spin,Tag,Upload,message as antdMessage} from 'antd';
import {ArrowRight,CheckCircle2,ImagePlus,MessageCircleMore,Plus,Sparkles,Send,ShieldCheck,Scissors} from 'lucide-react';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useAuth,RequireAuth} from '@/components/Auth';
import {api,upload,money} from '@/lib/api';
import {PageTitle} from '@/components/Shared';

type Design={neckline:string|null;sleeveType:string|null;embroidery:string|null;color:string|null;silhouette:string|null};
type Requirements={garmentType:string|null;serviceType:'CUSTOM_STITCHING'|'ALTERATION'|null;occasion:string|null;budgetMax:number|null;preferredDeliveryDays:number|null;pincode:string|null;design:Design;additionalInstructions:string;missingInformation:string[];uncertainty:string[]};
type Package={tier:'BASIC'|'STANDARD'|'PREMIUM';title:string;pricePaise:string;deliveryDays:number;revisions:number};
type Gig={id:string;slug:string;title:string;description:string;categoryId:string;serviceType:'CUSTOM_STITCHING'|'ALTERATION';tailor:{id:string;slug:string;shopName:string};packages:Package[];rating:number|null;reviewCount:number};
type Turn={id:string;role:string;content:string;createdAt:string;imageFileIds?:string[]};
type Conversation={id:string;title:string;requirements:Requirements;messages:Turn[];referenceImageIds:string[];brief:unknown;confirmedAt:string|null};
type ChatResult={reply:string;requirements:Requirements;recommendations:Gig[];enabled:boolean;error?:string};
type Session={id:string;title:string;updatedAt:string};
const empty:Requirements={garmentType:null,serviceType:null,occasion:null,budgetMax:null,preferredDeliveryDays:null,pincode:null,
 design:{neckline:null,sleeveType:null,embroidery:null,color:null,silhouette:null},additionalInstructions:'',missingInformation:[],uncertainty:[]};
const examples=['Blouse for a wedding under ₹2,000','Jeans alteration near 110086','A kurta with full sleeves in seven days'];
function num(n:number|null){return n===null?undefined:n;}
export default function AiStudio(){return <RequireAuth><AiStudioScreen/></RequireAuth>}
function AiStudioScreen(){
 const {user}=useAuth(),router=useRouter(),bottom=useRef<HTMLDivElement>(null);
 const [config,setConfig]=useState<{enabled:boolean;maxImages:number;maxImageBytes:number;dailyLimit:number}|null>(null);
 const [sessions,setSessions]=useState<Session[]>([]),[conversation,setConversation]=useState<Conversation|null>(null);
 const [draft,setDraft]=useState(''),[requirements,setRequirements]=useState<Requirements>(empty);
 const [recommendations,setRecommendations]=useState<Gig[]>([]),[selection,setSelection]=useState<{gigId:string;gigTier:Package['tier']}|null>(null);
 const [stagedImages,setStagedImages]=useState<string[]>([]),[uploading,setUploading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [confirmed,setConfirmed]=useState(false),[hint,setHint]=useState('');
 const load=useCallback(async()=>{
  try{const [c,s]=await Promise.all([api<{enabled:boolean;maxImages:number;maxImageBytes:number;dailyLimit:number}>('/ai/config'),api<Session[]>('/ai/conversations')]);setConfig(c);setSessions(s);}catch(e){setError((e as Error).message);}
 },[]);
 useEffect(()=>{if(user)void load();},[user?.id,load]);
 useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth',block:'nearest'});},[conversation?.messages.length,busy]);
 async function open(id:string){
  setBusy(true);setError('');
  try{const c=await api<Conversation>('/ai/conversations/'+id);setConversation(c);setRequirements(c.requirements||empty);setConfirmed(!!c.confirmedAt);setRecommendations([]);setSelection(null);setStagedImages([]);}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function start(){
  if(!config?.enabled)return;
  setBusy(true);setError('');
  try{const s=await api<Session>('/ai/conversations',{method:'POST'});await load();await open(s.id);}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function addImages(files:File[]){
  if(!config?.enabled)return;
  if(stagedImages.length+files.length>3){setError('Choose at most 3 images.');return;}
  setUploading(true);setError('');
  try{
   for(const file of files){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>config.maxImageBytes)throw Error('Use JPG, PNG or WebP images up to 5 MB each.');
    const id=await upload(file,'DESIGN');setStagedImages(previous=>[...previous,id]);
   }
   setHint('Images uploaded privately. Send your message to analyze them.');
  }catch(e){setError((e as Error).message);}finally{setUploading(false);}
 }
 async function send(text=draft){
  if(!conversation||busy||!config?.enabled||!text.trim())return;
  const requestId=crypto.randomUUID(),images=stagedImages;
  setBusy(true);setError('');setDraft('');setStagedImages([]);setHint('');
  const optimist:Turn={id:requestId,role:'USER',content:text,createdAt:new Date().toISOString(),imageFileIds:images};
  setConversation(c=>c?{...c,messages:[...c.messages,optimist]}:c);
  try{
   const result=await api<ChatResult>('/ai/conversations/'+conversation.id+'/messages',{method:'POST',body:JSON.stringify({message:text,requestId,imageFileIds:images})});
   if(!result.enabled)throw Error(result.error||'AI assistant unavailable.');
   setRequirements(result.requirements);setRecommendations(result.recommendations);setSelection(null);setConfirmed(false);
   setConversation(c=>c?{...c,messages:[...c.messages,{id:crypto.randomUUID(),role:'ASSISTANT',content:result.reply,createdAt:new Date().toISOString()}]}:c);
   void load();
  }catch(e){setError((e as Error).message);setDraft(text);setStagedImages(images);}
  finally{setBusy(false);}
 }
 function edit<K extends keyof Requirements>(field:K,value:Requirements[K]){
  setRequirements(r=>({...r,[field]:value}));setConfirmed(false);
 }
 function designEdit(field:keyof Design,value:string){setRequirements(r=>({...r,design:{...r.design,[field]:value||null}}));setConfirmed(false);}
 async function confirm(){
  if(!conversation||!selection)return;
  const g=recommendations.find(g=>g.id===selection.gigId),p=g?.packages.find(p=>p.tier===selection.gigTier);
  if(!g||!p||!requirements.pincode||!requirements.garmentType){setError('Choose an eligible gig and enter garment details and pincode.');return;}
  const instructions=requirements.additionalInstructions.trim()||[requirements.garmentType,requirements.occasion,...Object.values(requirements.design)].filter(Boolean).join('; ');
  if(instructions.length<5){setError('Add at least five characters of tailoring instructions.');return;}
  setBusy(true);setError('');
  try{
   const data=await api<{bookingUrl:string;confirmed:boolean}>('/ai/conversations/'+conversation.id+'/confirm',{method:'POST',body:JSON.stringify({
    ...requirements,garmentType:requirements.garmentType,serviceType:g.serviceType,pincode:requirements.pincode,
    additionalInstructions:instructions.slice(0,1200),imageFileIds:conversation.referenceImageIds,
    gigId:g.id,gigTier:p.tier,categoryId:g.categoryId,tailorId:g.tailor.id
   })});
   setConfirmed(true);router.push(data.bookingUrl);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="container ai-studio">
  <PageTitle eyebrow="StitchMate AI" title="Your personal tailoring copilot" lead="Turn an idea or reference photo into a clear design brief. Find verified local tailor gigs and request a real quotation."/>
  {!config?.enabled&&<div className="notice ai-config-notice" role="status">AI Copilot is not enabled yet. The normal <Link href="/gigs">tailor marketplace</Link> and booking features are available.</div>}
  <div className="ai-workspace">
   <aside className="ai-conversations card">
    <div className="ai-side-heading"><h3>Your ideas</h3><Button icon={<Plus size={16}/>} type="primary" onClick={()=>void start()} disabled={!config?.enabled||busy}>New</Button></div>
    {sessions.length===0?<p className="small-note">Start a new idea to save a tailoring conversation.</p>:sessions.map(s=><button type="button" key={s.id} className={'ai-history-item'+(conversation?.id===s.id?' active':'')} onClick={()=>void open(s.id)}>{s.title}<span>{new Date(s.updatedAt).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span></button>)}
    <div className="ai-privacy-note"><ShieldCheck size={17}/> Private to your account · Photos stay in your secure storage</div>
   </aside>
   <section className="ai-chat card">
    <div className="ai-chat-heading"><div className="ai-bot-icon"><Sparkles size={22}/></div><div><h2>StitchMate Copilot</h2><p>Design guidance and real tailor recommendations</p></div></div>
    <div className="ai-chat-scroll" aria-live="polite" aria-label="Conversation messages">
     {!conversation?<div className="ai-welcome"><div className="ai-sparkle"><Scissors size={30}/></div><h3>What would you like to make?</h3><p>Describe an outfit, a fit issue or a reference image. You decide every detail before booking.</p><Button type="primary" onClick={()=>void start()} disabled={!config?.enabled||busy}>Start a new conversation</Button></div>:
     <>
      {conversation.messages.map(item=><div key={item.id} className={'ai-message '+(item.role==='USER'?'from-user':'from-bot')}><span className="ai-message-label">{item.role==='USER'?'You':'StitchMate AI'}</span><p>{item.content}</p>{Array.isArray(item.imageFileIds)&&item.imageFileIds.length>0&&<Tag>{item.imageFileIds.length} reference photo(s)</Tag>}</div>)}
      {busy&&<div className="ai-thinking"><Spin size="small"/> Preparing your tailoring suggestions…</div>}
      <div ref={bottom}/>
     </>}
    </div>
    {conversation&&<>
     {conversation.messages.length===0&&<div className="ai-starters">{examples.map(example=><button type="button" className="ai-starter" key={example} onClick={()=>void send(example)} disabled={busy}>{example}</button>)}</div>}
     <form className="ai-composer" onSubmit={e=>{e.preventDefault();void send();}}>
      {stagedImages.length>0&&<div className="ai-upload-count"><ImagePlus size={15}/> {stagedImages.length} uploaded reference images <Button type="link" size="small" onClick={()=>setStagedImages([])}>Clear</Button></div>}
      <Input.TextArea rows={3} maxLength={1600} showCount value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Tell us what you want to stitch or alter…" aria-label="Your tailoring request" onPressEnter={e=>{if(!e.shiftKey){e.preventDefault();void send();}}} disabled={!config.enabled||busy}/>
      <div className="ai-composer-actions">
       <Upload accept="image/png,image/jpeg,image/webp" multiple fileList={[]} showUploadList={false} beforeUpload={(file,files)=>{if(file.uid===files[0]?.uid)void addImages(files);return false;}} disabled={uploading||busy||stagedImages.length>=3}>
        <Button icon={<ImagePlus size={17}/>} loading={uploading}>Add reference</Button>
       </Upload>
       <Button type="primary" htmlType="submit" icon={<Send size={16}/>} loading={busy} disabled={!draft.trim()||uploading}>Send</Button>
      </div>
     </form>
    </>}
   </section>
  </div>
  {conversation&&<div className="ai-results">
   <section className="card ai-brief">
    <div className="ai-section-heading"><Sparkles size={21}/><div><h2>Editable tailoring brief</h2><p>Check and correct the AI’s suggestions before booking.</p></div></div>
    <div className="field-grid">
     <label>Garment type<Input value={requirements.garmentType||''} maxLength={90} onChange={e=>edit('garmentType',e.target.value||null)} placeholder="e.g. blouse"/></label>
     <label>Service type<Select style={{width:'100%'}} value={requirements.serviceType||undefined} onChange={v=>edit('serviceType',v)} placeholder="Choose service" options={[{value:'CUSTOM_STITCHING',label:'Custom stitching'},{value:'ALTERATION',label:'Alteration'}]}/></label>
     <label>Delivery pincode<Input inputMode="numeric" maxLength={6} value={requirements.pincode||''} onChange={e=>edit('pincode',e.target.value.replace(/\D/g,'').slice(0,6)||null)} placeholder="6-digit pincode"/></label>
     <label>Maximum budget (₹)<InputNumber style={{width:'100%'}} min={1} max={1000000} value={num(requirements.budgetMax)} onChange={v=>edit('budgetMax',v)}/></label>
     <label>Preferred days<InputNumber style={{width:'100%'}} min={1} max={90} value={num(requirements.preferredDeliveryDays)} onChange={v=>edit('preferredDeliveryDays',v)}/></label>
     <label>Occasion<Input value={requirements.occasion||''} onChange={e=>edit('occasion',e.target.value||null)}/></label>
     {(['neckline','sleeveType','embroidery','color','silhouette'] as const).map(key=><label key={key}>{key.replace(/([A-Z])/g,' $1')}<Input value={requirements.design[key]||''} onChange={e=>designEdit(key,e.target.value)}/></label>)}
    </div>
    <label>Tailoring instructions<Input.TextArea rows={4} maxLength={1200} showCount value={requirements.additionalInstructions} onChange={e=>edit('additionalInstructions',e.target.value)} placeholder="Neckline, sleeves, fitting details, fabric preferences, special instructions…"/></label>
    {requirements.uncertainty.length>0&&<p className="notice"><strong>Image interpretation may be uncertain:</strong> {requirements.uncertainty.join(' · ')}</p>}
    <p className="small-note">Custom stitching still requires measurements or a fitting sample. Exact fit and final quoted costs must be confirmed by the tailor.</p>
    <Button type="default" onClick={()=>void refreshMatches()} disabled={busy}>Find matching gigs</Button>
   </section>
   <section className="card ai-recommendations">
    <div className="ai-section-heading"><Scissors size={21}/><div><h2>Verified tailor gigs</h2><p>Only approved shops, published packages and eligible service areas are included.</p></div></div>
    {!recommendations.length?<div className="empty"><h3>No eligible gigs yet</h3><p>Add garment type, service and pincode, or relax the budget and turnaround filters.</p><Link href="/gigs">Browse all published gigs</Link></div>:
    <div className="ai-gig-list">{recommendations.map(g=><article key={g.id} className="ai-gig-card"><div><strong>{g.title}</strong><p>{g.tailor.shopName}{g.rating!==null?' · ★ '+g.rating+' ('+g.reviewCount+')':''}</p></div><div className="ai-packages">{g.packages.map(p=><button type="button" key={p.tier} className={'ai-package'+(selection?.gigId===g.id&&selection.gigTier===p.tier?' selected':'')} onClick={()=>setSelection({gigId:g.id,gigTier:p.tier})}><strong>{p.tier}</strong><span>{money(p.pricePaise)}</span><small>{p.deliveryDays} days indicative</small></button>)}</div><Link href={'/gigs/'+g.slug}>View gig details</Link></article>)}</div>}
    {selection&&<div className="ai-booking-action"><p>Review your design and selected package. The tailor will send a separate final quotation.</p><Button type="primary" size="large" block onClick={()=>void confirm()} loading={busy}>Confirm brief & continue to booking <ArrowRight size={17}/></Button></div>}
   </section>
  </div>}
  {(error||hint)&&<div className={error?'error ai-status':'notice ai-status'} role="status">{error||hint}</div>}
 </div>;
 async function refreshMatches(){
  if(!conversation)return;
  // Matching is recalculated by the server from validated brief fields.
  if(!requirements.garmentType||!requirements.serviceType||!requirements.pincode){setError('Fill garment type, service and pincode first.');return;}
  setError('');setBusy(true);
  try{const data=await api<Gig[]>('/ai/matches',{method:'POST',body:JSON.stringify(requirements)});setRecommendations(data);setSelection(null);}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
}
