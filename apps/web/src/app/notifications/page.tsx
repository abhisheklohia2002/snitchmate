'use client';
import {Button,Empty,Spin,Switch} from 'antd';
import {Bell,CheckCheck,Volume2} from 'lucide-react';
import {RequireAuth} from '@/components/Auth';
import {useNotifications} from '@/components/NotificationProvider';
import {NotificationItem} from '@/components/NotificationBell';
import {PageTitle} from '@/components/Shared';
export default function NotificationsPage(){return <RequireAuth><NotificationsScreen/></RequireAuth>}
function NotificationsScreen(){
 const {items,loading,error,hasMore,loadMore,unreadCount,soundEnabled,setSound,markAllRead}=useNotifications();
 return <div className="container notifications-page">
  <PageTitle eyebrow="Your updates" title="Notification center" lead="Track your tailoring orders, requests and verified delivery events in one place."/>
  <div className="notification-page-toolbar card">
   <span><Bell size={19}/> {unreadCount} unread updates</span>
   <div><label className="notification-sound-label"><Volume2 size={18}/> Sound <Switch checked={soundEnabled} size="small" onChange={value=>void setSound(value)}/></label>
    <Button type="default" icon={<CheckCheck size={17}/>} onClick={()=>void markAllRead()} disabled={!unreadCount}>Mark all read</Button></div>
  </div>
  <div className="notification-page-list card" aria-live="polite">
   {items.length?items.map(item=><NotificationItem key={item.id} item={item}/>):loading?<Spin/>:<Empty description="No notifications yet"/>}
   {error&&<p className="error" role="alert">{error}</p>}
   {hasMore&&<Button block onClick={()=>void loadMore()}>Load earlier notifications</Button>}
  </div>
 </div>;
}