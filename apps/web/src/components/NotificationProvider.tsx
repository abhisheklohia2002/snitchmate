'use client';
import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {api} from '@/lib/api';
import {useAuth} from './Auth';

export type StitchNotification={id:string;kind:string;title:string;body:string;href:string|null;createdAt:string;readAt:string|null};
type Page={items:StitchNotification[];total:number;unreadCount:number;page:number;pageSize:number};
type NotificationState={
 items:StitchNotification[];unreadCount:number;total:number;page:number;loading:boolean;error:string|null;
 soundEnabled:boolean;enableSound:(enabled:boolean)=>void;read:(id:string)=>Promise<void>;
 readAll:()=>Promise<void>;goToPage:(page:number)=>void;refresh:()=>Promise<void>;
};
const Context=createContext<NotificationState|undefined>(undefined);
const INITIAL:Page={items:[],total:0,unreadCount:0,page:1,pageSize:15};
const SOUND_PREFIX='stitchmate-notification-sound-';

function playGentleAlert(context:AudioContext|null){
 if(!context||document.visibilityState!=='visible')return;
 void context.resume().then(()=>{
  const now=context.currentTime;
  // Original gentle two-tone bell; short envelope, no downloaded audio or tracking.
  for(const [frequency,offset,volume] of [[660,0,.025],[880,.12,.017]]){
   const oscillator=context.createOscillator(),gain=context.createGain();
   oscillator.type='sine';oscillator.frequency.value=frequency;
   gain.gain.setValueAtTime(.00001,now+offset);
   gain.gain.exponentialRampToValueAtTime(volume,now+offset+.018);
   gain.gain.exponentialRampToValueAtTime(.00001,now+offset+.21);
   oscillator.connect(gain);gain.connect(context.destination);
   oscillator.start(now+offset);oscillator.stop(now+offset+.23);
  }
 }).catch(()=>{});
}
export function NotificationProvider({children}:{children:ReactNode}){
 const {user}=useAuth();
 const [data,setData]=useState<Page>(INITIAL);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [soundEnabled,setSoundEnabled]=useState(false);
 const enabledRef=useRef(false);
 const soundRef=useRef<AudioContext|null>(null);
 const seenRef=useRef(new Set<string>());
 const initialRef=useRef(false);
 const userIdRef=useRef<string|null>(null);
 const pageRef=useRef(1);

 const refresh=useCallback(async(page=pageRef.current,first=false)=>{
  if(!user?.id)return;
  const currentUser=user.id;
  try{
   const response=await api<Page>('/notifications?page='+page+'&limit=15');
   if(userIdRef.current!==currentUser)return;
   if(first){
    seenRef.current=new Set(response.items.map(item=>item.id));
    initialRef.current=true;
   }else{
    const newItems=response.items.filter(item=>!seenRef.current.has(item.id)&&!item.readAt);
    if(newItems.length&&initialRef.current&&enabledRef.current)playGentleAlert(soundRef.current);
    for(const item of response.items)seenRef.current.add(item.id);
    // Prevent unbounded memory after extended sessions.
    if(seenRef.current.size>2000)seenRef.current=new Set(response.items.map(x=>x.id));
   }
   setData(response);setError(null);
  }catch(e){if(userIdRef.current===currentUser)setError((e as Error).message);}
  finally{if(userIdRef.current===currentUser)setLoading(false);}
 },[user?.id]);
 useEffect(()=>{
  userIdRef.current=user?.id??null;
  pageRef.current=1;setData(INITIAL);setError(null);setLoading(false);
  seenRef.current=new Set();initialRef.current=false;
  soundRef.current?.close().catch(()=>{});soundRef.current=null;
  let active=true;
  if(!user?.id){setSoundEnabled(false);enabledRef.current=false;return;}
  let stored=false;
  try{stored=localStorage.getItem(SOUND_PREFIX+user.id)==='true';}catch{}
  setSoundEnabled(stored);enabledRef.current=stored;
  setLoading(true);
  void refresh(1,true).then(()=>{
   if(!active)return;
  });
  // SSE connects only after the first inbox snapshot is fetched. The backend
  // streams only this session's notifications and never broadcasts across users.
  let stream:EventSource|null=null;
  const createStream=async()=>{
   try {
    await refresh(1,!initialRef.current);
    if(!active)return;
    stream=new EventSource('/api/v1/notifications/stream',{withCredentials:true});
    stream.addEventListener('notification',()=>{if(active)void refresh();});
    stream.addEventListener('retry',()=>{if(active)void refresh();});
   } catch {}
  };
  void createStream();
  // Very low frequency reconnect safety refresh when SSE is interrupted.
  const timer=window.setInterval(()=>{if(active&&!document.hidden)void refresh();},120000);
  return()=>{active=false;stream?.close();clearInterval(timer);};
 },[user?.id,refresh]);
 const enableSound=useCallback((enabled:boolean)=>{
  if(!user?.id)return;
  enabledRef.current=enabled;setSoundEnabled(enabled);
  try{localStorage.setItem(SOUND_PREFIX+user.id,enabled?'true':'false');}catch{}
  if(enabled&&typeof window!=='undefined'){
   if(!soundRef.current)soundRef.current=new AudioContext();
   void soundRef.current.resume().catch(()=>{});
  }else if(soundRef.current){void soundRef.current.close().catch(()=>{});soundRef.current=null;}
 },[user?.id]);
 const read=useCallback(async(id:string)=>{
  await api('/notifications/'+encodeURIComponent(id)+'/read',{method:'PATCH'});
  await refresh();
 },[refresh]);
 const readAll=useCallback(async()=>{
  await api('/notifications/read-all',{method:'PATCH'});
  await refresh();
 },[refresh]);
 const goToPage=useCallback((page:number)=>{pageRef.current=page;setLoading(true);void refresh(page);},[refresh]);
 const value=useMemo(()=>({items:data.items,unreadCount:data.unreadCount,total:data.total,page:data.page,loading,error,soundEnabled,enableSound,read,readAll,goToPage,refresh:()=>refresh()}),[data,loading,error,soundEnabled,enableSound,read,readAll,goToPage,refresh]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useNotifications(){
 const ctx=useContext(Context);
 if(!ctx)throw new Error('NotificationProvider is missing');
 return ctx;
}
