import * as THREE from "three";
import { pxToM, pxToMm, floorBounds } from "./data.js";
import { FINISHES } from "./defaults.js";

const FLOOR_HEIGHT_M = 2.72;
const WALL_H_M = 2.42;
const SLAB_H_M = 0.16;
const WALL_T_M = 0.11;
const EYE_H_M = 1.5;
const WALK_SPEED_MPS = 2.2;
const WALK_MARGIN_M = 0.22;

export class DetailScene3D {
  constructor(canvas){
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#e8eef4");
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.05, 1000);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.target = new THREE.Vector3(0, 0.8, 0);
    this.theta = Math.PI * 0.24;
    this.phi = 0.95;
    this.radius = 15;
    this.viewMode = "orbit";
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.walk = {
      floor: 0,
      pos: null,
      yaw: 0,
      pitch: 0,
      fov: 72
    };
    this.ui = {};
    this.lastBounds = null;
    this.lastFrameTime = 0;
    this.needsFrame = true;
    this.interacting = false;
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
    this.canvas.tabIndex = 0;
    let dragging = false;
    let last = null;
    const pointers = new Map();
    let pinch = null;
    const pinchDistance = () => {
      const points = [...pointers.values()];
      if(points.length < 2) return 0;
      return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    };
    this.canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.interacting = true;
      this.canvas.focus?.();
      dragging = true;
      last = { x: event.clientX, y: event.clientY };
      if(pointers.size >= 2 && this.viewMode !== "walk"){
        pinch = { distance: pinchDistance(), radius: this.radius };
      }
      try{ this.canvas.setPointerCapture?.(event.pointerId); }catch(_){}
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if(pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if(pinch && pointers.size >= 2 && this.viewMode !== "walk"){
        event.preventDefault();
        const dist = Math.max(20, pinchDistance());
        this.radius = clamp(pinch.radius * (pinch.distance / dist), 2.2, 80);
        this.needsFrame = true;
        return;
      }
      if(!dragging || !last) return;
      event.preventDefault();
      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      if(this.viewMode === "walk"){
        this.walk.yaw -= dx * 0.0045;
        this.walk.pitch = clamp(this.walk.pitch - dy * 0.0038, -1.15, 1.15);
        last = { x: event.clientX, y: event.clientY };
        this.needsFrame = true;
        return;
      }
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
    const stop = (event) => {
      pointers.delete(event.pointerId);
      pinch = pointers.size >= 2 ? { distance: pinchDistance(), radius: this.radius } : null;
      if(pointers.size === 0){ dragging = false; last = null; this.interacting = false; }
      else{
        const point = [...pointers.values()][0];
        last = { x: point.x, y: point.y };
      }
    };
    this.canvas.addEventListener("pointerup", stop);
    this.canvas.addEventListener("pointercancel", stop);
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      if(this.viewMode === "walk"){
        this.walk.fov = clamp(this.walk.fov + (event.deltaY > 0 ? 3 : -3), 42, 92);
        this.camera.fov = this.walk.fov;
        this.camera.updateProjectionMatrix();
      }else{
        this.radius = clamp(this.radius * (event.deltaY > 0 ? 1.08 : 0.92), 2.2, 80);
      }
      this.needsFrame = true;
    }, { passive: false });
    window.addEventListener("keydown", (event) => {
      if(["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.code)){
        this.keys.add(event.code);
        this.needsFrame = true;
      }
    });
    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.code);
      this.needsFrame = true;
    });
  }

  attachWalkUi(ui){
    this.ui = ui || {};
    this.setupStick();
    this.renderRoomWarp();
  }

  setupStick(){
    const stick = this.ui.stick;
    const knob = this.ui.knob;
    if(!stick || !knob) return;
    let active = false;
    const update = (event) => {
      const rect = stick.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = event.clientX - cx;
      let dy = event.clientY - cy;
      const max = rect.width * 0.36;
      const dist = Math.hypot(dx, dy);
      if(dist > max){
        dx = dx / dist * max;
        dy = dy / dist * max;
      }
      this.joy.x = dx / max;
      this.joy.y = dy / max;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.needsFrame = true;
    };
    const reset = () => {
      active = false;
      this.joy = { x: 0, y: 0 };
      knob.style.transform = "translate(-50%,-50%)";
    };
    stick.addEventListener("pointerdown", (event) => {
      if(this.viewMode !== "walk") return;
      active = true;
      stick.setPointerCapture?.(event.pointerId);
      update(event);
    });
    stick.addEventListener("pointermove", (event) => {
      if(active) update(event);
    });
    stick.addEventListener("pointerup", reset);
    stick.addEventListener("pointercancel", reset);
  }

  isWalkMode(){
    return this.viewMode === "walk";
  }

  setWalkMode(on){
    const next = !!on;
    if(next === this.isWalkMode()) return;
    this.viewMode = next ? "walk" : "orbit";
    if(next){
      this.walk.floor = this.currentWalkFloor();
      this.resetWalkPosition();
      this.camera.fov = this.walk.fov;
    }else{
      this.joy = { x: 0, y: 0 };
      if(this.ui.knob) this.ui.knob.style.transform = "translate(-50%,-50%)";
      this.camera.fov = 48;
      this.resetOrbitView();
    }
    this.camera.updateProjectionMatrix();
    this.syncWalkUi();
    this.renderRoomWarp();
    this.needsFrame = true;
    this.ui.onModeChange?.();
  }

  resetView(){
    if(this.isWalkMode()) this.resetWalkPosition();
    else this.resetOrbitView();
    this.needsFrame = true;
  }

  applyPreset(preset){
    if(preset === "interior"){
      this.setWalkMode(true);
      return;
    }
    if(this.isWalkMode()) this.setWalkMode(false);
    const bounds = this.lastBounds;
    if(!bounds) return;
    const centerX = pxToM((bounds.minX + bounds.maxX) / 2);
    const centerZ = pxToM((bounds.minY + bounds.maxY) / 2);
    const diag = Math.hypot(pxToM(bounds.width), pxToM(bounds.height));
    const levels = this.state?.floorMode === "all" ? 2 : 1;
    this.target.set(centerX, levels > 1 ? FLOOR_HEIGHT_M * 0.95 : 0.95, centerZ);
    if(preset === "top"){
      this.theta = -Math.PI / 2;
      this.phi = 0.18;
      this.radius = clamp(diag * 1.2 + 4, 8, 48);
    }else{
      this.theta = Math.PI * 0.19;
      this.phi = 0.92;
      this.radius = clamp(diag * 1.35 + 5, 9, 52);
    }
    this.needsFrame = true;
  }

  resetOrbitView(){
    const bounds = this.lastBounds;
    if(!bounds) return;
    const centerX = pxToM((bounds.minX + bounds.maxX) / 2);
    const centerZ = pxToM((bounds.minY + bounds.maxY) / 2);
    const diag = Math.hypot(pxToM(bounds.width), pxToM(bounds.height));
    const levels = this.state?.floorMode === "all" ? 2 : 1;
    this.target.set(centerX, levels > 1 ? FLOOR_HEIGHT_M * 0.85 : 0.85, centerZ);
    this.radius = clamp(diag * 1.18 + 3.5, 7, 44);
    this.theta = Math.PI * 0.23;
    this.phi = 1.02;
  }

  syncWalkUi(){
    this.ui.stage?.classList.toggle("walking", this.isWalkMode());
  }

  currentWalkFloor(){
    const floorMode = this.state?.floorMode;
    if(floorMode === "1") return 1;
    return 0;
  }

  resetWalkPosition(){
    this.walk.floor = this.currentWalkFloor();
    this.walk.pos = this.walkStartPos();
    this.walk.yaw = this.bestWalkYaw(this.walk.pos);
    this.walk.pitch = 0;
  }

  walkStartPos(){
    const floor = this.state?.plan?.floors?.[this.walk.floor] || this.state?.plan?.floors?.[0];
    const items = floor?.items || [];
    const rooms = items.filter((item) => item.type === "room" && !item.void);
    let best = null;
    rooms.forEach((room) => {
      if(!best || room.w * room.h > best.w * best.h) best = room;
    });
    if(!best){
      const frames = items.filter((item) => item.type === "frame");
      best = frames[0] || { x: -160, y: -160, w: 320, h: 320 };
    }
    return { x: pxToM(best.x + best.w / 2), z: pxToM(best.y + best.h / 2) };
  }

  renderRoomWarp(){
    const wrap = this.ui.roomWarp;
    if(!wrap || !this.state?.plan) return;
    const floor = this.state.plan.floors[this.currentWalkFloor()] || this.state.plan.floors[0];
    const rooms = (floor?.items || []).filter((item) => item.type === "room" && !item.void);
    wrap.innerHTML = "";
    rooms.slice(0, 14).forEach((room) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = room.label || "部屋";
      button.addEventListener("click", () => {
        this.setWalkMode(true);
        this.walk.floor = this.currentWalkFloor();
        this.walk.pos = { x: pxToM(room.x + room.w / 2), z: pxToM(room.y + room.h / 2) };
        this.walk.yaw = this.bestWalkYaw(this.walk.pos);
        this.walk.pitch = 0;
        this.needsFrame = true;
      });
      wrap.appendChild(button);
    });
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
    const bounds = sceneBounds(plan, design, floorMode, layers, 96);
    this.lastBounds = bounds;
    if(layers.site) this.buildExterior(bounds, design);
    const floorIndexes = floorMode === "all" ? plan.floors.map((_, index) => index) : [Number(floorMode || 0)];
    let roofSource = null;
    floorIndexes.forEach((floorIndex) => {
      const floor = plan.floors[floorIndex];
      if(!floor) return;
      const yBase = floorMode === "all" ? floorIndex * FLOOR_HEIGHT_M : 0;
      this.buildFloor(floor, floorIndex, yBase, design, layers, selectedId);
      const frames = (floor.items || []).filter((item) => item.type === "frame");
      if(frames.length) roofSource = { frames, yBase };
    });
    if(!this.isWalkMode() && floorMode === "all" && layers.walls && roofSource){
      this.buildRoof(roofSource.frames, roofSource.yBase);
    }
    if(this.isWalkMode()){
      const nextFloor = this.currentWalkFloor();
      const changedFloor = this.walk.floor !== nextFloor;
      this.walk.floor = nextFloor;
      if(changedFloor || !this.walk.pos || !this.insideWalkArea(this.walk.pos.x, this.walk.pos.z, WALK_MARGIN_M)){
        this.resetWalkPosition();
      }
    }else{
      this.resetOrbitView();
    }
    if(this.sun){
      const centerX = pxToM((bounds.minX + bounds.maxX) / 2);
      const centerZ = pxToM((bounds.minY + bounds.maxY) / 2);
      this.sun.position.set(centerX + 8, 14, centerZ + 7);
      this.sun.target.position.set(centerX, 0, centerZ);
      this.scene.add(this.sun.target);
    }
    this.syncWalkUi();
    this.renderRoomWarp();
  }

  buildExterior(bounds, design){
    const ext = design.exterior || {};
    const site = (design.customItems || []).find((item) => item.layer === "exterior" && item.kind === "site");
    if(!site) return;
    const x = pxToM(site.x);
    const z = pxToM(site.y);
    const w = pxToM(site.w);
    const d = pxToM(site.h);
    if(w <= 0 || d <= 0) return;

    if(ext.fence){
      const fenceMat = mat("#9b7a55", 0.82, 0.42);
      addBox(this.root, x + w / 2, 0.45, z, w, 0.9, 0.07, fenceMat);
      addBox(this.root, x + w / 2, 0.45, z + d, w, 0.9, 0.07, fenceMat);
      addBox(this.root, x, 0.45, z + d / 2, 0.07, 0.9, d, fenceMat);
      addBox(this.root, x + w, 0.45, z + d / 2, 0.07, 0.9, d, fenceMat);
    }
  }

  addCeiling(frames, yBase){
    const ceilingMat = mat("#f0eee8", 0.98, 0.72);
    frames.forEach((frame) => {
      const ceiling = addBox(
        this.root,
        pxToM(frame.x + frame.w / 2),
        yBase + SLAB_H_M + WALL_H_M - 0.015,
        pxToM(frame.y + frame.h / 2),
        Math.max(0.03, pxToM(frame.w)),
        0.035,
        Math.max(0.03, pxToM(frame.h)),
        ceilingMat
      );
      ceiling.castShadow = false;
    });
  }

  buildRoof(frames, yBase){
    if(!frames.length) return;
    const roofMat = mat("#242a2d", 1, 0.48);
    const panelMat = mat("#111a22", 0.98, 0.32);
    const edgeMat = mat("#1d2020", 1, 0.44);
    roofMat.side = THREE.DoubleSide;
    panelMat.side = THREE.DoubleSide;
    const bounds = frameBounds(frames);
    const eave = 0.28;
    const top = yBase + SLAB_H_M + WALL_H_M + 0.03;
    const x0 = pxToM(bounds.minX) - eave;
    const x1 = pxToM(bounds.maxX) + eave;
    const z0 = pxToM(bounds.minY) - eave;
    const z1 = pxToM(bounds.maxY) + eave;
    const w = Math.max(0.4, x1 - x0);
    const d = Math.max(0.4, z1 - z0);
    const rise = clamp(Math.min(w, d) * 0.075, 0.26, 0.58);
    const yAt = (z) => top + ((z - z0) / Math.max(0.001, z1 - z0)) * rise;
    addRoofPlane(this.root, [[x0, yAt(z0), z0], [x0, yAt(z1), z1], [x1, yAt(z1), z1], [x1, yAt(z0), z0]], roofMat);
    addBox(this.root, (x0 + x1) / 2, yAt(z0) - 0.035, z0, w, 0.12, 0.08, edgeMat);
    addBox(this.root, (x0 + x1) / 2, yAt(z1) - 0.035, z1, w, 0.12, 0.08, edgeMat);
    addBox(this.root, x0, top + rise / 2 - 0.035, (z0 + z1) / 2, 0.08, 0.12, d, edgeMat);
    addBox(this.root, x1, top + rise / 2 - 0.035, (z0 + z1) / 2, 0.08, 0.12, d, edgeMat);

    const pad = 0.42;
    const gap = 0.045;
    const cols = clamp(Math.floor((w - pad * 2) / 1.08), 2, 8);
    const rows = clamp(Math.floor((d - pad * 2) / 0.82), 2, 5);
    const panelW = (w - pad * 2 - gap * (cols - 1)) / cols;
    const panelD = (d - pad * 2 - gap * (rows - 1)) / rows;
    if(panelW > 0.2 && panelD > 0.2){
      for(let row = 0; row < rows; row++){
        for(let col = 0; col < cols; col++){
          const xa = x0 + pad + col * (panelW + gap);
          const xb = xa + panelW;
          const za = z0 + pad + row * (panelD + gap);
          const zb = za + panelD;
          const lift = 0.018;
          addRoofPlane(this.root, [
            [xa, yAt(za) + lift, za],
            [xa, yAt(zb) + lift, zb],
            [xb, yAt(zb) + lift, zb],
            [xb, yAt(za) + lift, za]
          ], panelMat);
        }
      }
    }
  }

  buildFloor(floor, floorIndex, yBase, design, layers, selectedId){
    const items = floor.items || [];
    const rooms = items.filter((item) => item.type === "room" && !item.void);
    const frames = items.filter((item) => item.type === "frame");
    const openings = items.filter((item) => item.type === "opening");
    const doorOpenings = openings.filter((item) => item.kind !== "window");
    const wallLines = items.filter((item) => item.type === "wallLine");
    const existingFurniture = items.filter((item) => item.type === "furn" || item.type === "stair");
    if(layers.rooms){
      rooms.forEach((room, index) => this.addRoom(room, floorIndex, yBase, design, selectedId, index));
    }else{
      frames.forEach((frame) => {
        addBox(this.root, pxToM(frame.x + frame.w / 2), yBase, pxToM(frame.y + frame.h / 2), pxToM(frame.w), 0.035, pxToM(frame.h), mat("#e8e3d8", 0.92, 0.54));
      });
    }
    if(this.isWalkMode() && layers.rooms){
      this.addCeiling(frames, yBase);
    }
    if(layers.walls){
      const wallMat = mat(design.exterior?.wallColor || "#f5f1e9", 0.96, 0.68);
      const outer = outerSegments(frames);
      outer.forEach((seg) => splitByOpenings(seg, doorOpenings).forEach((solid) => this.addWall(solid, yBase, wallMat, WALL_T_M)));
      if(!this.isWalkMode() && floorIndex > 0) this.addFloorJointCover(outer, yBase, wallMat);
      const stairs = existingFurniture.filter(isStructuralStair3d);
      wallLines.forEach((wall) => {
        const thickness = Math.max(WALL_T_M, pxToM(wall.thick || 6));
        splitByOpenings(wall, doorOpenings).forEach((solid) => {
          stairWallSlices3d(solid, stairs, yBase, thickness).forEach((slice) => {
            this.addWallSlice(slice.seg, slice.y0, slice.y1, wallMat, thickness);
          });
        });
      });
    }
    if(layers.openings){
      openings.forEach((opening) => this.addOpening(opening, yBase, selectedId));
    }
    existingFurniture.forEach((item) => {
      if(isStructuralStair3d(item)) this.addStair(item, yBase, selectedId);
      else if(layers.guideFurniture) this.addFurnitureBox(item, floorIndex, yBase, selectedId, true);
    });
    (design.customItems || [])
      .filter((item) => item.floorIndex === floorIndex)
      .filter((item) => sceneItemVisible(item, layers))
      .forEach((item) => this.addFurnitureBox(item, floorIndex, yBase, selectedId, false));
  }

  addRoom(room, floorIndex, yBase, design, selectedId, index){
    const finish = design.finishes?.[room.id] || {};
    const floorDef = FINISHES.floor.find((item) => item.id === finish.floor);
    const color = floorDef?.color || room.color || "#efe1bf";
    const height = selectedId === room.id ? 0.09 : 0.045;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.03, pxToM(room.w)), height, Math.max(0.03, pxToM(room.h))),
      floorMaterial(floorDef?.id || finish.floor || "oak", color)
    );
    mesh.position.set(pxToM(room.x + room.w / 2), yBase + height / 2 + index * 0.002, pxToM(room.y + room.h / 2));
    mesh.receiveShadow = true;
    this.root.add(mesh);
  }

  addWall(seg, yBase, material, thickness){
    this.addWallSlice(seg, yBase + SLAB_H_M, yBase + SLAB_H_M + WALL_H_M, material, thickness);
  }

  addWallSlice(seg, bottom, top, material, thickness){
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const len = Math.hypot(dx, dy);
    const height = top - bottom;
    if(len < 1 || height < 0.01) return;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(pxToM(len), height, thickness), material);
    wall.position.set(pxToM((seg.x1 + seg.x2) / 2), bottom + height / 2, pxToM((seg.y1 + seg.y2) / 2));
    wall.rotation.y = -Math.atan2(dy, dx);
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.root.add(wall);
    if(this.isWalkMode()){
      const trim = new THREE.Mesh(new THREE.BoxGeometry(pxToM(len), 0.07, thickness + 0.035), mat("#b79a74", 0.95, 0.48));
      trim.position.set(pxToM((seg.x1 + seg.x2) / 2), bottom + 0.07, pxToM((seg.y1 + seg.y2) / 2));
      trim.rotation.y = wall.rotation.y;
      trim.castShadow = true;
      trim.receiveShadow = true;
      this.root.add(trim);
    }
  }

  addFloorJointCover(segments, yBase, material){
    const bottom = yBase - 0.16;
    const top = yBase + SLAB_H_M + 0.04;
    const height = top - bottom;
    segments.forEach((seg) => this.addWallBand(seg, bottom + height / 2, height, WALL_T_M + 0.035, material));
  }

  addWallBand(seg, centerY, height, thickness, material){
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const len = Math.hypot(dx, dy);
    if(len < 1) return;
    const band = new THREE.Mesh(new THREE.BoxGeometry(pxToM(len), height, thickness), material);
    band.position.set(pxToM((seg.x1 + seg.x2) / 2), centerY, pxToM((seg.y1 + seg.y2) / 2));
    band.rotation.y = -Math.atan2(dy, dx);
    band.castShadow = true;
    band.receiveShadow = true;
    this.root.add(band);
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
    const angle = -Math.atan2(dy, dx);
    const offset = isWindow ? 0.065 : 0;
    const normalX = Math.sin(angle);
    const normalZ = Math.cos(angle);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(len, height, isWindow ? 0.035 : 0.055), material);
    panel.position.set(
      pxToM((opening.x1 + opening.x2) / 2) + normalX * offset,
      yBase + SLAB_H_M + bottom + height / 2,
      pxToM((opening.y1 + opening.y2) / 2) + normalZ * offset
    );
    panel.rotation.y = angle;
    if(selectedId === opening.id) panel.scale.y = 1.08;
    this.root.add(panel);
  }

  addFurnitureBox(item, floorIndex, yBase, selectedId, existing){
    const hM = existing ? Math.max(0.08, Number(item.fh || 700) / 1000) : Math.max(0.08, Number(item.heightMm || 700) / 1000);
    const glM = existing ? Math.max(0, Number(item.gl || 0) / 1000) : Math.max(0, Number(item.glMm || 0) / 1000);
    const layer = existing ? "furniture" : item.layer;
    const alpha = layer === "openings" ? 0.46 : 0.88;
    if(!existing && Array.isArray(item.modelParts) && item.modelParts.length){
      this.addCustomModel(item, yBase, selectedId);
      return;
    }
    if(!existing && item.layer === "exterior"){
      this.addExteriorCustom(item, yBase, selectedId);
      return;
    }
    if(item.kind === "plant"){
      const plant = new THREE.Mesh(new THREE.ConeGeometry(Math.max(0.16, pxToM(item.w) / 2), hM, 10), mat(item.color || "#4f9a5c", 0.85, 0.5));
      plant.position.set(pxToM(item.x + item.w / 2), yBase + SLAB_H_M + glM + hM / 2, pxToM(item.y + item.h / 2));
      plant.castShadow = true;
      this.root.add(plant);
      return;
    }
    if(!existing && item.kind === "downlight"){
      const light = new THREE.Mesh(
        new THREE.CylinderGeometry(Math.max(0.045, pxToM(item.w) / 2), Math.max(0.045, pxToM(item.w) / 2), hM, 24),
        mat(item.color || "#fff3b0", 0.96, 0.3)
      );
      light.position.set(pxToM(item.x + item.w / 2), yBase + SLAB_H_M + glM + hM / 2, pxToM(item.y + item.h / 2));
      light.castShadow = true;
      this.root.add(light);
      return;
    }
    if(!existing && item.kind === "pendantLight"){
      const group = new THREE.Group();
      group.position.set(pxToM(item.x + item.w / 2), yBase + SLAB_H_M + glM, pxToM(item.y + item.h / 2));
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, Math.max(0.12, hM * 0.65), 10), mat("#44443f", 1, 0.4));
      cord.position.y = hM * 0.66;
      const shade = new THREE.Mesh(new THREE.ConeGeometry(Math.max(0.08, pxToM(item.w) / 2), Math.max(0.1, hM * 0.35), 24, 1, true), mat(item.color || "#e2c680", 0.92, 0.4));
      shade.position.y = hM * 0.18;
      group.add(cord, shade);
      this.root.add(group);
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

  addCustomModel(item, yBase, selectedId){
    const parts = normalizeModelParts3d(item.modelParts);
    const size = modelSizeFromParts3d(parts);
    const scaleX = (pxToMm(item.w) / Math.max(1, size.w));
    const scaleZ = (pxToMm(item.h) / Math.max(1, size.d));
    const scaleY = Math.max(0.01, Number(item.heightMm || size.h) / Math.max(1, size.h));
    const glM = Math.max(0, Number(item.glMm || 0) / 1000);
    const group = new THREE.Group();
    group.position.set(pxToM(item.x + item.w / 2), yBase + SLAB_H_M + glM, pxToM(item.y + item.h / 2));
    group.rotation.y = ((item.rotation || 0) * Math.PI) / 180;
    parts.forEach((part) => {
      const material = mat(part.color || item.color || "#b9c0c8", 0.9, 0.48);
      const w = Math.max(0.03, (part.wMm * scaleX) / 1000);
      const d = Math.max(0.03, (part.dMm * scaleZ) / 1000);
      const h = Math.max(0.03, (part.hMm * scaleY) / 1000);
      let mesh;
      if(part.type === "cylinder"){
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 24), material);
        mesh.scale.set(w, h, d);
      }else if(part.type === "sphere"){
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), material);
        mesh.scale.set(w, h, d);
      }else{
        mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      }
      mesh.position.set(((part.xMm - size.centerX) * scaleX) / 1000, (part.zMm * scaleY) / 1000 + h / 2, ((part.yMm - size.centerY) * scaleZ) / 1000);
      mesh.rotation.y = ((part.rotation || 0) * Math.PI) / 180;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
    this.root.add(group);
    if(selectedId === item.id){
      const edge = new THREE.BoxHelper(group, new THREE.Color("#286fd6"));
      this.root.add(edge);
    }
  }

  addExteriorCustom(item, yBase, selectedId){
    const w = Math.max(0.05, pxToM(item.w));
    const d = Math.max(0.05, pxToM(item.h));
    const h = Math.max(0.03, Number(item.heightMm || 80) / 1000);
    const x = pxToM(item.x + item.w / 2);
    const z = pxToM(item.y + item.h / 2);
    const selected = selectedId === item.id;
    if(item.kind === "tree" || item.kind === "plant"){
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, Math.max(0.7, h * 0.42), 8), mat("#7d5a39", 0.9, 0.5));
      trunk.position.set(x, yBase + 0.35, z);
      trunk.castShadow = true;
      this.root.add(trunk);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.3, Math.min(w, d) / 2), 14, 10), mat(item.color || "#3f7e49", 0.86, 0.6));
      crown.position.set(x, yBase + Math.max(0.9, h * 0.62), z);
      crown.castShadow = true;
      this.root.add(crown);
      return;
    }
    if(item.kind === "site"){
      const site = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, d), mat(item.color || "#dfeadb", 0.32, 0.7, true));
      site.position.set(x, yBase - 0.05, z);
      site.receiveShadow = true;
      this.root.add(site);
      const edge = new THREE.BoxHelper(site, new THREE.Color(selected ? "#286fd6" : "#59764d"));
      this.root.add(edge);
      return;
    }
    if(item.kind === "car"){
      this.addCarModel(x, yBase, z, w, d, h, item, selected);
      return;
    }
    if(item.kind === "carport"){
      this.addCarportModel(x, yBase, z, w, d, h, item, selected);
      return;
    }
    if(item.kind === "porchStep"){
      this.addPorchStepModel(x, yBase, z, w, d, h, item, selected);
      return;
    }
    if(item.kind === "frontDoor"){
      this.addFrontDoorModel(x, yBase, z, w, d, h, item, selected);
      return;
    }
    const flatKinds = new Set(["parking", "driveway", "approach", "deck", "garden"]);
    const meshH = flatKinds.has(item.kind) ? Math.min(h, 0.22) : h;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, meshH, d), mat(item.color || "#c9c9d2", item.kind === "garden" ? 0.86 : 0.78, 0.52, item.kind === "parking"));
    mesh.position.set(x, yBase + meshH / 2, z);
    mesh.rotation.y = ((item.rotation || 0) * Math.PI) / 180;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    if(selected){
      const edge = new THREE.BoxHelper(mesh, new THREE.Color("#286fd6"));
      this.root.add(edge);
    }
  }

  addCarModel(x, yBase, z, w, d, h, item, selected){
    const group = new THREE.Group();
    group.position.set(x, yBase, z);
    group.rotation.y = ((item.rotation || 0) * Math.PI) / 180;
    const bodyMat = mat(item.color || "#586169", 0.72, 0.42);
    const glassMat = mat("#7faec3", 0.46, 0.22, true);
    const tireMat = mat("#202422", 0.78, 0.36);
    const bodyH = Math.max(0.36, h * 0.38);
    const cabinH = Math.max(0.34, h * 0.32);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, bodyH, d * 0.74), bodyMat);
    body.position.set(0, 0.22 + bodyH / 2, 0);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(w * 0.76, bodyH * 0.62, d * 0.34), bodyMat);
    hood.position.set(0, 0.28 + bodyH * 0.31, -d * 0.34);
    hood.castShadow = true;
    group.add(hood);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, cabinH, d * 0.34), glassMat);
    cabin.position.set(0, 0.34 + bodyH + cabinH / 2, d * 0.03);
    cabin.castShadow = true;
    group.add(cabin);
    const wheelGeo = new THREE.CylinderGeometry(Math.max(0.14, w * 0.09), Math.max(0.14, w * 0.09), Math.max(0.12, w * 0.12), 18);
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx, sz]) => {
      const wheel = new THREE.Mesh(wheelGeo, tireMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * w * 0.42, 0.24, sz * d * 0.28);
      wheel.castShadow = true;
      group.add(wheel);
    });
    if(selected){
      const box = new THREE.BoxHelper(group, new THREE.Color("#286fd6"));
      group.add(box);
    }
    this.root.add(group);
  }

  addCarportModel(x, yBase, z, w, d, h, item, selected){
    const group = new THREE.Group();
    group.position.set(x, yBase, z);
    group.rotation.y = ((item.rotation || 0) * Math.PI) / 180;
    const frameMat = mat(item.color || "#9aa4aa", 0.62, 0.38);
    const roofMat = mat("#dce7ee", 0.46, 0.24, true);
    const postR = Math.max(0.045, Math.min(w, d) * 0.018);
    const roofH = Math.max(0.08, h * 0.035);
    const postH = Math.max(1.9, h - roofH);
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx, sz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, postH, 10), frameMat);
      post.position.set(sx * w * 0.42, postH / 2, sz * d * 0.42);
      post.castShadow = true;
      group.add(post);
    });
    const beamD = Math.max(0.08, d * 0.025);
    const beamW = Math.max(0.08, w * 0.025);
    [-1, 1].forEach((sz) => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, beamD, beamD), frameMat);
      beam.position.set(0, postH, sz * d * 0.42);
      beam.castShadow = true;
      group.add(beam);
    });
    [-1, 1].forEach((sx) => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(beamW, beamD, d * 0.92), frameMat);
      beam.position.set(sx * w * 0.42, postH, 0);
      beam.castShadow = true;
      group.add(beam);
    });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w, roofH, d), roofMat);
    roof.position.set(0, postH + roofH / 2, 0);
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);
    if(selected){
      const box = new THREE.BoxHelper(group, new THREE.Color("#286fd6"));
      group.add(box);
    }
    this.root.add(group);
  }

  addPorchStepModel(x, yBase, z, w, d, h, item, selected){
    const group = new THREE.Group();
    group.position.set(x, yBase, z);
    group.rotation.y = ((item.rotation || 0) * Math.PI) / 180;
    const stepMat = mat(item.color || "#cfc7bb", 0.9, 0.42);
    const edgeMat = mat("#8d867c", 0.88, 0.5);
    const steps = 3;
    for(let i = 0; i < steps; i++){
      const depth = d * ((i + 1) / steps);
      const height = Math.max(0.08, h * ((i + 1) / steps));
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, depth), stepMat);
      mesh.position.set(0, height / 2, d / 2 - depth / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      const nosing = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, 0.04), edgeMat);
      nosing.position.set(0, height + 0.014, d / 2 - depth);
      nosing.castShadow = true;
      group.add(nosing);
    }
    if(selected) group.add(new THREE.BoxHelper(group, new THREE.Color("#286fd6")));
    this.root.add(group);
  }

  addFrontDoorModel(x, yBase, z, w, d, h, item, selected){
    const group = new THREE.Group();
    group.position.set(x, yBase, z);
    group.rotation.y = ((item.rotation || 0) * Math.PI) / 180;
    const doorMat = mat(item.color || "#7b5637", 0.9, 0.45);
    const frameMat = mat("#33251d", 0.92, 0.36);
    const handleMat = mat("#d7b24b", 0.95, 0.28);
    const door = new THREE.Mesh(new THREE.BoxGeometry(w, h, Math.max(0.04, d)), doorMat);
    door.position.set(0, h / 2, 0);
    door.castShadow = true;
    door.receiveShadow = true;
    group.add(door);
    const frameT = Math.max(0.035, w * 0.045);
    [
      [-w / 2 - frameT / 2, h / 2, 0, frameT, h + frameT, d * 1.25],
      [w / 2 + frameT / 2, h / 2, 0, frameT, h + frameT, d * 1.25],
      [0, h + frameT / 2, 0, w + frameT * 2, frameT, d * 1.25]
    ].forEach(([cx, cy, cz, bw, bh, bd]) => {
      const part = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, Math.max(0.05, bd)), frameMat);
      part.position.set(cx, cy, cz);
      part.castShadow = true;
      group.add(part);
    });
    const handle = new THREE.Mesh(new THREE.BoxGeometry(w * 0.08, h * 0.035, d * 1.7), handleMat);
    handle.position.set(w * 0.28, h * 0.52, -d * 0.62);
    handle.castShadow = true;
    group.add(handle);
    if(selected) group.add(new THREE.BoxHelper(group, new THREE.Color("#286fd6")));
    this.root.add(group);
  }

  addStair(item, yBase, selectedId){
    const swap = item.dir === 1 || item.dir === 3;
    const localW = swap ? item.h : item.w;
    const localD = swap ? item.w : item.h;
    const info = stairTreads3d(localW, localD, item.shape || "straight", item.winders || 3, !!item.mirror);
    const totalRise = Math.max(1.8, Number(item.fh || 3000) / 1000);
    const stepRise = totalRise / Math.max(1, info.treads.length);
    const board = clamp(stepRise * 0.72, 0.045, 0.16);
    const material = mat(item.color || "#d2c5ad", 0.94, 0.5);
    const group = new THREE.Group();
    info.treads.forEach((tread, index) => {
      const points = tread.poly.map((point) => {
        const lx = swap ? point[1] : point[0];
        const ly = swap ? point[0] : point[1];
        const world = stairPoint3d(item, lx, ly);
        return [pxToM(world[0]), pxToM(world[1])];
      });
      const top = yBase + SLAB_H_M + stepRise * (index + 1);
      const mesh = treadPrism3d(points, top - board, top, material);
      if(mesh) group.add(mesh);
    });
    if(selectedId === item.id) group.add(new THREE.BoxHelper(group, new THREE.Color("#286fd6")));
    this.root.add(group);
  }

  walkBaseY(){
    return (this.state?.floorMode === "all" ? this.walk.floor * FLOOR_HEIGHT_M : 0) + SLAB_H_M;
  }

  walkFrames(){
    const floor = this.state?.plan?.floors?.[this.walk.floor] || this.state?.plan?.floors?.[0];
    return (floor?.items || []).filter((item) => item.type === "frame");
  }

  walkItems(){
    const floor = this.state?.plan?.floors?.[this.walk.floor] || this.state?.plan?.floors?.[0];
    return floor?.items || [];
  }

  walkBlockingSegments(){
    const items = this.walkItems();
    const openings = items.filter((item) => item.type === "opening" && item.kind !== "window");
    return items
      .filter((item) => item.type === "wallLine")
      .flatMap((wall) => splitByOpenings(wall, openings).map((seg) => ({
        x1: pxToM(seg.x1),
        z1: pxToM(seg.y1),
        x2: pxToM(seg.x2),
        z2: pxToM(seg.y2),
        t: Math.max(WALL_T_M, pxToM(wall.thick || 6))
      })));
  }

  insideWalkFrames(xM, zM, marginM){
    const frames = this.walkFrames();
    if(!frames.length) return true;
    const x = mToPx(xM);
    const z = mToPx(zM);
    const margin = mToPx(marginM);
    return frames.some((frame) => (
      x >= frame.x + margin &&
      x <= frame.x + frame.w - margin &&
      z >= frame.y + margin &&
      z <= frame.y + frame.h - margin
    ));
  }

  insideWalkArea(xM, zM, marginM){
    if(!this.insideWalkFrames(xM, zM, marginM)) return false;
    return !this.walkBlockingSegments().some((seg) => (
      pointSegmentDistance(xM, zM, seg.x1, seg.z1, seg.x2, seg.z2) < marginM + seg.t / 2
    ));
  }

  bestWalkYaw(pos){
    if(!pos) return this.theta + Math.PI;
    const candidates = [0, Math.PI / 2, Math.PI, -Math.PI / 2, this.theta + Math.PI];
    let best = candidates[0];
    let bestScore = -Infinity;
    candidates.forEach((yaw) => {
      const score = this.walkRayDistance(pos, yaw);
      if(score > bestScore){
        bestScore = score;
        best = yaw;
      }
    });
    return best;
  }

  walkRayDistance(pos, yaw){
    const dx = Math.sin(yaw);
    const dz = -Math.cos(yaw);
    const step = 0.18;
    let dist = 0;
    for(let i = 1; i <= 90; i++){
      const next = i * step;
      if(!this.insideWalkArea(pos.x + dx * next, pos.z + dz * next, WALK_MARGIN_M)) break;
      dist = next;
    }
    return dist;
  }

  updateWalk(dt){
    if(!this.walk.pos) this.resetWalkPosition();
    let forward = 0;
    let side = 0;
    if(this.keys.has("KeyW") || this.keys.has("ArrowUp")) forward += 1;
    if(this.keys.has("KeyS") || this.keys.has("ArrowDown")) forward -= 1;
    if(this.keys.has("KeyD") || this.keys.has("ArrowRight")) side += 1;
    if(this.keys.has("KeyA") || this.keys.has("ArrowLeft")) side -= 1;
    side += this.joy.x;
    forward += -this.joy.y;
    const len = Math.hypot(side, forward);
    if(len > 1){
      side /= len;
      forward /= len;
    }
    const fx = Math.sin(this.walk.yaw);
    const fz = -Math.cos(this.walk.yaw);
    const rx = Math.cos(this.walk.yaw);
    const rz = Math.sin(this.walk.yaw);
    const step = WALK_SPEED_MPS * Math.min(dt, 0.05);
    const dx = (fx * forward + rx * side) * step;
    const dz = (fz * forward + rz * side) * step;
    const nx = this.walk.pos.x + dx;
    const nz = this.walk.pos.z + dz;
    if(this.insideWalkArea(nx, this.walk.pos.z, WALK_MARGIN_M)) this.walk.pos.x = nx;
    if(this.insideWalkArea(this.walk.pos.x, nz, WALK_MARGIN_M)) this.walk.pos.z = nz;
    this.updateWalkCamera();
  }

  updateWalkCamera(){
    if(!this.walk.pos) return;
    const eye = this.walkBaseY() + EYE_H_M;
    const cp = Math.cos(this.walk.pitch);
    this.camera.position.set(this.walk.pos.x, eye, this.walk.pos.z);
    this.camera.lookAt(
      this.walk.pos.x + cp * Math.sin(this.walk.yaw),
      eye + Math.sin(this.walk.pitch),
      this.walk.pos.z - cp * Math.cos(this.walk.yaw)
    );
  }

  loop(){
    this.resize();
    const now = performance.now();
    const dt = this.lastFrameTime ? (now - this.lastFrameTime) / 1000 : 0.016;
    this.lastFrameTime = now;
    if(this.isWalkMode()){
      this.updateWalk(dt);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(this.loop);
      return;
    }
    if(this.needsFrame || this.interacting){
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

function addRoofPlane(group, points, material){
  const geometry = new THREE.BufferGeometry();
  const verts = [
    ...points[0], ...points[1], ...points[2],
    ...points[0], ...points[2], ...points[3]
  ];
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function isStructuralStair3d(item){
  return !!item && (item.type === "stair" || (item.type === "furn" && /(?:^階段|直線階段|かね折れ階段)/.test(item.label || "")));
}

function stairTreads3d(w, h, shape, winders, mirror){
  const treads = [];
  const mx = (x) => mirror ? w - x : x;
  const stepDepth = 235 / Math.max(0.001, pxToMm(1));
  if(shape !== "kane"){
    const count = Math.max(3, Math.round(h / stepDepth));
    for(let index = 0; index < count; index++){
      const y0 = h - h * (index + 1) / count;
      const y1 = h - h * index / count;
      treads.push({ poly:[[0, y0], [w, y0], [w, y1], [0, y1]] });
    }
    return { treads };
  }
  const winderCount = clamp(Math.round(winders || 3), 2, 5);
  const cornerSize = Math.min(h, w * 0.45);
  for(let index = 0; index < winderCount; index++){
    const a0 = -Math.PI / 2 + Math.PI / 2 * index / winderCount;
    const a1 = -Math.PI / 2 + Math.PI / 2 * (index + 1) / winderCount;
    const radius = Math.max(cornerSize, h);
    const clippedPoint = (angle) => [
      clamp(Math.cos(angle) * radius, 0, cornerSize),
      clamp(h + Math.sin(angle) * radius, 0, h)
    ];
    const p1 = clippedPoint(a0);
    const p2 = clippedPoint(a1);
    treads.push({ poly:[[mx(0), h], [mx(p1[0]), p1[1]], [mx(p2[0]), p2[1]], [mx(cornerSize), h]] });
  }
  const available = Math.max(0, w - cornerSize);
  const count = Math.max(2, Math.round(available / stepDepth));
  for(let index = 0; index < count; index++){
    const x0 = cornerSize + available * index / count;
    const x1 = cornerSize + available * (index + 1) / count;
    const a = mx(x0), b = mx(x1);
    treads.push({ poly:[[Math.min(a, b), 0], [Math.max(a, b), 0], [Math.max(a, b), h], [Math.min(a, b), h]] });
  }
  return { treads };
}

function stairPoint3d(item, lx, ly){
  const w = item.w;
  const h = item.h;
  const direction = item.dir || 0;
  let rx;
  let ry;
  if(direction === 0){ rx = lx; ry = ly; }
  else if(direction === 1){ rx = h - ly; ry = lx; }
  else if(direction === 2){ rx = w - lx; ry = h - ly; }
  else { rx = ly; ry = w - lx; }
  return [item.x + rx, item.y + ry];
}

function treadPrism3d(points, y0, y1, material){
  if(!Array.isArray(points) || points.length < 3 || y1 <= y0) return null;
  const contour = points.map((point) => new THREE.Vector2(point[0], point[1]));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  const vertices = [];
  const push = (point, y) => vertices.push(point[0], y, point[1]);
  triangles.forEach(([a, b, c]) => {
    push(points[a], y1); push(points[c], y1); push(points[b], y1);
    push(points[a], y0); push(points[b], y0); push(points[c], y0);
  });
  for(let index = 0; index < points.length; index++){
    const a = points[index];
    const b = points[(index + 1) % points.length];
    push(a, y0); push(b, y0); push(b, y1);
    push(a, y0); push(b, y1); push(a, y1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function clipPolyHalfPlane3d(poly, axis, limit, keepGreater){
  const out = [];
  if(!Array.isArray(poly) || !poly.length) return out;
  const inside = (point) => keepGreater ? point[axis] >= limit - 0.001 : point[axis] <= limit + 0.001;
  for(let index = 0; index < poly.length; index++){
    const a = poly[index];
    const b = poly[(index + 1) % poly.length];
    const aIn = inside(a), bIn = inside(b);
    if(aIn) out.push(a);
    if(aIn === bIn) continue;
    const delta = b[axis] - a[axis];
    if(Math.abs(delta) < 0.0001) continue;
    const ratio = (limit - a[axis]) / delta;
    out.push([a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio]);
  }
  return out;
}

function stairWallSlices3d(seg, stairs, yBase, thicknessM){
  const horizontal = Math.abs(seg.y2 - seg.y1) < 0.1;
  const vertical = Math.abs(seg.x2 - seg.x1) < 0.1;
  const bottom = yBase + SLAB_H_M;
  const top = bottom + WALL_H_M;
  if(!horizontal && !vertical) return [{ seg, y0:bottom, y1:top }];
  const axisLo = horizontal ? Math.min(seg.x1, seg.x2) : Math.min(seg.y1, seg.y2);
  const axisHi = horizontal ? Math.max(seg.x1, seg.x2) : Math.max(seg.y1, seg.y2);
  const fixed = horizontal ? seg.y1 : seg.x1;
  const half = Math.max(0.5, mToPx(thicknessM) / 2);
  const profiles = [];
  (stairs || []).forEach((stair) => {
    const swap = stair.dir === 1 || stair.dir === 3;
    const localW = swap ? stair.h : stair.w;
    const localD = swap ? stair.w : stair.h;
    const info = stairTreads3d(localW, localD, stair.shape || "straight", stair.winders || 3, !!stair.mirror);
    const stepRise = Math.max(1.8, Number(stair.fh || 3000) / 1000) / Math.max(1, info.treads.length);
    info.treads.forEach((tread, index) => {
      const points = tread.poly.map((point) => {
        const lx = swap ? point[1] : point[0];
        const ly = swap ? point[0] : point[1];
        return stairPoint3d(stair, lx, ly);
      });
      const crossAxis = horizontal ? 1 : 0;
      const crossValues = points.map((point) => point[crossAxis]);
      const crossMin = Math.min(...crossValues);
      const crossMax = Math.max(...crossValues);
      // Keep perimeter walls full-height. Interior stair walls begin above the tread, leaving storage open below.
      if(fixed <= crossMin + 0.5 || fixed >= crossMax - 0.5) return;
      let clipped = clipPolyHalfPlane3d(points, crossAxis, fixed - half, true);
      clipped = clipPolyHalfPlane3d(clipped, crossAxis, fixed + half, false);
      if(clipped.length < 3) return;
      const along = clipped.map((point) => point[horizontal ? 0 : 1]);
      const lo = Math.max(axisLo, Math.min(...along));
      const hi = Math.min(axisHi, Math.max(...along));
      const above = bottom + stepRise * (index + 1) + 0.005;
      if(hi - lo > 0.5) profiles.push({ lo, hi, y0:Math.min(top, above) });
    });
  });
  if(!profiles.length) return [{ seg, y0:bottom, y1:top }];
  const cuts = [axisLo, axisHi];
  profiles.forEach((profile) => cuts.push(profile.lo, profile.hi));
  cuts.sort((a, b) => a - b);
  const unique = cuts.filter((value, index) => index === 0 || Math.abs(value - cuts[index - 1]) > 0.2);
  const slices = [];
  for(let index = 0; index < unique.length - 1; index++){
    const lo = unique[index], hi = unique[index + 1];
    if(hi - lo <= 0.5) continue;
    const mid = (lo + hi) / 2;
    const hits = profiles.filter((profile) => mid >= profile.lo - 0.1 && mid <= profile.hi + 0.1);
    const y0 = hits.length ? Math.max(...hits.map((profile) => profile.y0)) : bottom;
    if(top - y0 <= 0.01) continue;
    slices.push({
      seg:horizontal
        ? { ...seg, x1:lo, x2:hi, y1:fixed, y2:fixed }
        : { ...seg, x1:fixed, x2:fixed, y1:lo, y2:hi },
      y0,
      y1:top
    });
  }
  return slices;
}

function normalizeModelParts3d(parts){
  const source = Array.isArray(parts) && parts.length ? parts : [{ type:"box", xMm:0, yMm:0, zMm:0, wMm:700, dMm:450, hMm:500, color:"#b9c0c8", rotation:0 }];
  return source.map((part) => ({
    type: ["box", "cylinder", "sphere"].includes(part.type) ? part.type : "box",
    xMm: finiteNumber(part.xMm, 0),
    yMm: finiteNumber(part.yMm, 0),
    zMm: Math.max(0, finiteNumber(part.zMm, 0)),
    wMm: Math.max(50, finiteNumber(part.wMm, 600)),
    dMm: Math.max(50, finiteNumber(part.dMm, 400)),
    hMm: Math.max(30, finiteNumber(part.hMm, 500)),
    rotation: finiteNumber(part.rotation, 0),
    color: part.color || "#b9c0c8"
  }));
}

function modelSizeFromParts3d(parts){
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxH = 0;
  parts.forEach((part) => {
    minX = Math.min(minX, part.xMm - part.wMm / 2);
    minY = Math.min(minY, part.yMm - part.dMm / 2);
    maxX = Math.max(maxX, part.xMm + part.wMm / 2);
    maxY = Math.max(maxY, part.yMm + part.dMm / 2);
    maxH = Math.max(maxH, part.zMm + part.hMm);
  });
  return {
    w: Math.max(50, maxX - minX),
    d: Math.max(50, maxY - minY),
    h: Math.max(30, maxH),
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  };
}

function finiteNumber(value, fallback){
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function floorMaterial(kind, color){
  const texture = floorTexture(kind, color);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === "tatami" ? 2 : 3, kind === "tile" ? 3 : 2);
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color("#ffffff"),
    map: texture,
    roughness: kind === "tile" ? 0.46 : 0.66,
    metalness: 0.01
  });
}

function floorTexture(kind, color){
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color || "#d8bf96";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if(kind === "tile" || kind === "vinyl"){
    ctx.fillStyle = kind === "tile" ? "#cfd4d1" : "#ede8df";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(80,86,82,.20)";
    ctx.lineWidth = 2;
    for(let x = 0; x <= canvas.width; x += 48){
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for(let y = 0; y <= canvas.height; y += 48){
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
  }else if(kind === "tatami"){
    ctx.fillStyle = "#b7c98b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(64,86,45,.26)";
    ctx.lineWidth = 3;
    for(let x = 0; x <= canvas.width; x += 64){
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,.22)";
    for(let y = 18; y < canvas.height; y += 18){
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
  }else{
    const dark = kind === "walnut" ? "rgba(62,35,18,.28)" : "rgba(115,80,40,.18)";
    const light = kind === "walnut" ? "rgba(255,230,190,.08)" : "rgba(255,245,220,.18)";
    for(let y = 0; y < canvas.height; y += 32){
      ctx.fillStyle = y % 64 === 0 ? light : "rgba(0,0,0,.03)";
      ctx.fillRect(0, y, canvas.width, 30);
      ctx.fillStyle = dark;
      ctx.fillRect(0, y + 30, canvas.width, 2);
      for(let x = (y / 32) % 2 ? 44 : 0; x < canvas.width; x += 72){
        ctx.fillRect(x, y, 2, 30);
      }
    }
  }
  return new THREE.CanvasTexture(canvas);
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

function frameBounds(frames){
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  frames.forEach((frame) => {
    minX = Math.min(minX, frame.x);
    minY = Math.min(minY, frame.y);
    maxX = Math.max(maxX, frame.x + frame.w);
    maxY = Math.max(maxY, frame.y + frame.h);
  });
  return { minX, minY, maxX, maxY };
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

function mToPx(m){
  return m / pxToM(1);
}

function pointSegmentDistance(px, pz, x1, z1, x2, z2){
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  if(len2 <= 0.000001) return Math.hypot(px - x1, pz - z1);
  const t = clamp(((px - x1) * dx + (pz - z1) * dz) / len2, 0, 1);
  return Math.hypot(px - (x1 + dx * t), pz - (z1 + dz * t));
}

function sceneItemLayer(item){
  return item?.kind === "site" ? "site" : item?.layer;
}

function sceneItemVisible(item, layers){
  return layers?.[sceneItemLayer(item)] !== false;
}

function sceneBounds(plan, design, floorMode, layers, padding){
  const bounds = floorBounds(plan, floorMode, padding);
  const floorIndexes = floorMode === "all" ? null : new Set([Number(floorMode || 0)]);
  const items = (design.customItems || []).filter((item) => item.layer === "exterior" && sceneItemVisible(item, layers) && (!floorIndexes || floorIndexes.has(item.floorIndex)));
  let minX = bounds.minX;
  let minY = bounds.minY;
  let maxX = bounds.maxX;
  let maxY = bounds.maxY;
  items.forEach((item) => {
    minX = Math.min(minX, item.x - padding);
    minY = Math.min(minY, item.y - padding);
    maxX = Math.max(maxX, item.x + item.w + padding);
    maxY = Math.max(maxY, item.y + item.h + padding);
  });
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}
