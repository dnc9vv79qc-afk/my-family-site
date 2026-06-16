import * as THREE from "three";
import { pxToM, floorBounds } from "./data.js";
import { FINISHES } from "./defaults.js";

const FLOOR_HEIGHT_M = 2.72;
const WALL_H_M = 2.42;
const SLAB_H_M = 0.16;
const WALL_T_M = 0.11;

export class DetailScene3D {
  constructor(canvas){
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#f7f7f4");
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.05, 1000);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.target = new THREE.Vector3(0, 0.8, 0);
    this.theta = Math.PI * 0.24;
    this.phi = 0.95;
    this.radius = 15;
    this.needsFrame = true;
    this.state = null;
    this.initLights();
    this.initControls();
    this.resize();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  initLights(){
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d3c7, 0.78));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(10, 16, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    this.scene.add(sun);
    this.sun = sun;
    const fill = new THREE.DirectionalLight(0xbfd7ff, 0.24);
    fill.position.set(-10, 5, -8);
    this.scene.add(fill);
  }

  initControls(){
    let dragging = false;
    let last = null;
    this.canvas.addEventListener("pointerdown", (event) => {
      dragging = true;
      last = { x: event.clientX, y: event.clientY };
      this.canvas.setPointerCapture?.(event.pointerId);
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if(!dragging || !last) return;
      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      if(event.shiftKey){
        const scale = this.radius * 0.0016;
        this.target.x -= dx * scale * Math.cos(this.theta);
        this.target.z += dx * scale * Math.sin(this.theta);
        this.target.y += dy * scale;
      }else{
        this.theta -= dx * 0.006;
        this.phi = clamp(this.phi - dy * 0.005, 0.24, 1.45);
      }
      last = { x: event.clientX, y: event.clientY };
      this.needsFrame = true;
    });
    const stop = () => { dragging = false; last = null; };
    this.canvas.addEventListener("pointerup", stop);
    this.canvas.addEventListener("pointercancel", stop);
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.radius = clamp(this.radius * (event.deltaY > 0 ? 1.08 : 0.92), 4, 80);
      this.needsFrame = true;
    }, { passive: false });
  }

  resize(){
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.needsFrame = true;
  }

  setState(state){
    this.state = state;
    this.rebuild();
    this.needsFrame = true;
  }

  rebuild(){
    clearGroup(this.root);
    if(!this.state?.plan) return;
    const { plan, design, floorMode, layers, selectedId } = this.state;
    const bounds = floorBounds(plan, floorMode, 96);
    if(layers.exterior) this.buildExterior(bounds, design);
    const floorIndexes = floorMode === "all" ? plan.floors.map((_, index) => index) : [Number(floorMode || 0)];
    floorIndexes.forEach((floorIndex) => {
      const floor = plan.floors[floorIndex];
      if(!floor) return;
      const yBase = floorMode === "all" ? floorIndex * FLOOR_HEIGHT_M : 0;
      this.buildFloor(floor, floorIndex, yBase, design, layers, selectedId);
    });
    const centerX = pxToM((bounds.minX + bounds.maxX) / 2);
    const centerZ = pxToM((bounds.minY + bounds.maxY) / 2);
    const diag = Math.hypot(pxToM(bounds.width), pxToM(bounds.height));
    this.target.set(centerX, floorMode === "all" ? FLOOR_HEIGHT_M * 0.85 : 0.85, centerZ);
    this.radius = clamp(diag * 1.25 + 4, 8, 44);
    if(this.sun){
      this.sun.position.set(centerX + 8, 14, centerZ + 7);
      this.sun.target.position.set(centerX, 0, centerZ);
      this.scene.add(this.sun.target);
    }
  }

  buildExterior(bounds, design){
    const ext = design.exterior || {};
    const setback = Number(ext.setbackM || 2.4);
    const x = pxToM(bounds.minX) - setback;
    const z = pxToM(bounds.minY) - setback;
    const w = pxToM(bounds.width) + setback * 2;
    const d = pxToM(bounds.height) + setback * 2;
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.035, d),
      mat("#dce7d8", 0.95, 0.58)
    );
    ground.position.set(x + w / 2, -0.03, z + d / 2);
    ground.receiveShadow = true;
    this.root.add(ground);

    const driveW = Math.min(w * 0.55, 5.6);
    const driveD = Math.max(2.4, setback + 1.2);
    const driveway = new THREE.Mesh(new THREE.BoxGeometry(driveW, 0.04, driveD), mat("#c9ccc7", 0.98, 0.46));
    driveway.position.set(x + w * 0.68, 0.005, z + d - driveD / 2);
    driveway.receiveShadow = true;
    this.root.add(driveway);

    const cars = clamp(Math.round(Number(ext.parkingCars || 0)), 0, 4);
    for(let i = 0; i < cars; i++){
      const car = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.42, 3.9), mat(i % 2 ? "#e8ecef" : "#424948", 0.55, 0.4));
      car.position.set(driveway.position.x - (cars - 1) * 0.95 + i * 1.9, 0.27, driveway.position.z);
      car.castShadow = true;
      this.root.add(car);
    }

    const deckDepth = Number(ext.deckM || 0);
    if(deckDepth > 0.05){
      const deck = new THREE.Mesh(new THREE.BoxGeometry(Math.min(w * 0.45, 4.8), 0.16, deckDepth), mat("#b78354", 0.82, 0.46));
      deck.position.set(x + w * 0.34, 0.08, z + d - setback - deckDepth / 2);
      deck.castShadow = true;
      deck.receiveShadow = true;
      this.root.add(deck);
    }

    const garden = new THREE.Mesh(new THREE.BoxGeometry(Math.min(w * 0.36, 4.6), 0.06, Math.min(d * 0.18, 2.6)), mat("#7aa85d", 0.88, 0.66));
    garden.position.set(x + w * 0.28, 0.02, z + d - 1.25);
    this.root.add(garden);
    for(let i = 0; i < 5; i++){
      const plant = new THREE.Mesh(new THREE.ConeGeometry(0.22 + (i % 2) * 0.08, 0.9 + (i % 3) * 0.2, 9), mat("#3f7e49", 0.8, 0.55));
      plant.position.set(garden.position.x - 1.8 + i * 0.85, 0.5, garden.position.z + (i % 2) * 0.45 - 0.2);
      plant.castShadow = true;
      this.root.add(plant);
    }

    if(ext.fence){
      const fenceMat = mat("#9b7a55", 0.82, 0.42);
      addBox(this.root, x + w / 2, 0.45, z, w, 0.9, 0.07, fenceMat);
      addBox(this.root, x + w / 2, 0.45, z + d, w, 0.9, 0.07, fenceMat);
      addBox(this.root, x, 0.45, z + d / 2, 0.07, 0.9, d, fenceMat);
      addBox(this.root, x + w, 0.45, z + d / 2, 0.07, 0.9, d, fenceMat);
    }
  }

  buildFloor(floor, floorIndex, yBase, design, layers, selectedId){
    const items = floor.items || [];
    const rooms = items.filter((item) => item.type === "room" && !item.void);
    const frames = items.filter((item) => item.type === "frame");
    const openings = items.filter((item) => item.type === "opening");
    const wallLines = items.filter((item) => item.type === "wallLine");
    const existingFurniture = items.filter((item) => item.type === "furn" || item.type === "stair");
    if(layers.rooms){
      rooms.forEach((room, index) => this.addRoom(room, floorIndex, yBase, design, selectedId, index));
    }else{
      frames.forEach((frame) => {
        addBox(this.root, pxToM(frame.x + frame.w / 2), yBase, pxToM(frame.y + frame.h / 2), pxToM(frame.w), 0.035, pxToM(frame.h), mat("#e8e3d8", 0.8, 0.54));
      });
    }
    if(layers.walls){
      const wallMat = mat("#f2eee6", 0.82, 0.62);
      const outer = outerSegments(frames);
      outer.forEach((seg) => splitByOpenings(seg, openings).forEach((solid) => this.addWall(solid, yBase, wallMat, WALL_T_M)));
      wallLines.forEach((wall) => splitByOpenings(wall, openings).forEach((solid) => this.addWall(solid, yBase, wallMat, Math.max(WALL_T_M, pxToM(wall.thick || 6)))));
    }
    if(layers.openings){
      openings.forEach((opening) => this.addOpening(opening, yBase, selectedId));
    }
    if(layers.furniture){
      existingFurniture.forEach((item) => {
        if(item.type === "stair") this.addStair(item, yBase, selectedId);
        else this.addFurnitureBox(item, floorIndex, yBase, selectedId, true);
      });
    }
    (design.customItems || [])
      .filter((item) => item.floorIndex === floorIndex)
      .filter((item) => layers[item.layer] !== false)
      .forEach((item) => this.addFurnitureBox(item, floorIndex, yBase, selectedId, false));
  }

  addRoom(room, floorIndex, yBase, design, selectedId, index){
    const finish = design.finishes?.[room.id] || {};
    const floorDef = FINISHES.floor.find((item) => item.id === finish.floor);
    const color = floorDef?.color || room.color || "#efe1bf";
    const height = selectedId === room.id ? 0.09 : 0.045;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.03, pxToM(room.w)), height, Math.max(0.03, pxToM(room.h))),
      mat(color, 0.88, 0.52)
    );
    mesh.position.set(pxToM(room.x + room.w / 2), yBase + height / 2 + index * 0.002, pxToM(room.y + room.h / 2));
    mesh.receiveShadow = true;
    this.root.add(mesh);
  }

  addWall(seg, yBase, material, thickness){
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const len = Math.hypot(dx, dy);
    if(len < 1) return;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(pxToM(len), WALL_H_M, thickness), material);
    wall.position.set(pxToM((seg.x1 + seg.x2) / 2), yBase + SLAB_H_M + WALL_H_M / 2, pxToM((seg.y1 + seg.y2) / 2));
    wall.rotation.y = -Math.atan2(dy, dx);
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.root.add(wall);
  }

  addOpening(opening, yBase, selectedId){
    const dx = opening.x2 - opening.x1;
    const dy = opening.y2 - opening.y1;
    const len = Math.max(0.2, pxToM(Math.hypot(dx, dy)));
    const isWindow = opening.kind === "window";
    const height = isWindow ? Math.max(0.5, ((opening.winT || 2000) - (opening.winB || 900)) / 1000) : 2.02;
    const bottom = isWindow ? (opening.winB || 900) / 1000 : 0.06;
    const color = isWindow ? "#91c8df" : "#a97343";
    const material = mat(color, isWindow ? 0.42 : 0.86, 0.36, isWindow);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(len, height, 0.045), material);
    panel.position.set(pxToM((opening.x1 + opening.x2) / 2), yBase + SLAB_H_M + bottom + height / 2, pxToM((opening.y1 + opening.y2) / 2));
    panel.rotation.y = -Math.atan2(dy, dx);
    if(selectedId === opening.id) panel.scale.y = 1.08;
    this.root.add(panel);
  }

  addFurnitureBox(item, floorIndex, yBase, selectedId, existing){
    const hM = existing ? Math.max(0.08, Number(item.fh || 700) / 1000) : Math.max(0.08, Number(item.heightMm || 700) / 1000);
    const glM = existing ? Math.max(0, Number(item.gl || 0) / 1000) : Math.max(0, Number(item.glMm || 0) / 1000);
    const layer = existing ? "furniture" : item.layer;
    const alpha = layer === "openings" ? 0.46 : 0.88;
    if(item.kind === "plant"){
      const plant = new THREE.Mesh(new THREE.ConeGeometry(Math.max(0.16, pxToM(item.w) / 2), hM, 10), mat(item.color || "#4f9a5c", 0.85, 0.5));
      plant.position.set(pxToM(item.x + item.w / 2), yBase + SLAB_H_M + glM + hM / 2, pxToM(item.y + item.h / 2));
      plant.castShadow = true;
      this.root.add(plant);
      return;
    }
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.05, pxToM(item.w)), hM, Math.max(0.05, pxToM(item.h))),
      mat(item.color || "#c9c9d2", alpha, 0.46, layer === "openings")
    );
    mesh.position.set(pxToM(item.x + item.w / 2), yBase + SLAB_H_M + glM + hM / 2, pxToM(item.y + item.h / 2));
    mesh.rotation.y = ((item.rotation || 0) * Math.PI) / 180;
    if(selectedId === item.id){
      mesh.scale.set(1.05, 1.05, 1.05);
      const edge = new THREE.BoxHelper(mesh, new THREE.Color("#286fd6"));
      this.root.add(edge);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
  }

  addStair(item, yBase, selectedId){
    const steps = 8;
    const matStep = mat(item.color || "#d2c5ad", 0.86, 0.48);
    const stepW = pxToM(item.w) / steps;
    for(let i = 0; i < steps; i++){
      const box = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.08, stepW), 0.08 + i * 0.08, Math.max(0.08, pxToM(item.h))), matStep);
      box.position.set(pxToM(item.x) + stepW * (i + 0.5), yBase + SLAB_H_M + (0.08 + i * 0.08) / 2, pxToM(item.y + item.h / 2));
      if(selectedId === item.id) box.scale.y = 1.08;
      box.castShadow = true;
      box.receiveShadow = true;
      this.root.add(box);
    }
  }

  loop(){
    this.resize();
    if(this.needsFrame){
      this.updateCamera();
      this.renderer.render(this.scene, this.camera);
      this.needsFrame = false;
    }
    requestAnimationFrame(this.loop);
  }

  updateCamera(){
    const sinPhi = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + this.radius * sinPhi * Math.cos(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * sinPhi * Math.sin(this.theta)
    );
    this.camera.lookAt(this.target);
  }
}

function mat(color, opacity = 1, roughness = 0.55, transparent = false){
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color || "#dddddd"),
    roughness,
    metalness: 0.02,
    transparent: transparent || opacity < 0.99,
    opacity
  });
}

function addBox(group, x, y, z, w, h, d, material){
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.02, w), Math.max(0.02, h), Math.max(0.02, d)), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function clearGroup(group){
  while(group.children.length){
    const child = group.children.pop();
    child.traverse?.((node) => {
      node.geometry?.dispose?.();
      if(node.material){
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach((material) => material.dispose?.());
      }
    });
  }
}

function outerSegments(frames){
  const sub = 16;
  const cells = new Set();
  frames.forEach((frame) => {
    for(let x = frame.x; x < frame.x + frame.w - 0.1; x += sub){
      for(let y = frame.y; y < frame.y + frame.h - 0.1; y += sub){
        cells.add(`${x},${y}`);
      }
    }
  });
  const hMap = new Map();
  const vMap = new Map();
  const add = (map, key, value) => {
    if(!map.has(key)) map.set(key, new Set());
    map.get(key).add(value);
  };
  cells.forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    if(!cells.has(`${x},${y - sub}`)) add(hMap, y, x);
    if(!cells.has(`${x},${y + sub}`)) add(hMap, y + sub, x);
    if(!cells.has(`${x - sub},${y}`)) add(vMap, x, y);
    if(!cells.has(`${x + sub},${y}`)) add(vMap, x + sub, y);
  });
  const segs = [];
  collectRuns(hMap, true, sub, segs);
  collectRuns(vMap, false, sub, segs);
  return segs;
}

function collectRuns(map, horizontal, sub, segs){
  map.forEach((set, fixed) => {
    const values = [...set].sort((a, b) => a - b);
    let start = null;
    let prev = null;
    values.forEach((value) => {
      if(start === null){ start = value; prev = value; return; }
      if(value === prev + sub){ prev = value; return; }
      segs.push(horizontal ? { x1:start, y1:fixed, x2:prev + sub, y2:fixed } : { x1:fixed, y1:start, x2:fixed, y2:prev + sub });
      start = value;
      prev = value;
    });
    if(start !== null){
      segs.push(horizontal ? { x1:start, y1:fixed, x2:prev + sub, y2:fixed } : { x1:fixed, y1:start, x2:fixed, y2:prev + sub });
    }
  });
}

function splitByOpenings(seg, openings){
  const horizontal = Math.abs(seg.y1 - seg.y2) < 0.1;
  const vertical = Math.abs(seg.x1 - seg.x2) < 0.1;
  if(!horizontal && !vertical) return [seg];
  const lo = horizontal ? Math.min(seg.x1, seg.x2) : Math.min(seg.y1, seg.y2);
  const hi = horizontal ? Math.max(seg.x1, seg.x2) : Math.max(seg.y1, seg.y2);
  const fixed = horizontal ? seg.y1 : seg.x1;
  const cuts = [];
  openings.forEach((opening) => {
    const oh = Math.abs(opening.y1 - opening.y2) < 0.1;
    if(oh !== horizontal) return;
    const ofixed = horizontal ? opening.y1 : opening.x1;
    if(Math.abs(ofixed - fixed) > 10) return;
    const a = horizontal ? Math.min(opening.x1, opening.x2) : Math.min(opening.y1, opening.y2);
    const b = horizontal ? Math.max(opening.x1, opening.x2) : Math.max(opening.y1, opening.y2);
    const s = Math.max(lo, a);
    const e = Math.min(hi, b);
    if(e - s > 2) cuts.push({ s, e });
  });
  cuts.sort((a, b) => a.s - b.s);
  const out = [];
  let cursor = lo;
  cuts.forEach((cut) => {
    if(cut.s - cursor > 1) out.push(makeSeg(seg, horizontal, cursor, cut.s, fixed));
    cursor = Math.max(cursor, cut.e);
  });
  if(hi - cursor > 1) out.push(makeSeg(seg, horizontal, cursor, hi, fixed));
  return out;
}

function makeSeg(base, horizontal, a, b, fixed){
  return horizontal ? { ...base, x1:a, x2:b, y1:fixed, y2:fixed } : { ...base, x1:fixed, x2:fixed, y1:a, y2:b };
}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}
