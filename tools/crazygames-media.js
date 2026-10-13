// Covers + preview videos for CrazyGames, captured from the built game (run crazygames-build.js first) in Microsoft Edge.
// Needs puppeteer-core:  npm i --no-save puppeteer-core@23   then   node tools/crazygames-media.js covers   and   node tools/crazygames-media.js video
// The video run opens a visible Edge window for about a minute (a hidden window would slow the animation down).
const puppeteer = require('puppeteer-core'), http = require('http'), fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'crazygames-release'), GAME = path.join(OUT, 'game'), WORK = path.join(OUT, '.capture');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const MODE = process.argv[2] || 'covers';
const types = {'.html':'text/html; charset=utf-8', '.js':'application/javascript'};
const srv = http.createServer((q, s)=>{ const f = path.join(GAME, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); if(!fs.existsSync(f)){ s.writeHead(404); s.end(); return; } s.writeHead(200, {'Content-Type': types[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(s); }).listen(8790);
const sleep = ms=>new Promise(r=>setTimeout(r, ms));

const TITLE_CSS = `#hud,#dock,#toasts,#sheet,#roomBar,#updBar,#pauseBar,#karaoke{display:none!important}
#cgTitle{position:fixed;left:0;right:0;top:6%;text-align:center;z-index:50;pointer-events:none;font-family:"PingFang SC","Microsoft YaHei UI","Microsoft YaHei",sans-serif;transition:opacity .6s}
#cgTitle b{display:inline-block;font-weight:900;color:#FF6F86;font-size:calc(var(--k)*1px);letter-spacing:.06em;transform:rotate(-3deg);text-shadow:var(--ol)}
#cgTitle small{display:block;margin-top:calc(var(--k)*.1px);font-weight:900;font-size:calc(var(--k)*.3px);color:#FFFFFF;letter-spacing:.25em;text-shadow:var(--ol2)}`;

async function setup(page, W, H){
  await page.setViewport({width:W, height:H, deviceScaleFactor:1});
  await page.goto('http://localhost:8790/?debug', {waitUntil:'load'}); await sleep(1500);
  // the same island every time, so the covers and the videos match
  const FIX = path.join(__dirname, 'crazygames-island.json');
  if(!fs.existsSync(FIX)){ await page.evaluate(()=>{ localStorage.removeItem('xx_save'); }); await page.reload({waitUntil:'load'}); await sleep(1500); fs.writeFileSync(FIX, await page.evaluate(()=>{ const I = window.__isle; return JSON.stringify(Object.assign({}, I.S, {residents:I.residents.map(r=>r.d)})); })); }
  await page.evaluate(j=>{ localStorage.setItem('xx_save', j); }, fs.readFileSync(FIX, 'utf8')); await page.reload({waitUntil:'load'}); await sleep(2500);
  await page.evaluate((css)=>{
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    window.__drawTitle = (g, W, H, alpha)=>{
      const k = Math.round(Math.min(W, H*1.1)*.16), F = '"Microsoft YaHei UI","Microsoft YaHei","PingFang SC",sans-serif';
      g.save(); g.globalAlpha = alpha; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.translate(W/2, H*(H > W ? .1 : .14)); g.rotate(-3*Math.PI/180);
      g.font = '900 ' + k + 'px ' + F;
      g.fillStyle = 'rgba(59,51,85,.35)'; g.fillText('心心小岛', 0, k*.16);
      g.lineWidth = k*.2; g.strokeStyle = '#3B3355'; g.strokeText('心心小岛', 0, k*.08);
      g.lineWidth = k*.14; g.strokeStyle = '#FFFFFF'; g.strokeText('心心小岛', 0, 0);
      g.fillStyle = '#FF6F86'; g.fillText('心心小岛', 0, 0);
      g.rotate(3*Math.PI/180); g.font = '900 ' + Math.round(k*.3) + 'px ' + F;
      if(g.letterSpacing !== undefined) g.letterSpacing = Math.round(k*.06) + 'px';
      g.lineWidth = k*.07; g.strokeStyle = '#3B3355'; g.strokeText('HEART ISLAND', 0, k*.78); g.fillStyle = '#FFFFFF'; g.fillText('HEART ISLAND', 0, k*.78);
      g.restore(); };
    const cv = document.createElement('canvas'); cv.id = 'cgTitle'; cv.width = innerWidth; cv.height = innerHeight; cv.style.cssText = 'position:fixed;inset:0;z-index:50;pointer-events:none;width:100%;height:100%';
    document.body.appendChild(cv); window.__drawTitle(cv.getContext('2d'), cv.width, cv.height, 1);
    document.querySelector('#modalRoot').innerHTML = '';
  }, TITLE_CSS);
}
// gather everyone around the fountain, smiling at the camera
async function stage(page, W, H){
  await page.evaluate((W, H)=>{
    const I = window.__isle; I.S.hour = 10.5; I.S.weather = {day:I.S.day, kind:'sunny'};
    const C = {x:0, z:7.2}, rs = I.residents.filter(r=>!r.d.kid).slice(0, 6);
    I.residents.forEach(r=>{ if(r.holHat && r.holHat.parent) r.holHat.parent.remove(r.holHat); r.holHat = null; });
    const YAW = .22; I.cam.yaw = YAW; I.cam.yawGoal = null; I.cam.pitch = H > W ? .32 : .26; I.cam.pitchGoal = null; I.cam.dist = H > W ? 13.5 : 10.5; I.cam.distGoal = null;
    I.cam.goal.set(C.x + Math.sin(YAW)*2.6, H > W ? 2.4 : 2.0, C.z + Math.cos(YAW)*2.6); I.cam.target.copy(I.cam.goal);
    rs.forEach((r, i)=>{ const n = rs.length, a = (i - (n-1)/2) * (H > W ? .5 : .42); r.state = 'script'; r.dest = null; r.p.root.visible = true;
      const px = Math.sin(a)*3.4, pz = 3.0 + Math.cos(a)*1.2 - (i%2)*.7; r.p.root.position.set(C.x + px*Math.cos(YAW) + pz*Math.sin(YAW), 0, C.z - px*Math.sin(YAW) + pz*Math.cos(YAW)); r.p.root.rotation.y = YAW; r.pose = i%2 ? 'happy' : null; r.facePos = null; r.face = null; r.scriptBubble = ['💖','🎵','✨','😆','🌸','🍰'][i]; });
  }, W, H);
  for(let i=0;i<40;i++){ await page.evaluate(()=>window.__isle.loopStep(.03)); }
  await page.evaluate(()=>{ window.__isle.scene.traverse(o=>{ if(o.isSprite){ o.layers.set(1); } }); window.__isle.loopStep(.01); });
}

(async ()=>{
  const port = MODE==='covers' ? 9333 : 9334;
  require('child_process').spawn(EDGE, [...(MODE==='covers' ? ['--headless=new'] : []), '--remote-debugging-port=' + port, '--user-data-dir=' + WORK, '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--window-size=1300,900', 'about:blank'], {detached:true, stdio:'ignore'}).unref();
  await sleep(3000);
  const browser = await puppeteer.connect({browserURL:'http://127.0.0.1:' + port, defaultViewport:null});
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e=>errs.push(e.message)); page.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); });
  if(MODE==='covers'){
    for(const [W, H, name] of [[1920,1080,'cover-landscape-1920x1080.png'],[800,1200,'cover-portrait-800x1200.png'],[800,800,'cover-square-800x800.png']]){
      await setup(page, W, H); await stage(page, W, H); await sleep(300);
      await page.screenshot({path:path.join(OUT, name)}); console.log('saved', name);
    }
  } else {
    // preview videos: cover frame, then a slow look around the island, then a wedding at the fountain
    for(const [W, H, name] of [[1920,1080,'preview-landscape-1080p'],[1080,1620,'preview-portrait-1080x1620']]){
      await setup(page, W, H); await stage(page, W, H);
      const chunks = []; await page.exposeFunction('cgChunk_' + W, b=>chunks.push(Buffer.from(b, 'base64')));
      const mime = await page.evaluate((W, H)=>{
        const I = window.__isle, src = I.renderer.domElement, comp = document.createElement('canvas'); comp.width = W; comp.height = H; const g = comp.getContext('2d');
        const title = document.getElementById('cgTitle');
        const orig = I.renderer.render.bind(I.renderer);
        I.renderer.render = (s, c)=>{ orig(s, c); g.drawImage(src, 0, 0, W, H); };
        const mime = ['video/mp4;codecs=avc1.640028','video/mp4','video/webm;codecs=vp9','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
        const rec = new MediaRecorder(comp.captureStream(30), {mimeType:mime, videoBitsPerSecond:10e6});
        rec.ondataavailable = e=>{ if(e.data.size){ const fr = new FileReader(); fr.onload = ()=>window['cgChunk_' + W](fr.result.split(',')[1]); fr.readAsDataURL(e.data); } };
        window.__rec = rec; window.__titleDraw = ()=>{};
        I.renderer.render = (s, c)=>{ orig(s, c); g.drawImage(src, 0, 0, W, H); if(window.__titleA > 0) window.__drawTitle(g, W, H, window.__titleA); };
        window.__titleA = 1; title.style.display = 'none';
        return mime;
      }, W, H);
      await page.evaluate(()=>{ window.__rec.start(1000); });
      await sleep(1600);
      // fade the title, let people walk off and look around
      for(let i=0;i<10;i++){ await page.evaluate(a=>{ window.__titleA = a; }, 1 - (i+1)/10); await sleep(40); }
      await page.evaluate(()=>{ const I = window.__isle; I.residents.forEach(r=>{ r.state = 'idle'; r.timer = Math.random()*2; r.scriptBubble = null; r.pose = null; }); I.cam.distGoal = 20; I.cam.pitchGoal = .62; I.scene.traverse(o=>{ if(o.isSprite) o.layers.set(0); }); });
      const t0 = Date.now();
      while(Date.now() - t0 < 4300){ await page.evaluate(()=>{ window.__isle.cam.yaw += .004; }); await sleep(30); }
      // wedding
      await page.evaluate(()=>{
        const I = window.__isle, R = I.residents.filter(r=>!r.d.kid && !r.d.isPlayer), a = R.find(r=>r.d.voice.g==='m'), b = R.find(r=>r.d.voice.g==='f');
        [a,b].forEach(x=>{ if(x.d.partner){ const o = I.residents.find(y=>y.d.id===x.d.partner); if(o){ o.d.partner = null; o.d.pType = null; } } });
        a.d.partner = b.d.id; b.d.partner = a.d.id; a.d.pType = b.d.pType = 'spouse'; I.S.coins = 999;
        const y0 = I.cam.yaw; I.startWedding(a, b, 'plaza', true); I.show.t = 9.1; I.cam.yawGoal = y0 + Math.PI;
      });
      await sleep(400); await page.evaluate(()=>{ const I = window.__isle; I.cam.distGoal = 9.5; I.cam.pitchGoal = .42; });
      await sleep(11000);
      await page.evaluate(()=>new Promise(ok=>{ window.__rec.onstop = ()=>setTimeout(ok, 800); window.__rec.stop(); }));
      await sleep(1200);
      const ext = mime.includes('mp4') ? '.mp4' : '.webm';
      fs.writeFileSync(path.join(OUT, name + ext), Buffer.concat(chunks)); console.log('saved', name + ext, (Buffer.concat(chunks).length/1e6).toFixed(1) + 'MB', mime);
    }
  }
  console.log('errors:', errs.filter(e=>!/MIME|sdk|crazygames/i.test(e)).slice(0,5));
  await browser.close().catch(()=>{}); srv.close();
})().catch(e=>{ console.error(e); process.exit(1); });
