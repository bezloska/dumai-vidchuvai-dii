const {chromium}=require('playwright');
const http=require('node:http');
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
 const filename=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 const stream=fs.createReadStream(filename);
 stream.on('error',()=>{res.writeHead(404);res.end()});
 stream.on('open',()=>{res.setHeader('Content-Type',mime[path.extname(filename)]||'application/octet-stream');stream.pipe(res)});
});
const assert=require('node:assert/strict');
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
 const p=await b.newPage({viewport:{width:1536,height:1024}});
 const errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
 await p.addInitScript(()=>{
  window.forcedDraws=[];
  const original=crypto.getRandomValues.bind(crypto);
  crypto.getRandomValues=a=>{if(a instanceof Uint32Array && a.length===1 && window.forcedDraws.length){a[0]=window.forcedDraws.shift();return a;}return original(a)};
 });
 await p.goto(base);
 await p.waitForFunction(()=>document.querySelector('.scene').dataset.state!=='loading',{},{timeout:45000});
 assert.equal(await p.locator('.scene').getAttribute('data-state'),'idle',await p.locator('#game-status').innerText());
 await p.evaluate(()=>document.images[0].decode());
 // Internal visual inspection only; verification continues against the working app.

 console.log('Ready',await p.evaluate(async()=> (await import('/game.js')).getGameState()));
 const logs=[]; let prev=null;
 for(let i=0;i<12;i++) {
  await p.locator('#roll').click();
  assert.equal(await p.locator('#roll').isDisabled(),true);
  assert.equal(await p.locator('#result').getAttribute('aria-busy'),'true');
  if(i===0) await p.waitForFunction(async()=>{const s=(await import('/game.js')).getGameState();return s.visibleFaces.every(f=>f.height>0)});
  await p.locator('#roll').evaluate(e=>{e.click();e.click();});
  await p.waitForFunction(()=>document.querySelector('.scene').dataset.state!=='rolling',{},{timeout:15000});
  const s=await p.evaluate(async()=> (await import('/game.js')).getGameState());
  assert.equal(s.state,'idle');assert.equal(s.completedRolls,i+1);
  assert.equal(await p.locator('#roll').isEnabled(),true);
  assert.equal(s.visibleFaces[0].value,String(s.result.number));
  assert.equal(s.visibleFaces[1].value,s.result.sign);
  assert.ok(s.visibleFaces.every(f=>f.alignment>.999));
  assert.equal(await p.locator('.result-copy strong').innerText(),String(s.result.number));
  assert.equal(await p.locator('.result-sign').innerText(),s.result.sign);
  const word=s.result.number===1?'крок':s.result.number<=4?'кроки':'кроків';
  assert.ok((await p.locator('.result-copy').textContent()).endsWith(word));
  const pair=`${s.result.number}${s.result.sign}`;
  assert.notEqual(pair,prev);prev=pair;logs.push(pair);
 }
 await p.emulateMedia({reducedMotion:'reduce'});
 // All six numeric faces and both signs must be physically uppermost.
 for(let n=1;n<=6;n++) {
  const before=await p.evaluate(async()=> (await import('/game.js')).getGameState());
  const order=n===1&&before.result.number===1&&before.result.sign==='+'?[1,0]:[0,1];
  for(const sign of order) {
   await p.evaluate(([n,sign])=>{window.forcedDraws=[n-1,sign]},[n,sign]);
   await p.locator('#roll').click();
   await p.waitForFunction(()=>document.querySelector('.scene').dataset.state==='idle');
   const s=await p.evaluate(async()=> (await import('/game.js')).getGameState());
   assert.equal(s.result.number,n);assert.equal(s.result.sign,sign?'−':'+');
   assert.equal(s.visibleFaces[0].value,String(n));
   assert.equal(s.visibleFaces[1].value,sign?'−':'+');
   assert.ok(s.visibleFaces.every(f=>f.alignment>.999&&f.height===0));
   const expectedWord=n===1?'крок':n<=4?'кроки':'кроків';
   assert.ok((await p.locator('.result-copy').textContent()).endsWith(expectedWord));
  }
 }
 // Reject the same sign on all three equivalent physical faces.
 await p.evaluate(()=>{window.forcedDraws=[1,0]});await p.locator('#roll').click();
 await p.waitForFunction(()=>document.querySelector('.scene').dataset.state==='idle');
 await p.evaluate(()=>{window.forcedDraws=[1,2,1,4,1,0,2,1]});await p.locator('#roll').click();
 await p.waitForFunction(()=>document.querySelector('.scene').dataset.state==='idle');
 assert.equal(await p.evaluate(()=>window.forcedDraws.length),0);
 assert.equal(await p.locator('.result-copy strong').innerText(),'3');
 assert.equal(await p.locator('.result-sign').innerText(),'−');
 for(const width of [320,390,600,768,1536]) {
  await p.setViewportSize({width,height:844});
  await p.waitForTimeout(100);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(width<=600) {
   const bounds=await p.locator('#roll').boundingBox();assert.ok(bounds.height>=44);
   await p.locator('#roll').click();
   await p.waitForFunction(()=>document.querySelector('.scene').dataset.state==='idle');
   assert.equal(await p.locator('#roll').isEnabled(),true);
  }
 }
 assert.equal(await p.locator('.has-3d .number-die').isVisible(),false);
 assert.equal(await p.locator('canvas').count(),1);
 assert.deepEqual(errors,[]);
 console.log('PASS: 12 sequential animated rolls',logs.join(', '));
 console.log('PASS: physical top-face orientations match result, grammar, button lock and double click guard, 12 forced outcomes, equivalent sign repeat rejection, reduced motion, 5 viewports and mobile rolls; zero resource/runtime errors.');
 // The downloadable game must also work from disk with networking disabled.
 const offline=await b.newContext({reducedMotion:'reduce'});
 const local=await offline.newPage();
 const external=[];
 local.on('request',r=>{if(/^https?:/.test(r.url())&&r.url()!==base+'/play.html')external.push(r.url())});
 local.on('pageerror',e=>errors.push(e.message));
 await local.goto(base+'/play.html');
 await local.waitForFunction(()=>document.querySelector('.scene').dataset.state!=='loading',{},{timeout:45000});
 assert.equal(await local.locator('.scene').getAttribute('data-state'),'idle');
 await offline.setOffline(true);
 for(let i=0;i<3;i++) {
  await local.locator('#roll').click();
  await local.waitForFunction(()=>document.querySelector('.scene').dataset.state==='idle');
  const number=await local.locator('.result-copy strong').innerText();
  assert.equal(await local.locator('#number-label').innerText(),'Числовий кубик: '+number);
 }
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 console.log('PASS: standalone play.html loaded as a single HTTP document, no subresource requests, 3 rolls with all networking disabled.');
 await b.close(); await new Promise(resolve=>server.close(resolve));
})().catch(e=>{console.error(e);process.exit(1)});
