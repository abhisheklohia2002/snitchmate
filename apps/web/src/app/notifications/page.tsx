'use client';
import Link from 'next/link';
import {Badge,Button,Empty,List,Pagination,Switch,Typography} from 'antd';
import {Bell,Check,CheckCheck,Volume2,VolumeX} from 'lucide-react';
import {RequireAuth} from '@/components/Auth';
import {useNotifications} from '@/components/NotificationProvider';
import {PageTitle} from '@/components/Shared';
import {dateTime} from '@/lib/api';
export default function NotificationsPage(){return <RequireAuth><Screen/></RequireAuth>}
function Screen(){
 const {items,total,page,unreadCount,loading,error,soundEnabled,enableSound,read,readAll,goToPage}=useNotifications();
 return <div className="container notifications-page">
  <PageTitle eyebrow="Your StitchMate" title="Notifications" lead="Your own order, tailoring, delivery and account updates in one secure inbox."/>
  <div className="card notification-settings-card">
   <div><h3>Notification preferences</h3><p>Notification sound is off until you choose to enable it.</p></div>
   <label className="notification-sound-toggle"><span>{soundEnabled?<Volume2 size={18}/>:<VolumeX size={18}/>} Sound alerts</span><Switch checked={soundEnabled} onChange={enableSound} aria-label="Toggle notification sound"/></label>
  </div>
  <section className="card notifications-feed">
   <div className="notification-top"><div><h3>Inbox <Badge count={unreadCount} overflowCount={99}/></h3><p>{total} total notifications</p></div>
    <Button disabled={!unreadCount} icon={<CheckCheck size={16}/>} onClick={()=>void readAll()}>Mark all read</Button>
   </div>
   {error&&<p role="alert" className="error">Could not refresh notifications: {error}</p>}
   <List dataSource={items} loading={loading}
    locale={{emptyText:<Empty description="No notifications yet"/>}}
    renderItem={item=><List.Item key={item.id} className={'notification-feed-row'+(!item.readAt?' unread':'')}>
     <div className="notification-feed-main">
      <div className="notification-item-heading">{!item.readAt&&<span className="notification-unread-dot" aria-label="Unread"/>}<strong>{item.title}</strong></div>
      <Typography.Paragraph>{item.body}</Typography.Paragraph>
      <span className="small-note">{dateTime(item.createdAt)}</span>
     </div>
     <div className="notification-feed-actions">
      {item.href&&<Link className="text-link" href={item.href} onClick={()=>{if(!item.readAt)void read(item.id);}}>View details</Link>}
      {!item.readAt&&<Button size="small" icon={<Check size={14}/>} onClick={()=>void read(item.id)}>Mark read</Button>}
     </div>
    </List.Item>}/>
   {total>15&&<Pagination simple current={page} pageSize={15} total={total} onChange={goToPage} className="notification-pagination"/>}
  </section>
 </div>;
}