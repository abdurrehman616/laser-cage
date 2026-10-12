// Blocky low-poly character built from boxes, so new outfits and hats are just colours and shapes.
import * as THREE from 'three';
import { item } from '../config';
import type { Look } from '../game/match';

export interface CharacterRig {
  root: THREE.Group;      // position + facing
  body: THREE.Group;      // tilts when hit
  legL: THREE.Mesh; legR: THREE.Mesh;
  gunTip: THREE.Object3D; // where the laser starts
  tipMat: THREE.MeshStandardMaterial;
  mats: THREE.MeshStandardMaterial[];
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const GEO = {
  leg: box(0.2, 0.5, 0.22),
  torso: box(0.56, 0.52, 0.3),
  belt: box(0.58, 0.07, 0.32),
  arm: box(0.46, 0.16, 0.16),   // long side points forward (+x)
  head: box(0.42, 0.4, 0.4),
  hair: box(0.46, 0.14, 0.44),
  hairBack: box(0.46, 0.26, 0.1),
  bun: new THREE.SphereGeometry(0.11, 10, 8),
  gun: box(0.56, 0.11, 0.11),
  grip: box(0.08, 0.16, 0.08),
  tip: box(0.07, 0.09, 0.09),
  capTop: box(0.46, 0.12, 0.46),
  capBrim: box(0.26, 0.04, 0.3),
  band: box(0.45, 0.07, 0.43),
  helmet: new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  crown: new THREE.CylinderGeometry(0.2, 0.17, 0.16, 6, 1, true),
  eye: box(0.05, 0.07, 0.02),
};

function mat(color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...extra });
}

export function buildCharacter(look: Look, laserColor: string): CharacterRig {
  const fit = item(look.outfit), hat = item(look.hat);
  const mats: THREE.MeshStandardMaterial[] = [];
  const M = (c: string, e?: Partial<THREE.MeshStandardMaterialParameters>) => { const m = mat(c, e); mats.push(m); return m; };
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
  };

  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const skin = M('#f1c79a'), shirt = M(fit.shirt!), pants = M(fit.pants!), trim = M(fit.trim!);

  // local +x is "forward" (the aim direction)
  const legL = add(body, GEO.leg, pants, 0, 0.25, -0.13);
  const legR = add(body, GEO.leg, pants, 0, 0.25, 0.13);
  add(body, GEO.torso, shirt, 0, 0.76, 0).rotation.y = Math.PI / 2;
  add(body, GEO.belt, trim, 0, 0.53, 0).rotation.y = Math.PI / 2;
  const head = add(body, GEO.head, skin, 0, 1.22, 0);
  head.rotation.y = Math.PI / 2;
  const eyeM = M('#1a1a1a');
  add(body, GEO.eye, eyeM, 0.205, 1.25, -0.08).rotation.y = Math.PI / 2;
  add(body, GEO.eye, eyeM, 0.205, 1.25, 0.08).rotation.y = Math.PI / 2;

  if (hat.hat === 'none' || hat.hat === 'band') {
    const hairM = M(look.hair);
    add(body, GEO.hair, hairM, -0.01, 1.46, 0).rotation.y = Math.PI / 2;
    add(body, GEO.hairBack, hairM, -0.19, 1.33, 0).rotation.y = Math.PI / 2;
    if (hat.hat === 'none') add(body, GEO.bun, hairM, -0.12, 1.6, 0);
  }
  if (hat.hat === 'cap') {
    const c = M(hat.hatColor!);
    add(body, GEO.capTop, c, 0, 1.47, 0);
    add(body, GEO.capBrim, c, 0.3, 1.43, 0);
  } else if (hat.hat === 'band') {
    add(body, GEO.band, M(hat.hatColor!), 0, 1.36, 0).rotation.y = Math.PI / 2;
  } else if (hat.hat === 'helmet') {
    add(body, GEO.helmet, M(hat.hatColor!, { metalness: 0.4, roughness: 0.4 }), 0, 1.36, 0);
  } else if (hat.hat === 'crown') {
    const cm = M(hat.hatColor!, { metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide });
    add(body, GEO.crown, cm, 0, 1.5, 0);
    add(body, GEO.hair, M(look.hair), -0.01, 1.43, 0).rotation.y = Math.PI / 2;
  }

  // arms reach forward to hold the gun
  const armL = add(body, GEO.arm, shirt, 0.24, 0.93, -0.2); armL.rotation.y = -0.3;
  const armR = add(body, GEO.arm, shirt, 0.24, 0.93, 0.2); armR.rotation.y = 0.3;

  const gunM = M('#14191e', { metalness: 0.5, roughness: 0.45 });
  add(body, GEO.gun, gunM, 0.62, 0.95, 0);
  add(body, GEO.grip, gunM, 0.46, 0.86, 0);
  const tipMat = M(laserColor, { emissive: new THREE.Color(laserColor), emissiveIntensity: 1.2 });
  add(body, GEO.tip, tipMat, 0.92, 0.95, 0);
  const gunTip = new THREE.Object3D(); gunTip.position.set(0.96, 0.95, 0); body.add(gunTip);

  return { root, body, legL, legR, gunTip, tipMat, mats };
}

export function disposeCharacter(r: CharacterRig) {
  r.mats.forEach(m => m.dispose());
  r.root.traverse(o => { if ((o as THREE.Mesh).geometry && !Object.values(GEO).includes((o as THREE.Mesh).geometry as never)) (o as THREE.Mesh).geometry.dispose(); });
}
