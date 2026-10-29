import * as THREE from 'three';
import { RoundedBoxGeometry } from './vendor/three/addons/geometries/RoundedBoxGeometry.js';
import { FontLoader } from './vendor/three/addons/loaders/FontLoader.js';
import { RoomEnvironment } from './vendor/three/addons/environments/RoomEnvironment.js';

const embeddedElement = document.querySelector('#embedded-assets');
const embeddedAssets = embeddedElement ? JSON.parse(embeddedElement.textContent) : null;
const UP = new THREE.Vector3(0, 1, 0);
const FRONT = new THREE.Vector3(0, 0, 1);
const NORMALS = [[0, 0, 1], [1, 0, 0], [0, 0, -1], [-1, 0, 0], [0, 1, 0], [0, -1, 0]].map(v => new THREE.Vector3(...v));
const FACE_ROTATIONS = NORMALS.map(n => new THREE.Quaternion().setFromUnitVectors(FRONT, n));
const TOP_FRAME = new THREE.Quaternion().setFromAxisAngle(UP, .48).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));

function landingPose(index) {
  return TOP_FRAME.clone().multiply(FACE_ROTATIONS[index].clone().invert());
}

function roundedPanel() {
  const p = new THREE.Shape();
  const h = .955, r = .17;
  p.moveTo(-h + r, -h);
  p.lineTo(h - r, -h); p.quadraticCurveTo(h, -h, h, -h + r);
  p.lineTo(h, h - r); p.quadraticCurveTo(h, h, h - r, h);
  p.lineTo(-h + r, h); p.quadraticCurveTo(-h, h, -h, h - r);
  p.lineTo(-h, -h + r); p.quadraticCurveTo(-h, -h, -h + r, -h);
  return new THREE.ExtrudeGeometry(p, {depth: .015, bevelEnabled: true, bevelSize: .012, bevelThickness: .012, bevelSegments: 3, curveSegments: 10});
}

function symbolShape(plus) {
  const s = new THREE.Shape();
  const a = .48, b = .105;
  const points = plus ? [[-b,-a],[b,-a],[b,-b],[a,-b],[a,b],[b,b],[b,a],[-b,a],[-b,b],[-a,b],[-a,-b],[-b,-b]] : [[-a,-b],[a,-b],[a,b],[-a,b]];
  points.forEach(([x,y],i) => i ? s.lineTo(x,y) : s.moveTo(x,y));
  s.closePath();
  return s;
}

async function loadMarble() {
  const image = new Image();
  image.src = embeddedAssets?.cube ?? new URL('./cube.png', document.baseURI).href;
  await image.decode();
  // Sample an unlettered marble area of the approved PNG. No new image asset,
  // baked numeral, gold edge, or external texture is placed on a model face.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff7e7'; ctx.fillRect(0, 0, 512, 512);
  ctx.drawImage(image, 85, 425, 95, 75, 0, 0, 512, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
  // Extruded panels use model-space UVs in [-1,1].
  texture.repeat.set(.52, .52);
  texture.offset.set(.5, .5);
  return texture;
}

export async function createDiceRenderer(host) {
  const renderer = new THREE.WebGLRenderer({alpha: true, antialias: true, powerPreference: 'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-3.5, 3.5, 2.4, -2.4, .1, 80);
  camera.position.set(0, 6, 9); camera.lookAt(0, 1, 0);
  scene.add(new THREE.HemisphereLight(0xfff6df, 0x655034, 1.25));
  const key = new THREE.DirectionalLight(0xfff4d5, 2.3);
  key.position.set(-4, 7, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd17a, 1.6);
  rim.position.set(5, 4, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, .8);
  fill.position.set(2, 0, 5); scene.add(fill);
  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  room.dispose(); pmrem.dispose();

  const [marbleMap, font] = await Promise.all([
    loadMarble(),
    embeddedAssets?.font ? Promise.resolve(new FontLoader().parse(embeddedAssets.font)) : new FontLoader().loadAsync(new URL('./vendor/three/fonts/optimer_regular.typeface.json', document.baseURI).href)
  ]);
  marbleMap.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const marble = new THREE.MeshPhysicalMaterial({map: marbleMap, color: 0xfff9ec, roughness: .35, metalness: .02, clearcoat: .4, clearcoatRoughness: .26});
  const gold = new THREE.MeshStandardMaterial({color: 0xeeb34a, metalness: .88, roughness: .22});
  const glyphGold = new THREE.MeshStandardMaterial({color: 0xb77917, metalness: .78, roughness: .28});
  const glyphSide = new THREE.MeshStandardMaterial({color: 0x865010, metalness: .75, roughness: .3});
  const bodyGeometry = new RoundedBoxGeometry(2, 2, 2, 5, .18);
  const panelGeometry = roundedPanel();
  const glyphGeometry = new Map();
  function makeGlyph(label) {
    if (!glyphGeometry.has(label)) {
      const shapes = label === '+' || label === '−' ? symbolShape(label === '+') : font.generateShapes(label, 1.12);
      const geometry = new THREE.ExtrudeGeometry(shapes, {depth: .05, bevelEnabled: true, bevelThickness: .012, bevelSize: .012, bevelSegments: 3, curveSegments: 10});
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      geometry.translate(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, 0);
      glyphGeometry.set(label, geometry);
    }
    return new THREE.Mesh(glyphGeometry.get(label), [glyphGold, glyphSide]);
  }
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext('2d');
  const gradient = shadowContext.createRadialGradient(64,64,8,64,64,64);
  gradient.addColorStop(0, 'rgba(45,24,4,.4)'); gradient.addColorStop(1, 'rgba(45,24,4,0)');
  shadowContext.fillStyle = gradient; shadowContext.fillRect(0,0,128,128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const shadowGeometry = new THREE.PlaneGeometry(3.1, 3.1);
  const dice = [];
  const shadowMeshes = [];
  for (const [index, labels] of [['1','2','3','4','5','6'], ['+','−','+','−','+','−']].entries()) {
    const die = new THREE.Group();
    die.add(new THREE.Mesh(bodyGeometry, gold));
    const faces = labels.map((label, i) => {
      const face = new THREE.Group();
      face.quaternion.copy(FACE_ROTATIONS[i]);
      face.position.copy(NORMALS[i]).multiplyScalar(1.002);
      face.add(new THREE.Mesh(panelGeometry, marble));
      const glyph = makeGlyph(label); glyph.position.z = .04; face.add(glyph);
      face.userData.label = label;
      die.add(face);
      return face;
    });
    die.userData.faces = faces;
    die.position.x = index ? 1.55 : -1.55;
    die.quaternion.copy(landingPose(0));
    scene.add(die); dice.push(die);
    const shadow = new THREE.Mesh(shadowGeometry, new THREE.MeshBasicMaterial({map: shadowTexture, transparent: true, depthWrite: false}));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(die.position.x, -1.08, 0);
    scene.add(shadow); shadowMeshes.push(shadow);
  }
  let lost = false;
  let disposed = false;
  const render = () => { if (!lost && !disposed) renderer.render(scene, camera); };
  function resize() {
    const {width, height} = host.getBoundingClientRect();
    if (!width || !height || disposed) return;
    const halfHeight = 2.45;
    camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.right = halfHeight * width / height; camera.left = -camera.right;
    camera.updateProjectionMatrix(); renderer.setSize(width, height, false); render();
  }
  const observer = new ResizeObserver(resize); observer.observe(host);
  function visibleFaces() {
    scene.updateMatrixWorld(true);
    return dice.map(die => {
      const quaternion = die.getWorldQuaternion(new THREE.Quaternion());
      let top = 0, alignment = -Infinity;
      NORMALS.forEach((n, i) => {
        const dot = n.clone().applyQuaternion(quaternion).dot(UP);
        if (dot > alignment) {top = i; alignment = dot;}
      });
      return {value: die.userData.faces[top].userData.label, face: top, alignment, height: die.position.y};
    });
  }
  host.addEventListener('webglcontextlost', event => {
    event.preventDefault(); lost = true;
    host.dispatchEvent(new CustomEvent('dice-context-lost'));
  });
  host.addEventListener('webglcontextrestored', () => {
    lost = false; resize();
    host.dispatchEvent(new CustomEvent('dice-context-restored'));
  });
  // WebGL events originate on the canvas and do not bubble.
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); lost = true;
    host.dispatchEvent(new CustomEvent('dice-context-lost'));
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    lost = false; resize(); host.dispatchEvent(new CustomEvent('dice-context-restored'));
  });
  resize();
  return {
    visibleFaces,
    async rollTo(numberFace, signFace, reduced = false) {
      if (lost) throw new Error('WebGL context unavailable');
      const starts = dice.map(d => d.quaternion.clone());
      const targets = [landingPose(numberFace), landingPose(signFace)];
      if (reduced) {
        dice.forEach((die,i) => die.quaternion.copy(targets[i]));
        render(); return;
      }
      const duration = 1850;
      await new Promise((resolve, reject) => {
        const start = performance.now();
        const frame = now => {
          if (lost || disposed) {reject(new Error('WebGL context unavailable')); return;}
          const t = Math.min(1, (now - start) / duration);
          const ease = 1 - (1 - t) ** 3;
          const lift = t < .82 ? Math.sin(Math.PI * t / .82) * 1.25 : Math.sin(Math.PI * (t - .82) / .18) * .13;
          dice.forEach((die, i) => {
            const direction = i ? -1 : 1;
            const spin = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI * 6 * ease, direction * Math.PI * 4 * ease, direction * Math.PI * 2 * ease));
            die.quaternion.copy(starts[i]).slerp(targets[i], ease).premultiply(spin);
            die.position.y = lift;
            shadowMeshes[i].material.opacity = 1 - lift * .42;
            shadowMeshes[i].scale.setScalar(1 - lift * .12);
          });
          if (t === 1) {
            dice.forEach((die,i) => {die.quaternion.copy(targets[i]); die.position.y = 0;});
            render(); resolve();
          } else {render(); requestAnimationFrame(frame);}
        };
        requestAnimationFrame(frame);
      });
    },
    dispose() {
      disposed = true; observer.disconnect();
      bodyGeometry.dispose(); panelGeometry.dispose(); shadowGeometry.dispose();
      glyphGeometry.forEach(g => g.dispose());
      shadowMeshes.forEach(s => s.material.dispose());
      marble.dispose(); gold.dispose(); glyphGold.dispose(); glyphSide.dispose(); marbleMap.dispose(); shadowTexture.dispose(); environment.dispose();
      renderer.dispose(); renderer.domElement.remove();
    }
  };
}
