'use client';
import {Moon,Sun,Monitor} from 'lucide-react';
import {Tooltip,Segmented} from 'antd';
import {useTheme,type ThemeChoice} from './ThemeProvider';
export function ThemeToggle({compact=false}:{compact?:boolean}){
 const {choice,setChoice}=useTheme();
 const options=[
  {label:<span className="theme-segment"><Sun size={15}/>{compact?'': 'Light'}</span>,value:'light'},
  {label:<span className="theme-segment"><Moon size={15}/>{compact?'': 'Dark'}</span>,value:'dark'},
  {label:<span className="theme-segment"><Monitor size={15}/>{compact?'':'System'}</span>,value:'system'}
 ];
 return <div className="theme-switcher" aria-label="Appearance preference">
  <Tooltip title="Choose light, dark or system appearance">
   <Segmented size="middle" options={options} value={choice} onChange={v=>setChoice(v as ThemeChoice)}/>
  </Tooltip>
 </div>;
}