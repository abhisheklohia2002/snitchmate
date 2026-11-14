'use client';
import {Button,Dropdown,Segmented,Tooltip} from 'antd';
import {Monitor,Moon,Sun} from 'lucide-react';
import {useStitchTheme,type ThemeChoice} from './ThemeProvider';

const labels:{key:ThemeChoice;label:string}[]=[
 {key:'light',label:'Light mode'},
 {key:'dark',label:'Dark mode'},
 {key:'system',label:'System preference'}
];
export function ThemeToggle({mobile=false}:{mobile?:boolean}){
 const {choice,resolved,setChoice}=useStitchTheme();
 if(mobile)return <div className="theme-mobile-setting">
  <span className="mobile-nav-label">Appearance</span>
  <Segmented block value={choice} onChange={value=>setChoice(value as ThemeChoice)}
   options={[{value:'light',label:'Light',icon:<Sun size={15}/>},{value:'dark',label:'Dark',icon:<Moon size={15}/>},{value:'system',label:'System',icon:<Monitor size={15}/>}]} />
 </div>;
 return <Dropdown trigger={['click']} placement="bottomRight" menu={{
  selectable:true,selectedKeys:[choice],
  items:labels.map(x=>({key:x.key,label:x.label,onClick:()=>setChoice(x.key)}))
 }}>
  <Tooltip title={'Appearance: '+labels.find(x=>x.key===choice)?.label}>
   <Button type="text" className="header-utility-button" aria-label="Change color theme"
    icon={resolved==='dark'?<Moon size={19}/>:<Sun size={19}/>}/>
  </Tooltip>
 </Dropdown>;
}