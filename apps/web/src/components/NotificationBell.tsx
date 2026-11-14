'use client';
import Link from 'next/link';
import {Badge,Button,Drawer,Empty,List,Popover,Spin,Switch,Tooltip,Typography} from 'antd';
import {Bell,CheckCheck,Volume2} from 'lucide-react';
import {useEffect,useState} from 'react';
import {useNotifications,type Notice} from './NotificationProvider';

function timeAgo(value:string){
 const delta=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/60000));
 if(delta<1)return 'Just now';
 if(delta<60)return delta+'m ago';
 if(delta<1440)return Math.floor(delta/60)+'h ago';
 return new Date(value).toLocaleDateString('en-IN',{day:'numeric',month:'short'});
}
export function NotificationItem({item,onSelect}:{item:Notice;onSelect?:()=>void}){
 const {markRead}=useNotifications();
 return <List.Item className={'notification-item'+(!item.readAt?' unread':'')}>
  <div className="notification-item-body">
   <span className="notification-item-indicator" aria-hidden="true"/>
   <div className="notification-item-copy">
    <div className="notification-item-top"><strong>{item.title}</strong><time dateTime={item.createdAt}>{timeAgo(item.createdAt)}</time></div>
    <p>{item.body}</p>
    <div className="notification-item-actions">
     {item.href&&<Link href={item.href} onClick={()=>{if(!item.readAt)void markRead(item.id);onSelect?.();}}>View details</Link>}
     {!item.readAt&&<Button type="link" size="small" onClick={()=>void markRead(item.id)}>Mark read</Button>}
    </div>
   </div>
  </div>
 </List.Item>;
}
export function NotificationBell(){
 const [open,setOpen]=useState(false);
 const [mobile,setMobile]=useState(false);
 useEffect(()=>{const media=window.matchMedia('(max-width:690px)');const sync=()=>setMobile(media.matches);sync();media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync);},[]);
 const {items,unreadCount,loading,error,soundEnabled,setSound,markAllRead,refresh}=useNotifications();
 const content=<div className="notification-panel">
  <div className="notification-panel-head">
   <div><span className="eyebrow">StitchMate updates</span><h3>Notifications</h3></div>
   {unreadCount>0&&<Tooltip title="Mark all notifications read"><Button type="text" aria-label="Mark all notifications read" onClick={()=>void markAllRead()} icon={<CheckCheck size={18}/>}/></Tooltip>}
  </div>
  <div className="notification-panel-content">
   {loading&&!items.length?<div className="notification-loading"><Spin/> Loading notifications…</div>:
    items.length?<List dataSource={items.slice(0,8)} renderItem={item=><NotificationItem item={item} onSelect={()=>setOpen(false)}/>}/>:
    <Empty description="You're all caught up" image={Empty.PRESENTED_IMAGE_SIMPLE}/>}
   {error&&<Typography.Text type="danger" role="alert">{error}</Typography.Text>}
  </div>
  <div className="notification-panel-settings">
   <span><Volume2 size={16}/> Sound for new alerts</span>
   <Switch size="small" checked={soundEnabled} onChange={enabled=>void setSound(enabled)} aria-label="Enable notification sound"/>
  </div>
  <div className="notification-panel-foot"><Link href="/notifications" onClick={()=>setOpen(false)}>View all notifications</Link><Button size="small" type="text" onClick={()=>void refresh()}>Refresh</Button></div>
 </div>;
 const trigger=<Tooltip title="Notifications"><Badge count={unreadCount} size="small" overflowCount={99} offset={[-2,4]}>
   <Button type="text" className="header-utility-button" aria-label={'Notifications'+(unreadCount?' ('+unreadCount+' unread)':'')}
    onClick={mobile?()=>{setOpen(true);void refresh();}:undefined} icon={<Bell size={20}/>}/>
  </Badge></Tooltip>;
 if(mobile)return <>{trigger}
  <Drawer placement="right" title="Notifications" width="min(390px, 100vw)" open={open} onClose={()=>setOpen(false)}
   styles={{body:{padding:0},header:{padding:'14px 18px'}}} destroyOnHidden>
   {content}
  </Drawer>
 </>;
 return <Popover placement="bottomRight" arrow={false} trigger="click" open={open}
  onOpenChange={value=>{setOpen(value);if(value)void refresh();}} content={content}
  styles={{container:{padding:0,maxWidth:'calc(100vw - 18px)',borderRadius:16}}}>
  {trigger}
 </Popover>;
}