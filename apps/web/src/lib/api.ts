export const API=process.env.NEXT_PUBLIC_API_URL??'http://localhost:4000/api/v1';
export type RecordAny=Record<string,unknown>;
export async function api<T=any>(path:string,options:RequestInit={}):Promise<T>{
 const response=await fetch(`${API}${path}`,{...options,credentials:'include',cache:'no-store',headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
 const data=await response.json().catch(()=>null);
 if(!response.ok){const err=Array.isArray(data?.error?.message)?data.error.message.join(', '):data?.error?.message;throw new Error(err||data?.message||`Request failed (${response.status})`);}
 return data as T;
}
export const post=<T=any>(path:string,body:unknown={},headers?:HeadersInit)=>api<T>(path,{method:'POST',body:JSON.stringify(body),headers});
export function money(paise:string|number|bigint|undefined|null){if(paise===undefined||paise===null)return '—';const v=Number(paise)/100;return `₹${v.toLocaleString('en-IN',{maximumFractionDigits:2,minimumFractionDigits:0})}`;}
export function dateTime(s:string|undefined|null){return s?new Date(s).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}):'—';}
export function textStatus(status:string){return status.replaceAll('_',' ').toLowerCase().replace(/^./,s=>s.toUpperCase());}
export async function upload(file:File,purpose:'DESIGN'|'BEFORE'|'AFTER'|'HANDOFF'|'QC'|'DOCUMENT'){
 const pre=await post<{fileId:string;url:string;headers:Record<string,string>}>('/uploads/presign',{name:file.name,mimeType:file.type,sizeBytes:file.size,purpose});
 const put=await fetch(pre.url,{method:'PUT',body:file,headers:pre.headers});if(!put.ok)throw new Error('File upload failed');
 await post(`/uploads/${pre.fileId}/complete`);return pre.fileId;
}
