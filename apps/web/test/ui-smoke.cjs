const assert=require('node:assert/strict');
const {chromium}=require(process.env.UI_PLAYWRIGHT_ROOT+'/node_modules/playwright');
const fs=require('node:fs');
fs.mkdirSync('artifacts/ui-screenshots',{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const cases=[
  {name:'desktop-1440',width:1440,height:900,menu:false},
  {name:'laptop-1024',width:1024,height:768,menu:true},
  {name:'tablet-768',width:768,height:1024,menu:true},
  {name:'mobile-390',width:390,height:844,menu:true},
  {name:'mobile-375',width:375,height:812,menu:true},
  {name:'mobile-320',width:320,height:700,menu:true}
 ];
 for(const config of cases){
  const page=await browser.newPage({viewport:{width:config.width,height:config.height},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto('http://127.0.0.1:3000/',{waitUntil:'domcontentloaded'});
  await page.locator('.brand').first().waitFor();
  const extent=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:window.innerWidth}));
  assert.ok(extent.width<=extent.viewport+2,config.name+' horizontal overflow '+JSON.stringify(extent));
  assert.ok(await page.locator('.brand').first().isVisible(),config.name+' brand is hidden');
  assert.equal(await page.locator('.mobile-menu').isVisible(),config.menu,config.name+' wrong navigation breakpoint');
  if(config.menu){
   await page.locator('.mobile-menu').click();
   assert.ok(await page.locator('.mobile-drawer-root').evaluate(el=>el.open),config.name+' mobile drawer did not open');
   assert.ok(await page.getByRole('navigation',{name:'Mobile discovery navigation'}).getByText('Find tailors').isVisible(),config.name+' missing route');
   await page.waitForTimeout(300); // Capture the fully opened, opaque drawer after its slide animation.
   await page.screenshot({path:'artifacts/ui-screenshots/'+config.name+'-drawer.png',fullPage:false});
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('.mobile-drawer-root').evaluate(el=>el.open),false,config.name+' Escape did not close drawer');
  } else {
   assert.ok(await page.getByRole('navigation',{name:'Explore StitchMate'}).isVisible(),config.name+' desktop navigation missing');
  }
  await page.screenshot({path:'artifacts/ui-screenshots/'+config.name+'.png',fullPage:true});
  await page.evaluate(()=>localStorage.setItem('stitchmate:theme','dark'));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  assert.ok(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor!=='rgb(255, 255, 255)'),'dark mode must change base surface');
  const darkWidth=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(darkWidth<=2,config.name+' dark mode has horizontal overflow');
  await page.screenshot({path:'artifacts/ui-screenshots/'+config.name+'-dark.png',fullPage:true});
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark','theme must persist across reloads');
  await page.evaluate(()=>localStorage.setItem('stitchmate:theme','system'));
  await page.emulateMedia({colorScheme:'dark'});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  await page.emulateMedia({colorScheme:'light'});
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  console.log('PASS dark/light/system theme and preference persistence '+config.name);

  assert.equal(errors.length,0,config.name+' uncaught browser errors '+errors.join('; '));
  await page.close();
  console.log('PASS UI '+config.name+' no overflow, navigation usable');
 }
 const routePage=await browser.newPage({viewport:{width:390,height:844}});
 for(const route of ['/services','/gigs','/tailors','/orders','/tailor/dashboard','/admin','/notifications','/ai-studio']){
  const result=await routePage.goto('http://127.0.0.1:3000'+route,{waitUntil:'domcontentloaded'});
  assert.equal(result.status(),200,'HTTP '+route);
  const overflow=await routePage.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(overflow<=2,route+' horizontal overflow '+overflow);
  console.log('PASS mobile route '+route);
 }

 const authPage=await browser.newPage({viewport:{width:390,height:844}});
 let soundEnabled=false,read=false;

 await authPage.addInitScript(()=>{
  window.__toneStarts=0;
  class FakeStream{
   onmessage=null;onerror=null;
   constructor(){window.__notificationStream=this;}
   close(){}
  }
  class FakeAudio {
   currentTime=0;destination={};state='running';
   constructor(){window.__toneStarts+=1;}
   createOscillator(){return {type:'sine',frequency:{value:0},connect(){},start(){},stop(){}};}
   createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}
   close(){return Promise.resolve();}
  }
  Object.defineProperty(window,'EventSource',{value:FakeStream,configurable:true});
  Object.defineProperty(window,'AudioContext',{value:FakeAudio,configurable:true});
 });

 await authPage.route('**/api/v1/auth/me',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',name:'UI Tester',phone:'+919999999999',roles:['customer'],tailorIds:[]})}));
 await authPage.route('**/api/v1/notifications/preferences',route=>{
  if(route.request().method()==='PATCH')soundEnabled=JSON.parse(route.request().postData()||'{}').soundEnabled;
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({soundEnabled})});
 });
 await authPage.route('**/api/v1/notifications/stream',route=>route.fulfill({status:200,contentType:'text/event-stream',body:'data: {"latestId":"bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb","unreadCount":1}\n\n'}));
 await authPage.route('**/api/v1/notifications/read-all',route=>{read=true;return route.fulfill({status:200,contentType:'application/json',body:'{"success":true}'});});
 await authPage.route('**/api/v1/notifications?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[{id:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',role:'customer',type:'QUOTE',title:'New quotation received',body:'Your tailor sent you an offer.',href:'/orders/example',createdAt:new Date().toISOString(),readAt:read?new Date().toISOString():null}],nextCursor:null,unreadCount:read?0:1})}));
 await authPage.goto('http://127.0.0.1:3000/',{waitUntil:'domcontentloaded'});
 await authPage.getByRole('button',{name:/Notifications/}).waitFor();
 await authPage.getByRole('button',{name:/Notifications/}).click();
 await authPage.getByText('New quotation received').waitFor();
 await authPage.waitForTimeout(400); // Await completion of Ant Design Drawer transition before screenshot.
 assert.equal(soundEnabled,false,'notification sound must be off by default');
 await authPage.evaluate(()=>{
  window.__notificationStream?.onmessage?.({data:JSON.stringify({latestId:'cccccccc-cccc-4ccc-cccc-cccccccccccc',unreadCount:2})});
 });
 assert.equal(await authPage.evaluate(()=>window.__toneStarts),0,'muted notifications must never play audio');

 await authPage.getByRole('switch',{name:'Enable notification sound'}).click();
 assert.equal(soundEnabled,true,'sound preference toggle must invoke persistent backend');
 await authPage.evaluate(()=>{
  window.__notificationStream?.onmessage?.({data:JSON.stringify({latestId:'dddddddd-dddd-4ddd-dddd-dddddddddddd',unreadCount:3})});
 });
 assert.equal(await authPage.evaluate(()=>window.__toneStarts),1,'first genuinely new opt-in alert plays a chime');
 await authPage.evaluate(()=>{
  window.__notificationStream?.onmessage?.({data:JSON.stringify({latestId:'dddddddd-dddd-4ddd-dddd-dddddddddddd',unreadCount:3})});
 });
 assert.equal(await authPage.evaluate(()=>window.__toneStarts),1,'duplicate SSE notifications must not replay audio');
 console.log('PASS notification sound muted on init, opt-in on new events and deduplicated on replay');

 await authPage.screenshot({path:'artifacts/ui-screenshots/mobile-notifications-light.png',fullPage:false});
 await authPage.getByRole('button',{name:'Mark all notifications read'}).click();
 assert.equal(read,true);
 console.log('PASS authenticated notification panel, user-specific list, sound default and read-all action');
 await authPage.close();


 const userId='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
 const conversationId='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
 const gigId='cccccccc-cccc-4ccc-cccc-cccccccccccc';
 const tailorId='dddddddd-dddd-4ddd-dddd-dddddddddddd';
 const categoryId='eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee';
 const aiReq={garmentType:'Blouse',serviceType:'CUSTOM_STITCHING',occasion:'Wedding',budgetMax:2000,preferredDeliveryDays:7,pincode:'110086',
  design:{neckline:'Square neck',sleeveType:'Full sleeves',embroidery:'Light embroidery',color:'Blue',silhouette:'Fitted'},
  additionalInstructions:'Stitch a fitted blouse with full sleeves',missingInformation:['measurements'],uncertainty:[]};
 const gig={id:gigId,slug:'sample-blouse',title:'Custom wedding blouse stitching',description:'Demo fixture based on a published gig',categoryId,serviceType:'CUSTOM_STITCHING',
  tailor:{id:tailorId,slug:'test-tailor',shopName:'Approved test tailor'},rating:4.5,reviewCount:2,
  packages:[{tier:'BASIC',title:'Stitching',pricePaise:'120000',deliveryDays:6,revisions:1}]};
 for(const viewport of [{name:'mobile',width:390,height:844},{name:'desktop',width:1440,height:900}]){
  const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height}});
  const runtimeErrors=[];page.on('pageerror',err=>runtimeErrors.push(err.message));
  await page.route('**/api/v1/auth/me',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:userId,name:'Copilot Demo User',phone:'+919999999999',roles:['customer'],tailorIds:[]})}));
  await page.route('**/api/v1/ai/config',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:true,maxImages:3,maxImageBytes:5242880,dailyLimit:30})}));
  await page.route('**/api/v1/ai/conversations',route=>route.fulfill({status:route.request().method()==='POST'?201:200,contentType:'application/json',
   body:JSON.stringify(route.request().method()==='POST'?{id:conversationId,title:'New tailoring idea',createdAt:new Date().toISOString()}:[])}));
  await page.route('**/api/v1/ai/conversations/'+conversationId,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   id:conversationId,title:'New tailoring idea',requirements:aiReq,referenceImageIds:[],brief:null,confirmedAt:null,messages:[]
  })}));
  await page.route('**/api/v1/ai/conversations/'+conversationId+'/messages',route=>route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({
   enabled:true,reply:'I found a real published blouse gig for your budget.',requirements:aiReq,recommendations:[gig],conversationId
  })}));
  await page.route('**/api/v1/ai/matches',route=>route.fulfill({status:201,contentType:'application/json',body:JSON.stringify([gig])}));
  await page.goto('http://127.0.0.1:3000/ai-studio',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:/Start a new conversation/}).click();
  await page.getByRole('textbox',{name:'Your tailoring request'}).fill('I need a wedding blouse under 2000');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText('Custom wedding blouse stitching').waitFor();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(overflow<=2,'AI studio '+viewport.name+' horizontal overflow '+overflow);
  await page.screenshot({path:'artifacts/ui-screenshots/ai-studio-'+viewport.name+'-light.png',fullPage:true});
  await page.evaluate(()=>localStorage.setItem('stitchmate:theme','dark'));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  await page.screenshot({path:'artifacts/ui-screenshots/ai-studio-'+viewport.name+'-dark.png',fullPage:true});
  const darkOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(darkOverflow<=2,'AI studio dark overflow');
  assert.equal(runtimeErrors.length,0,'AI studio browser errors '+runtimeErrors.join('; '));
  console.log('PASS AI Studio '+viewport.name+' light/dark render and interaction');
  await page.close();
 }

 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
