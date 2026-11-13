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
  assert.equal(errors.length,0,config.name+' uncaught browser errors '+errors.join('; '));
  await page.close();
  console.log('PASS UI '+config.name+' no overflow, navigation usable');
 }
 const routePage=await browser.newPage({viewport:{width:390,height:844}});
 for(const route of ['/services','/gigs','/tailors','/orders','/tailor/dashboard','/admin']){
  const result=await routePage.goto('http://127.0.0.1:3000'+route,{waitUntil:'domcontentloaded'});
  assert.equal(result.status(),200,'HTTP '+route);
  const overflow=await routePage.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(overflow<=2,route+' horizontal overflow '+overflow);
  console.log('PASS mobile route '+route);
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
