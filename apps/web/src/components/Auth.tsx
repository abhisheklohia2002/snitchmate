'use client';
import {createContext,useContext,useEffect,useState, type ReactNode} from 'react';
import Link from 'next/link';
import {Input,Button} from 'antd';
import {useRouter} from 'next/navigation';
import {api,post} from '@/lib/api';
type User={id:string;name:string|null;phone:string;roles:string[];tailorIds:string[]};
type AuthCtx={user:User|null;loading:boolean;refresh:()=>Promise<void>};
const AuthContext=createContext<AuthCtx>({user:null,loading:true,refresh:async()=>{}});
export function AuthProvider({children}:{children:ReactNode}){const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true);async function refresh(){try{setUser(await api<User>('/auth/me'));}catch{setUser(null);}finally{setLoading(false);}}useEffect(()=>{refresh();},[]);return <AuthContext.Provider value={{user,loading,refresh}}>{children}</AuthContext.Provider>}
export const useAuth=()=>useContext(AuthContext);
export function RequireAuth({children}:{children:ReactNode}){const {user,loading}=useAuth();if(loading)return <div className="notice">Checking your session…</div>;if(!user)return <div className="card centered"><h2>Sign in to continue</h2><p>Your orders, photos and measurements are private.</p><Link className="btn" href="/login">Sign in with OTP</Link></div>;return <>{children}</>}
export function LoginPanel(){const {user,refresh}=useAuth();const router=useRouter();const [phone,setPhone]=useState('+91'),[otp,setOtp]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 if(user)return <div className="card centered"><h2>You are signed in</h2><p>{user.phone}</p><Link href="/orders" className="btn">View your orders</Link></div>;
 async function act(){setBusy(true);setErr('');try{if(!sent){await post('/auth/otp/request',{phone});setSent(true);}else{await post('/auth/otp/verify',{phone,otp});await refresh();router.push('/profile');}}catch(e){setErr((e as Error).message);}finally{setBusy(false);}}
 return <div className="card form-card"><span className="eyebrow">Secure sign in</span><h2>Welcome to StitchMate</h2><p>{process.env.NEXT_PUBLIC_OTP_CHANNEL==='whatsapp'?'We will send a one-time verification code to your WhatsApp number.':'We will send a one-time verification code to your mobile number.'}</p><label>Mobile number (with country code)<Input size="large" type="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} disabled={sent} placeholder="+919876543210"/></label>{sent&&<label>6-digit OTP<Input size="large" value={otp} maxLength={6} inputMode="numeric" autoComplete="one-time-code" onChange={e=>setOtp(e.target.value.replace(/\D/g,''))}/></label>}<Button type="primary" size="large" block loading={busy} disabled={busy} onClick={act}>{sent?'Verify & continue':'Send OTP'}</Button>{sent&&<button className="link-button" onClick={()=>{setSent(false);setOtp('');}}>Change phone number</button>}{err&&<p className="error" role="alert">{err}</p>}</div>
}
