/** An original, restrained two-tone chime. No external audio asset or playback library. */
export function playNotificationChime(){
 if(typeof window==='undefined'||document.visibilityState!=='visible')return;
 // Browser autoplay policy: no sound until a real user gesture has happened.
 if(!navigator.userActivation?.hasBeenActive)return;
 const Ctx=window.AudioContext;
 if(!Ctx)return;
 try{
  const audio=new Ctx();
  if(audio.state==='suspended'){void audio.close();return;}
  const start=audio.currentTime;
  for(const [frequency,offset] of [[660,0],[880,0.085]] as const){
   const oscillator=audio.createOscillator();
   const gain=audio.createGain();
   oscillator.type='sine';oscillator.frequency.value=frequency;
   gain.gain.setValueAtTime(0.0001,start+offset);
   gain.gain.exponentialRampToValueAtTime(0.025,start+offset+0.012);
   gain.gain.exponentialRampToValueAtTime(0.0001,start+offset+0.17);
   oscillator.connect(gain);gain.connect(audio.destination);
   oscillator.start(start+offset);oscillator.stop(start+offset+0.18);
  }
  window.setTimeout(()=>{void audio.close();},550);
 }catch{/* Sound is optional; leave notifications functional if audio is blocked. */}
}