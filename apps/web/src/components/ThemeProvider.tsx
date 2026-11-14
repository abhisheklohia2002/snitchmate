'use client';
import {ConfigProvider,App as AntdApp,theme as antTheme} from 'antd';
import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';

export type ThemeChoice='light'|'dark'|'system';
type ThemeContextValue={choice:ThemeChoice;resolved:'light'|'dark';setChoice:(choice:ThemeChoice)=>void};
const ThemeContext=createContext<ThemeContextValue>({choice:'system',resolved:'light',setChoice:()=>{}});
export const useStitchTheme=()=>useContext(ThemeContext);
const STORAGE='stitchmate:theme';

export function StitchThemeProvider({children}:{children:ReactNode}){
 const [choice,setChoiceState]=useState<ThemeChoice>('system');
 const [systemDark,setSystemDark]=useState(false);
 useEffect(()=>{
  const saved=window.localStorage.getItem(STORAGE);
  if(saved==='light'||saved==='dark'||saved==='system')setChoiceState(saved);
  const query=window.matchMedia('(prefers-color-scheme: dark)');
  const sync=()=>setSystemDark(query.matches);
  sync();query.addEventListener('change',sync);
  return ()=>query.removeEventListener('change',sync);
 },[]);
 const resolved=choice==='system'?(systemDark?'dark':'light'):choice;
 const setChoice=(next:ThemeChoice)=>{
  setChoiceState(next);window.localStorage.setItem(STORAGE,next);
 };
 useEffect(()=>{document.documentElement.dataset.theme=resolved;document.documentElement.style.colorScheme=resolved;},[resolved]);
 const config=useMemo(()=>({
  algorithm:resolved==='dark'?antTheme.darkAlgorithm:antTheme.defaultAlgorithm,
  token:{
   colorPrimary:resolved==='dark'?'#86c8a6':'#173e35',
   colorInfo:resolved==='dark'?'#86c8a6':'#173e35',
   colorBgBase:resolved==='dark'?'#151f1c':'#ffffff',
   colorTextBase:resolved==='dark'?'#edf4ef':'#243c35',
   colorBorder:resolved==='dark'?'#3b4e43':'#d9dfd7',
   borderRadius:11,borderRadiusLG:18,controlHeight:44,
   fontFamily:"'DM Sans', Arial, sans-serif"
  },
  components:{
   Button:{controlHeight:44,fontWeight:700},
   Input:{controlHeight:44},
   Select:{controlHeight:44},
   Popover:{zIndexPopupBase:160},
   Modal:{zIndexPopupBase:180}
  }
 }),[resolved]);
 return <ThemeContext.Provider value={{choice,resolved,setChoice}}>
  <ConfigProvider theme={config}><AntdApp>{children}</AntdApp></ConfigProvider>
 </ThemeContext.Provider>;
}