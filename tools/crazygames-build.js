// Builds the CrazyGames upload: crazygames-release/game/ (and game.zip next to it).
// The game is self-contained there: three.js and the QR library are copied in, the CrazyGames SDK is
// loaded, and web-only bits (service worker, install manifest, self-update banner) are left out.
// Usage: node tools/crazygames-build.js
const fs = require('fs'), path = require('path'), https = require('https'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'crazygames-release'), GAME = path.join(OUT, 'game');
const LIBS = {
  'three.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'qrcode.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'
};
const get = url=>new Promise((ok, no)=>https.get(url, res=>{ if(res.statusCode!==200) return no(new Error(url + ' ' + res.statusCode)); const b = []; res.on('data', c=>b.push(c)); res.on('end', ()=>ok(Buffer.concat(b))); }).on('error', no));
function swap(s, a, b){ if(!s.includes(a)) throw new Error('build: cannot find ' + a.slice(0, 80)); return s.split(a).join(b); }

(async ()=>{
  fs.rmSync(GAME, {recursive:true, force:true}); fs.mkdirSync(GAME, {recursive:true});
  for(const [f, url] of Object.entries(LIBS)) fs.writeFileSync(path.join(GAME, f), await get(url));
  let s = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  s = swap(s, '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>', '<script src="three.min.js"></script>');
  s = swap(s, "loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js')", "loadScript('qrcode.min.js')");
  s = s.replace(/<link rel="manifest"[^>]*>/, '').replace(/<link rel="apple-touch-icon"[^>]*>/, '');
  s = s.replace(/<script>if\('serviceWorker' in navigator[\s\S]*?<\/script>/, '');
  s = swap(s, 'checkUpdate(); setInterval(checkUpdate, 3*60*1000);', '');
  s = swap(s, "document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) checkUpdate(); });", '');
  // CrazyGames SDK: tell the site when the game has loaded and when play starts / pauses
  s = swap(s, '<style>', '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script><style>');
  s = s.replace(/<\/body>(?![\s\S]*<\/body>)/, `<script>
(function(){
  const sdk = ()=>window.CrazyGames && CrazyGames.SDK;
  let ready = false;
  const call = fn=>{ if(ready) try{ fn(sdk()); }catch(e){} };
  if(sdk()) sdk().init().then(()=>{ ready = true; call(s=>s.game.loadingStop && s.game.loadingStop()); call(s=>s.game.gameplayStart()); }).catch(()=>{});
  document.addEventListener('visibilitychange', ()=>call(s=>document.hidden ? s.game.gameplayStop() : s.game.gameplayStart()));
  const pb = document.getElementById('pauseBtn'), rb = document.getElementById('resumeBtn');
  if(pb) pb.addEventListener('click', ()=>setTimeout(()=>call(s=>pb.classList.contains('on') ? s.game.gameplayStop() : s.game.gameplayStart()), 0));
  if(rb) rb.addEventListener('click', ()=>call(s=>s.game.gameplayStart()));
})();
</script></body>`);
  fs.writeFileSync(path.join(GAME, 'index.html'), s);
  const zip = path.join(OUT, 'game.zip'); fs.rmSync(zip, {force:true});
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${GAME}\\*' -DestinationPath '${zip}'`]);
  const size = fs.readdirSync(GAME).reduce((n, f)=>n + fs.statSync(path.join(GAME, f)).size, 0);
  console.log(`built ${GAME} (${(size/1024).toFixed(0)} KB, ${fs.readdirSync(GAME).length} files) and ${zip}`);
})().catch(e=>{ console.error(e); process.exit(1); });
