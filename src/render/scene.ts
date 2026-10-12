// Three.js view of a match. Reads Match state every frame; never changes the rules.
import * as THREE from 'three';
import { ARENA, item } from '../config';
import { cageCorners } from '../game/arena';
import type { Match, Player } from '../game/match';
import type { Look } from '../game/match';
import { CharacterRig, buildCharacter, disposeCharacter } from './models';

const GUN_Y = 0.95;

interface Vis {
  p: Player;
  rig: CharacterRig;
  beam: THREE.Mesh; glow: THREE.Mesh; dot: THREE.Mesh;
  beamMat: THREE.MeshBasicMaterial; glowMat: THREE.MeshBasicMaterial;
  label: HTMLDivElement;
  lastX: number; lastZ: number; walk: number;
}

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

export class ArenaView {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private tileGroup = new THREE.Group();
  private tileMeshes: THREE.Mesh[] = [];
  private tileTop!: THREE.MeshStandardMaterial;
  private tileInner!: THREE.MeshStandardMaterial;
  private tileWarn!: THREE.MeshStandardMaterial;
  private tileSide!: THREE.MeshStandardMaterial;
  private meshTex!: THREE.CanvasTexture;
  private vis: Vis[] = [];
  private shotGroup = new THREE.Group();
  private fx = new THREE.Group();
  private particles: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  private marker: THREE.Mesh;
  private selRing: THREE.Mesh;
  private labels: HTMLElement;
  private preview: Vis | null = null;
  private time = 0;
  private shake = 0;
  private floorId = '';
  m: Match | null = null;
  private sun!: THREE.DirectionalLight;
  quality: 'high' | 'low' = 'high';
  // scratch objects reused every frame, so the phone's garbage collector doesn't cause hitches
  private tA = new THREE.Vector3(); private tB = new THREE.Vector3(); private tC = new THREE.Color();
  private fallMats: THREE.MeshStandardMaterial[] = [];

  // Tiny off-screen copies of effect materials so their shaders are ready before the first hit or floor drop
  // (otherwise the phone pauses for a moment the first time each effect appears).
  private warm = new THREE.Group();
  private warmUp() {
    this.scene.remove(this.warm); this.warm = new THREE.Group(); this.warm.position.y = -60;
    const g = new THREE.BoxGeometry(0.01, 0.01, 0.01);
    for (const m of [...this.fallMats, this.tileWarn, new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, toneMapped: false }),
      new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })]) this.warm.add(new THREE.Mesh(g, m));
    this.scene.add(this.warm);
  }
  /** Compile every shader now, during a loading moment, instead of mid-match. */
  prewarm() { try { this.renderer.compile(this.scene, this.camera); } catch { /* optional */ } }

  /** Low = fewer pixels and no shadows. Used automatically on slow phones. */
  setQuality(q: 'high' | 'low') {
    this.quality = q;
    const dpr = devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'high' ? Math.min(dpr, 1.75) : Math.min(dpr, 1));
    this.renderer.shadowMap.enabled = q === 'high';
    this.sun.castShadow = q === 'high';
    this.scene.traverse(o => { const mm = (o as THREE.Mesh).material; if (mm) (Array.isArray(mm) ? mm : [mm]).forEach(x => (x.needsUpdate = true)); });
    this.resize();
  }

  constructor(private canvas: HTMLCanvasElement, labels: HTMLElement) {
    this.labels = labels;
    // Sharp phone screens hide jagged edges anyway, so skip antialiasing there (big speed win).
    const dpr = devicePixelRatio || 1;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 1.5, powerPreference: 'high-performance', stencil: false });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.background = new THREE.Color('#14205a');
    this.scene.fog = new THREE.Fog('#14205a', 70, 140);

    const hemi = new THREE.HemisphereLight('#cfe8ff', '#1d3a2c', 1.1); this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff3df', 2.0);
    sun.position.set(-6, 16, 8); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    this.sun = sun;
    Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);

    this.buildStatic();
    this.scene.add(this.tileGroup, this.shotGroup, this.fx);

    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 28), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2; this.marker.position.y = 0.02; this.scene.add(this.marker);
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.62, 36), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }));
    this.selRing.rotation.x = -Math.PI / 2; this.selRing.position.y = 0.02; this.scene.add(this.selRing);

    this.setFloor('floor_steel');
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  // ---------- static arena ----------
  private buildStatic() {
    const grass = canvasTex(128, (g, s) => {
      g.fillStyle = '#2f6046'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(20,50,34,.35)' : 'rgba(80,130,90,.25)'; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
    }, 18);
    const groundM = new THREE.MeshStandardMaterial({ map: grass, roughness: 1 });
    const R = ARENA.cageRadius;
    const octPath = (r: number, hole = false) => {
      const pts = cageCorners(r).map(([x, z]) => new THREE.Vector2(x, -z));
      if (hole) pts.reverse();
      return pts;
    };
    // grass with an octagon hole where the pit is
    const gShape = new THREE.Shape([new THREE.Vector2(-60, -60), new THREE.Vector2(60, -60), new THREE.Vector2(60, 60), new THREE.Vector2(-60, 60)]);
    gShape.holes.push(new THREE.Path(octPath(R + 0.55, true)));
    const ground = new THREE.Mesh(new THREE.ShapeGeometry(gShape), groundM);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true;
    grass.repeat.set(0.15, 0.15);
    this.scene.add(ground);

    // concrete rim around the pit
    const rShape = new THREE.Shape(octPath(R + 0.55));
    rShape.holes.push(new THREE.Path(octPath(R - 0.25, true)));
    const rim = new THREE.Mesh(new THREE.ShapeGeometry(rShape), new THREE.MeshStandardMaterial({ color: '#46545c', roughness: 0.9 }));
    rim.rotation.x = -Math.PI / 2; rim.receiveShadow = true; this.scene.add(rim);

    // the pit: dark walls going down, tiles fall into it
    const well = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.25, R - 0.6, 7, 8, 1, true),
      new THREE.MeshStandardMaterial({ color: '#0e1f1c', roughness: 1, side: THREE.BackSide }));
    well.rotation.y = Math.PI / 8; well.position.y = -3.5; this.scene.add(well);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(R, 8), new THREE.MeshBasicMaterial({ color: '#020605' }));
    bottom.rotation.x = -Math.PI / 2; bottom.position.y = -7; this.scene.add(bottom);

    // fence
    const link = canvasTex(64, (g, s) => {
      g.clearRect(0, 0, s, s); g.strokeStyle = 'rgba(190,205,212,.85)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(s, s); g.moveTo(s, 0); g.lineTo(0, s); g.stroke();
    });
    const H = 2.3;
    const postM = new THREE.MeshStandardMaterial({ color: '#12171b', metalness: 0.6, roughness: 0.4 });
    const postG = new THREE.CylinderGeometry(0.07, 0.07, H, 8);
    const pts = cageCorners(R);
    for (let i = 0; i < 8; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % 8];
      const post = new THREE.Mesh(postG, postM); post.position.set(ax, H / 2, az); post.castShadow = true; this.scene.add(post);
      const len = Math.hypot(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const front = mz > 0;   // panels nearest the camera are see-through so they don't hide the floor
      const tex = link.clone(); tex.needsUpdate = true; tex.repeat.set(len * 3, H * 3);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: front ? 0.28 : 0.85, side: THREE.DoubleSide, depthWrite: false, metalness: 0.3, roughness: 0.6 }));
      panel.position.set(mx, H / 2, mz); panel.rotation.y = -Math.atan2(bz - az, bx - ax); this.scene.add(panel);
      for (const y of [H, 0.05]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), postM);
        rail.position.set(mx, y, mz); rail.rotation.y = panel.rotation.y; this.scene.add(rail);
      }
    }
  }

  setFloor(id: string) {
    if (id === this.floorId) return;
    this.floorId = id;
    const f = item(id).floor!;
    this.meshTex?.dispose();
    this.meshTex = canvasTex(64, (g, s) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
      g.fillStyle = f.mesh;
      const step = s / 8;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        g.beginPath(); g.arc(x * step + step / 2 + (y % 2) * step / 2, y * step + step / 2, step * 0.3, 0, 7); g.fill();
      }
    }, 2);
    const emissive = f.glow ? new THREE.Color(f.glow) : new THREE.Color('#000000');
    const mk = (c: string) => new THREE.MeshStandardMaterial({ color: c, map: this.meshTex, roughness: 0.55, metalness: 0.35, emissive, emissiveMap: f.glow ? this.meshTex : null, emissiveIntensity: f.glow ? 0.25 : 0 });
    [this.tileTop, this.tileInner, this.tileWarn].forEach(m => m?.dispose());
    this.tileTop = mk(f.base);
    this.tileInner = mk(f.inner);
    this.tileWarn = mk('#c07892');
    this.tileSide ??= new THREE.MeshStandardMaterial({ color: '#2a3238', roughness: 0.8 });
    this.fallMats.forEach(m => m.dispose());
    this.fallMats = [this.tileSide, this.tileTop].map(m => { const c = m.clone(); c.transparent = true; return c; });
    this.warmUp();
    this.tileMeshes.forEach(t => this.applyTileMat(t));
  }

  private applyTileMat(mesh: THREE.Mesh) {
    const ring = mesh.userData.ring as number;
    const top = ring <= 1 ? this.tileInner : this.tileTop;
    mesh.material = [this.tileSide, top, this.tileSide];
  }

  private buildTiles(m: Match) {
    this.tileMeshes.forEach(t => this.tileGroup.remove(t));
    this.tileMeshes = [];
    const geo = new THREE.CylinderGeometry(1 - ARENA.tileGap, 1 - ARENA.tileGap, 0.36, 6);
    geo.translate(0, -0.18, 0);
    for (const t of m.tiles) {
      const mesh = new THREE.Mesh(geo, this.tileSide);
      mesh.position.set(t.x, 0.0, t.z);
      mesh.userData = { tile: t, ring: t.ring };
      mesh.receiveShadow = true;
      this.applyTileMat(mesh);
      this.tileGroup.add(mesh); this.tileMeshes.push(mesh);
    }
  }

  // ---------- players ----------
  private makeVis(p: Player): Vis {
    const rig = buildCharacter(p.look, p.color);
    this.scene.add(rig.root);
    const beamMat = new THREE.MeshBasicMaterial({ color: p.color, toneMapped: false });
    const glowMat = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const unit = new THREE.BoxGeometry(1, 1, 1); unit.translate(0.5, 0, 0);
    const beam = new THREE.Mesh(unit, beamMat); beam.scale.set(1, 0.06, 0.06);
    const glow = new THREE.Mesh(unit, glowMat); glow.scale.set(1, 0.13, 0.13);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), glowMat);
    this.scene.add(beam, glow, dot);
    const label = document.createElement('div'); label.className = 'nametag'; label.textContent = p.name;
    label.style.setProperty('--c', p.color);
    this.labels.appendChild(label);
    return { p, rig, beam, glow, dot, beamMat, glowMat, label, lastX: p.x, lastZ: p.z, walk: 0 };
  }

  private dropVis(v: Vis) {
    this.scene.remove(v.rig.root, v.beam, v.glow, v.dot);
    disposeCharacter(v.rig); v.beamMat.dispose(); v.glowMat.dispose();
    v.label.remove();
  }

  setMatch(m: Match | null) {
    this.vis.forEach(v => this.dropVis(v)); this.vis = [];
    this.clearShots();
    this.m = m;
    if (m) {
      this.buildTiles(m);
      this.vis = m.players.map(p => this.makeVis(p));
      this.clearPreview();
      this.prewarm();
    }
  }

  /** Menu / shop: show the local player's look standing in the middle of the arena. */
  showPreview(look: Look, laser: string, rainbow: boolean) {
    this.clearPreview();
    const p = { id: -1, name: '', color: laser, rainbow, look, x: 0, z: 0, aim: Math.PI / 2, alive: true } as unknown as Player;
    this.preview = this.makeVis(p);
    this.preview.label.remove();
  }
  clearPreview() { if (this.preview) { this.dropVis(this.preview); this.preview = null; } }
  menu = false;

  // ---------- effects ----------
  private clearShots() { while (this.shotGroup.children.length) { const c = this.shotGroup.children.pop() as THREE.Mesh; (c.material as THREE.Material).dispose(); } }
  showShots(m: Match) {
    this.clearShots();
    for (const s of m.shots) {
      const v = this.vis.find(x => x.p === s.from); if (!v) continue;
      const from = v.rig.gunTip.getWorldPosition(this.tA);
      const to = this.tB.set(s.x, GUN_Y, s.z);
      const len = from.distanceTo(to);
      const color = s.hit ? '#ffffff' : s.from.color;
      for (const [w, o] of [[0.12, 1], [0.45, 0.5]] as const) {
        const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0.5, 0, 0);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        mesh.position.copy(from); mesh.scale.set(len, w, w);
        mesh.rotation.y = -Math.atan2(to.z - from.z, to.x - from.x);
        mesh.userData.base = o;
        this.shotGroup.add(mesh);
      }
      if (s.hit) this.burst(s.hit.x, s.hit.z, s.from.color);
    }
    this.shake = 0.35;
  }
  private partGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  burst(x: number, z: number, color: string) {
    const mats = [color, '#ffffff'].map(c => new THREE.MeshBasicMaterial({ color: c, transparent: true, toneMapped: false }));
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(this.partGeo, mats[i % 3 ? 0 : 1]);
      m.position.set(x, 0.9, z);
      const v = new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4 + 1, (Math.random() - 0.5) * 5);
      this.fx.add(m); this.particles.push({ m, v, life: 1 });
    }
  }

  // ---------- input helpers ----------
  screenToGround(cx: number, cy: number): { x: number; z: number } | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.ground, hit) ? { x: hit.x, z: hit.z } : null;
  }
  worldToScreen(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }
  /** Turn a screen-space direction (from the aim pad) into a ground angle around a world point. */
  screenDirToAngle(ox: number, oz: number, dx: number, dy: number): number | null {
    const s = this.worldToScreen(ox, 0, oz);
    const g = this.screenToGround(s.x + dx * 120, s.y + dy * 120);
    return g ? Math.atan2(g.z - oz, g.x - ox) : null;
  }

  // ---------- camera ----------
  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fitCamera();
  }
  private fitCamera() {
    // Fixed tilt; pull back until the whole cage fits, leaving room for the HUD on top and controls below.
    const portrait = this.camera.aspect < 1;
    const tilt = THREE.MathUtils.degToRad(portrait ? 52 : 58);
    // the floor must fit side to side; the fence may be cropped a little at the edges
    const floorPts = cageCorners(8.1).map(([x, z]) => new THREE.Vector3(x, 0, z));
    const fencePts = cageCorners(ARENA.cageRadius + 0.3).flatMap(([x, z]) => [new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 2.3, z)]);
    const look = new THREE.Vector3(0, 0, portrait ? 0.9 : 0.6);
    let lo = 8, hi = 80;
    for (let i = 0; i < 30; i++) {
      const d = (lo + hi) / 2;
      this.camera.position.set(0, Math.sin(tilt) * d, Math.cos(tilt) * d + look.z);
      this.camera.lookAt(look); this.camera.updateMatrixWorld();
      const fitsX = floorPts.every(p => Math.abs(p.clone().project(this.camera).x) < 0.99);
      const fitsY = fencePts.every(p => { const v = p.clone().project(this.camera); return v.y < (portrait ? 0.74 : 0.8) && v.y > (portrait ? -0.7 : -0.9); });
      if (fitsX && fitsY) hi = d; else lo = d;
    }
    const d = hi;
    this.baseCam.set(0, Math.sin(tilt) * d, Math.cos(tilt) * d + look.z);
    this.baseLook.copy(look);
    if (!this.camInit) { this.camPos.copy(this.baseCam); this.camLook.copy(look); this.camInit = true; }
  }
  private baseCam = new THREE.Vector3();
  private baseLook = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camInit = false;
  /** 0 = whole arena (in a match), 1 = close-up on your character (menus), 2 = close-up placed higher (shop) */
  shot = 0;
  snapCamera() { this.camInit = false; this.fitCamera(); }

  // ---------- frame ----------
  render(dt: number) {
    this.time += dt;
    const m = this.m;
    // tiles
    if (m) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
      this.tileWarn.emissive.setRGB(0.45 * pulse, 0.12 * pulse, 0.25 * pulse);
      this.tileWarn.emissiveIntensity = 1;
      const warnPhase = m.phase !== 'over';
      for (const mesh of this.tileMeshes) {
        const t = mesh.userData.tile;
        if (t.fall > 0) {
          if (!mesh.userData.falling) {
            mesh.userData.falling = true;
            const [side, top] = this.fallMats;
            mesh.material = [side, top, side];
            mesh.userData.spin = (Math.random() - 0.5) * 2;
          }
          mesh.position.y = -t.fall * t.fall * 7;
          mesh.rotation.x = t.fall * mesh.userData.spin; mesh.rotation.z = t.fall * mesh.userData.spin * 0.6;
          this.fallMats.forEach(x => (x.opacity = 1 - t.fall));
          mesh.visible = t.fall < 1;
        } else {
          const warn = warnPhase && !m.final && t.ring === m.ring;
          const mats = mesh.material as THREE.Material[];
          const want = warn ? this.tileWarn : (t.ring <= 1 ? this.tileInner : this.tileTop);
          if (mats[1] !== want) mesh.material = [this.tileSide, want, this.tileSide];
        }
      }
    }

    // players
    const ghost = m ? m.anyHidden() : true;
    const all = this.preview ? [...this.vis, this.preview] : this.vis;
    for (const v of all) this.updateVis(v, dt, ghost);

    // controlled-player helpers
    const c = m?.controlled();
    this.selRing.visible = !!c;
    this.marker.visible = !!(c && c.target);
    if (c) {
      this.selRing.position.set(c.x, 0.02, c.z);
      (this.selRing.material as THREE.MeshBasicMaterial).color.set(c.color);
      if (c.target) this.marker.position.set(c.target.x, 0.03, c.target.z);
    }

    // shots fade
    if (m && (m.phase === 'fire' || m.phase === 'drop')) {
      const a = m.phase === 'fire' ? Math.max(0.15, m.t / m.tt) : Math.max(0, (m.t / m.tt - 0.7) * 3);
      this.shotGroup.children.forEach(o => ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (o.userData.base as number) * a);
    } else if (this.shotGroup.children.length) this.clearShots();

    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i];
      q.life -= dt * 1.1; q.v.y -= 9 * dt; q.m.position.addScaledVector(q.v, dt);
      if (q.m.position.y < 0.05 && Math.hypot(q.m.position.x, q.m.position.z) < 7) { q.m.position.y = 0.05; q.v.multiplyScalar(0.5); q.v.y = Math.abs(q.v.y) * 0.3; }
      (q.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, q.life);
      if (q.life <= 0) { this.fx.remove(q.m); this.particles.splice(i, 1); }
    }

    // camera shake + gentle drift on menus
    this.shake = Math.max(0, this.shake - dt);
    const s = this.shake * 0.25;
    const portrait = this.camera.aspect < 1;
    const k = 1 - Math.exp(-dt * 3.5);
    if (this.shot === 0) { this.camPos.lerp(this.baseCam, k); this.camLook.lerp(this.baseLook, k); }
    else {
      const dist = this.shot === 2 ? (portrait ? 8.5 : 6.5) : (portrait ? 7.8 : 5.8), drop = this.shot === 2 ? (portrait ? 2.2 : 1.2) : (portrait ? 0.35 : 0.2);
      const sway = Math.sin(this.time * 0.25) * 1.2;
      this.camPos.lerp(this.tA.set(sway, 3.6, dist), k);
      this.camLook.lerp(this.tB.set(0, 0.8 - drop, 0), k);
    }
    this.camera.position.copy(this.camPos);
    if (s) this.camera.position.add(this.tA.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, 0));
    this.camera.lookAt(this.camLook);
    this.renderer.render(this.scene, this.camera);
  }

  private updateVis(v: Vis, dt: number, ghost: boolean) {
    const m = this.m, p = v.p, rig = v.rig, isPreview = v === this.preview;
    if (isPreview) p.aim = Math.PI / 2 + Math.sin(this.time * 0.8) * 0.9;
    const hidden = m && !isPreview ? m.isHidden(p) : false;
    const dead = !p.alive;
    const since = m ? m.clock - p.diedAt : 0;

    // body
    rig.root.visible = !hidden && !(dead && since > 1.6);
    rig.root.position.set(p.x, 0, p.z);
    rig.root.rotation.y = -p.aim;
    const moved = Math.hypot(p.x - v.lastX, p.z - v.lastZ);
    v.lastX = p.x; v.lastZ = p.z;
    v.walk = moved > 0.001 ? v.walk + dt * 12 : v.walk * 0.8;
    const swing = Math.sin(v.walk) * (moved > 0.001 ? 0.5 : 0);
    rig.legL.rotation.z = swing; rig.legR.rotation.z = -swing;
    rig.body.position.y = moved > 0.001 ? Math.abs(Math.sin(v.walk)) * 0.05 : 0;
    rig.body.rotation.set(0, 0, 0);
    rig.root.scale.setScalar(1);
    if (dead && p.how === 'shot') {
      const k = Math.min(1, since * 3);
      rig.body.rotation.z = k * 1.45;            // topple backwards
      rig.body.position.y = -Math.max(0, since - 0.9) * 1.2;
    } else if (dead && p.how === 'fell') {
      rig.root.position.y = -since * since * 6;
      rig.body.rotation.x = since * 2;
    }

    // laser colour (rainbow cycles)
    if (p.rainbow) {
      const c = this.tC.setHSL((this.time * 0.35) % 1, 1, 0.6);
      v.beamMat.color.copy(c); v.glowMat.color.copy(c); rig.tipMat.color.copy(c); rig.tipMat.emissive.copy(c);
    }

    // laser
    let show = !hidden && p.alive;
    if (m && !isPreview) {
      const ph = m.phase;
      show &&= ph === 'intro' || ph === 'hide' || ph === 'lock';
    }
    v.beam.visible = v.glow.visible = v.dot.visible = show;
    if (show) {
      rig.root.updateMatrixWorld(true);
      const from = rig.gunTip.getWorldPosition(this.tA);

      let ex: number, ez: number;
      if (m && !isPreview) {
        const e = m.laserEnd(p, ghost || m.phase === 'intro');
        ex = e.x; ez = e.z;
      } else { ex = p.x + Math.cos(p.aim) * 6; ez = p.z + Math.sin(p.aim) * 6; }
      const len = Math.max(0.01, Math.hypot(ex - from.x, ez - from.z));
      const lock = m?.phase === 'lock';
      const flick = lock ? (Math.sin(this.time * 40) > 0 ? 1 : 0.55) : 1;
      for (const b of [v.beam, v.glow]) { b.position.copy(from); b.rotation.set(0, -Math.atan2(ez - from.z, ex - from.x), 0); }
      v.beam.scale.set(len, lock ? 0.08 : 0.06, lock ? 0.08 : 0.06);
      v.glow.scale.set(len, lock ? 0.3 : 0.2, lock ? 0.3 : 0.2);
      v.glowMat.opacity = 0.35 * flick;
      v.dot.position.set(ex, from.y, ez);
    }

    // name tag
    if (!isPreview) {
      const show = rig.root.visible && p.alive;
      v.label.hidden = !show;
      if (show) {
        const s = this.worldToScreen(p.x, 1.95, p.z);
        v.label.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
        v.label.classList.toggle('me', p.human);
      }
    }
  }
}
