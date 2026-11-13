'use client';
import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import {App as AntApp,ConfigProvider,theme as antTheme} from 'antd';
import type {ThemeConfig} from 'antd';

export type ThemeChoice='light'|'dark'|'system';
type ThemeContextValue={choice:ThemeChoice;resolved:'light'|'dark';setChoice:(choice:ThemeChoice)=>void};
const Context=createContext<ThemeContextValue|undefined>(undefined);
const key='stitchmate-theme-preference';
function stored():ThemeChoice{
 try{const val=window.localStorage.getItem(key);return val==='light'||val==='dark'?val:'system';}
 catch{return 'system';}
}
function systemDark(){return typeof window!=='undefined'&&window.matchMedia('(prefers-color-scheme: dark)').matches;}
export function ThemeProvider({children}:{children:ReactNode}){
 const [choice,setSelected]=useState<ThemeChoice>('system');
 const [darkSystem,setDarkSystem]=useState(false);
 useEffect(()=>{
  setSelected(stored());
  const media=window.matchMedia('(prefers-color-scheme: dark)');
  setDarkSystem(media.matches);
  const listener=(e:MediaQueryListEvent)=>setDarkSystem(e.matches);
  media.addEventListener('change',listener);
  return()=>media.removeEventListener('change',listener);
 },[]);
 const resolved=choice==='system'?(darkSystem?'dark':'light'):choice;
 useEffect(()=>{
  const active=choice==='system'?(systemDark()?'dark':'light'):choice;
  document.documentElement.dataset.theme=active;
  document.documentElement.style.colorScheme=active;
 },[choice,darkSystem]);
 const setChoice=useCallback((value:ThemeChoice)=>{
  setSelected(value);
  try{window.localStorage.setItem(key,value);}catch{}
  const active=value==='system'?(systemDark()?'dark':'light'):value;
  document.documentElement.dataset.theme=active;
  document.documentElement.style.colorScheme=active;
 },[]);
 const token=useMemo<ThemeConfig>(()=>({
  algorithm:resolved==='dark'?antTheme.darkAlgorithm:antTheme.defaultAlgorithm,
  token:{
   colorPrimary:resolved==='dark'?'#80bca2':'#173e35',
   colorInfo:resolved==='dark'?'#80bca2':'#173e35',
   colorLink:resolved==='dark'?'#80bca2':'#173e35',
   colorBgBase:resolved==='dark'?'#182923':'#ffffff',
   colorTextBase:resolved==='dark'?'#e5f1e9':'#243c35',
   colorBorder:resolved==='dark'?'#405c4b':'#d9e3db',
   colorSuccess:'#40936b',
   colorWarning:'#b98237',
   colorError:'#ce5c55',
   borderRadius:11,
   fontFamily:"'DM Sans', Arial, sans-serif",
   fontSize:14,
   controlHeight:44,
   motionDurationMid:'0.2s'
  },
  components:{
   Button:{borderRadius:11,controlHeight:44},
   Input:{activeShadow:'0 0 0 3px rgba(70,136,102,.14)'},
   Popover:{borderRadiusLG:15},
   Modal:{borderRadiusLG:18},
   Select:{optionSelectedBg:resolved==='dark'?'#244438':'#eaf3ec'}
  }
 }),[resolved]);
 const ctx=useMemo(()=>({choice,resolved,setChoice}),[choice,resolved,setChoice]);
 return <Context.Provider value={ctx}><ConfigProvider theme={token} componentSize="large"><AntApp>{children}</AntApp></ConfigProvider></Context.Provider>;
}
export function useTheme(){const ctx=useContext(Context);if(!ctx)throw new Error('ThemeProvider missing');return ctx;}
export const themeBootScript="(function(){try{var choice=localStorage.getItem('stitchmate-theme-preference');var dark=choice==='dark'||(choice!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();";
