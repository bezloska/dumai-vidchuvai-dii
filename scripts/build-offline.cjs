const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
(async () => {
  const {outputFiles} = await esbuild.build({
    entryPoints: [path.join(root, 'game.js')], bundle: true, write: false,
    format: 'iife', target: 'es2020', minify: true, legalComments: 'inline',
    alias: {three: path.join(root, 'vendor/three/three.module.js')}
  });
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  html = html.replace(/<link rel="stylesheet" href="styles.css">/, () => `<style>${fs.readFileSync(path.join(root,'styles.css'),'utf8')}</style>`);
  html = html.replace(/\s*<script type="importmap">.*?<\/script>/s, '');
  html = html.replace(/\s*<script type="module" src="game.js"><\/script>/, '');
  html = html.replace(/src="(assets\/[^"\s]+\.svg)"/g, (_, name) => `src="data:image/svg+xml;base64,${fs.readFileSync(path.join(root,name)).toString('base64')}"`);
  const embedded = {
    cube: `data:image/png;base64,${fs.readFileSync(path.join(root,'cube.png')).toString('base64')}`,
    font: JSON.parse(fs.readFileSync(path.join(root,'vendor/three/fonts/optimer_regular.typeface.json'),'utf8'))
  };
  const safe = s => s.replace(/<\/script/gi, '<\\/script');
  const bundle = `<script id="embedded-assets" type="application/json">${safe(JSON.stringify(embedded))}</script><script>${safe(outputFiles[0].text)}</script>`;
  html = html.replace('</body>', () => `${bundle}</body>`);
  fs.writeFileSync(path.join(root,'play.html'),html);
  console.log('Built play.html: standalone browser game; no server, CDN, or external requests required.');
})().catch(error => {console.error(error);process.exitCode=1});
