'use client';
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {api,API} from '@/lib/api';
import {useAuth} from '@/components/Auth';
import {playNotificationChime} from '@/lib/notification-sound';

export type Notice={
 id:string;type:string;role:string;title:string;body:string;href:string|null;
 createdAt:string;readAt:string|null;
};
type Page={items:Notice[];nextCursor:string|null;unreadCount:number};
type NotificationContextValue={
 items:Notice[];unreadCount:number;loading:boolean;error:string|null;hasMore:boolean;
 soundEnabled:boolean;setSound:(enabled:boolean)=>Promise<void>;
 refresh:()=>Promise<void>;loadMore:()=>Promise<void>;
 markRead:(id:string)=>Promise<void>;markAllRead:()=>Promise<void>;
};
const EMPTY:NotificationContextValue={
 items:[],unreadCount:0,loading:false,error:null,hasMore:false,soundEnabled:false,
 setSound:async()=>{},refresh:async()=>{},loadMore:async()=>{},markRead:async()=>{},markAllRead:async()=>{}
};
const Context=createContext<NotificationContextValue>(EMPTY);
export const useNotifications=()=>useContext(Context);
const byId=(old:Notice[],incoming:Notice[])=>{
 const map=new Map(old.map(item=>[item.id,item]));
 for(const item of incoming)map.set(item.id,item);
 return [...map.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
};
export function NotificationProvider({children}:{children:ReactNode}){
 const {user}=useAuth();
 const [items,setItems]=useState<Notice[]>([]);
 const [unreadCount,setUnreadCount]=useState(0);
 const [nextCursor,setNextCursor]=useState<string|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [soundEnabled,setSoundEnabled]=useState(false);
 const soundRef=useRef(false);
 const lastId=useRef<string|null>(null);
 const initialized=useRef(false);
 const fetching=useRef(false);

 const refresh=useCallback(async()=>{
  if(!user||fetching.current)return;
  fetching.current=true;
  try{
   const result=await api<Page>('/notifications?limit=20');
   setItems(result.items);setNextCursor(result.nextCursor);
   setUnreadCount(result.unreadCount);setError(null);
   if(!initialized.current){lastId.current=result.items[0]?.id||null;initialized.current=true;}
  }catch(e){setError((e as Error).message);}
  finally{fetching.current=false;setLoading(false);}
 },[user?.id]);

 const loadMore=useCallback(async()=>{
  if(!user||!nextCursor||fetching.current)return;
  fetching.current=true;
  try{
   const result=await api<Page>('/notifications?limit=20&cursor='+encodeURIComponent(nextCursor));
   setItems(old=>byId(old,result.items));setNextCursor(result.nextCursor);
   setUnreadCount(result.unreadCount);setError(null);
  }catch(e){setError((e as Error).message);}
  finally{fetching.current=false;}
 },[user?.id,nextCursor]);

 useEffect(()=>{
  setItems([]);setUnreadCount(0);setNextCursor(null);setError(null);
  setSoundEnabled(false);soundRef.current=false;lastId.current=null;
  initialized.current=false;fetching.current=false;
  if(!user)return;
  setLoading(true);
  let stopped=false;
  void api<{soundEnabled:boolean}>('/notifications/preferences').then(pref=>{
   if(!stopped){setSoundEnabled(pref.soundEnabled);soundRef.current=pref.soundEnabled;}
  }).catch(()=>{});
  void refresh();
  const url=API+'/notifications/stream';
  let stream:EventSource|null=null;
  try{
   stream=new EventSource(url,{withCredentials:true});
   stream.onmessage=event=>{
    if(stopped)return;
    try{
     const next=JSON.parse(event.data) as {latestId?:string|null;unreadCount?:number;error?:string};
     if(next.error==='SESSION_EXPIRED'){stream?.close();return;}
     if(typeof next.unreadCount==='number')setUnreadCount(next.unreadCount);
     if(!initialized.current){lastId.current=next.latestId||null;initialized.current=true;void refresh();return;}
     if(next.latestId&&lastId.current&&next.latestId!==lastId.current){
      lastId.current=next.latestId;
      if(soundRef.current)playNotificationChime();
      void refresh();
     }else if(!lastId.current&&next.latestId){
      lastId.current=next.latestId;void refresh();
     }
    }catch{/* Ignore malformed events; polling will recover. */}
   };
   stream.onerror=()=>{/* EventSource reconnects automatically; polling is a safe fallback. */};
  }catch{/* Browser may block event streams. */}
  const timer=window.setInterval(()=>{if(!stopped&&document.visibilityState==='visible')void refresh();},45000);
  const show=()=>{if(!stopped&&document.visibilityState==='visible')void refresh();};
  document.addEventListener('visibilitychange',show);
  return ()=>{stopped=true;stream?.close();window.clearInterval(timer);document.removeEventListener('visibilitychange',show);};
 },[user?.id,refresh]);

 const setSound=async(enabled:boolean)=>{
  if(!user)return;
  const previous=soundRef.current;
  setSoundEnabled(enabled);soundRef.current=enabled;
  try{
   const result=await api<{soundEnabled:boolean}>('/notifications/preferences',{
    method:'PATCH',body:JSON.stringify({soundEnabled:enabled}),headers:{'Content-Type':'application/json'}
   });
   setSoundEnabled(result.soundEnabled);soundRef.current=result.soundEnabled;
  }catch(e){setSoundEnabled(previous);soundRef.current=previous;setError((e as Error).message);}
 };
 const markRead=async(id:string)=>{
  if(!user)return;
  try{
   await api('/notifications/'+encodeURIComponent(id)+'/read',{method:'PATCH'});
   setItems(list=>list.map(i=>i.id===id?{...i,readAt:i.readAt||new Date().toISOString()}:i));
   await refresh();
  }catch(e){setError((e as Error).message);}
 };
 const markAllRead=async()=>{
  if(!user)return;
  try{
   await api('/notifications/read-all',{method:'PATCH'});
   setItems(list=>list.map(i=>({...i,readAt:i.readAt||new Date().toISOString()})));
   setUnreadCount(0);
  }catch(e){setError((e as Error).message);}
 };
 return <Context.Provider value={{items,unreadCount,loading,error,hasMore:!!nextCursor,soundEnabled,setSound,refresh,loadMore,markRead,markAllRead}}>{children}</Context.Provider>;
}