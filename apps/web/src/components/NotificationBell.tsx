'use client';
import Link from 'next/link';
import {useState} from 'react';
import {Badge,Button,Empty,List,Popover,Switch,Tooltip,Typography} from 'antd';
import {Bell,Check,CheckCheck,Volume2,VolumeX} from 'lucide-react';
import {useNotifications} from './NotificationProvider';
import {dateTime} from '@/lib/api';

export function NotificationBell(){
 const [open,setOpen]=useState(false);
 const {items,unreadCount,loading,error,soundEnabled,enableSound,read,readAll}=useNotifications();
 const content=<section className="notification-panel" aria-label="Your notifications">
  <div className="notification-top">
   <div><strong>Notifications</strong><p>{unreadCount} unread</p></div>
   <Tooltip title="Mark all as read"><Button type="text" disabled={!unreadCount} icon={<CheckCheck size={17}/>} aria-label="Mark all notifications read" onClick={()=>void readAll()}/></Tooltip>
  </div>
  {error&&<div role="alert" className="notification-error">Notification updates are temporarily unavailable.</div>}
  <div className="notification-list-container">
   {!items.length&&!loading?<Empty description="You're all caught up" image={Empty.PRESENTED_IMAGE_SIMPLE}/>:<List
     loading={loading} dataSource={items.slice(0,7)} renderItem={item=><List.Item className={'notification-item'+(!item.readAt?' unread':'')} key={item.id}>
      <div className="notification-item-content">
       <div className="notification-item-heading">
        {!item.readAt&&<span className="notification-unread-dot" aria-label="Unread"/>}
        <Typography.Text strong>{item.title}</Typography.Text>
       </div>
       <Typography.Paragraph ellipsis={{rows:2}}>{item.body}</Typography.Paragraph>
       <div className="notification-item-footer"><span>{dateTime(item.createdAt)}</span>
        {!item.readAt&&<button type="button" onClick={()=>void read(item.id)} aria-label="Mark notification read"><Check size={14}/> Read</button>}
        {item.href&&<Link href={item.href} onClick={()=>{setOpen(false);if(!item.readAt)void read(item.id);}}>Details</Link>}
       </div>
      </div>
     </List.Item>}/>}
  </div>
  <div className="notification-bottom">
   <label className="notification-sound-toggle"><span>{soundEnabled?<Volume2 size={17}/>:<VolumeX size={17}/>} Notification sound</span><Switch size="small" checked={soundEnabled} onChange={enableSound} aria-label="Enable notification sound"/></label>
   <Link href="/notifications" className="notification-all-link" onClick={()=>setOpen(false)}>View all notifications</Link>
  </div>
 </section>;
 return <Popover content={content} trigger="click" placement="bottomRight" open={open} onOpenChange={setOpen} arrow={false} getPopupContainer={()=>document.body}>
  <Tooltip title="Your notifications"><button type="button" className="notification-bell-button" aria-label={'Notifications, '+unreadCount+' unread'} aria-expanded={open}>
    <Badge count={unreadCount} overflowCount={99} size="small" offset={[-1,3]}><Bell size={20} strokeWidth={1.9}/></Badge>
  </button></Tooltip>
 </Popover>;
}