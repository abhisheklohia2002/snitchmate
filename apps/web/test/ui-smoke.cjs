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
 for(const route of ['/services','/gigs','/tailors','/orders','/tailor/dashboard','/admin','/notifications']){
  const result=await routePage.goto('http://127.0.0.1:3000'+route,{waitUntil:'domcontentloaded'});
  assert.equal(result.status(),200,'HTTP '+route);
  const overflow=await routePage.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(overflow<=2,route+' horizontal overflow '+overflow);
  console.log('PASS mobile route '+route);
 }

 const authPage=await browser.newPage({viewport:{width:390,height:844}});
 let soundEnabled=false,read=false;
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
 await authPage.getByRole('switch',{name:'Enable notification sound'}).click();
 assert.equal(soundEnabled,true,'sound preference toggle must invoke persistent backend');
 await authPage.screenshot({path:'artifacts/ui-screenshots/mobile-notifications-light.png',fullPage:false});
 await authPage.getByRole('button',{name:'Mark all notifications read'}).click();
 assert.equal(read,true);
 console.log('PASS authenticated notification panel, user-specific list, sound default and read-all action');
 await authPage.close();

 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
