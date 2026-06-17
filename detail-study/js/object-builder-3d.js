import * as THREE from "three";

const MODE_LABELS = {
  orbit: "視点",
  move: "移動",
  scale: "サイズ",
  rotate: "回転"
};

export class ObjectBuilder3D {
  constructor(canvas, options = {}){
    this.canvas = canvas;
    this.onSelect = options.onSelect || (() => {});
    this.onChange = options.onChange || (() => {});
    this.onReadout = options.onReadout || (() => {});
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false, preserveDrawingBuffer:true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#e8edf2");
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.02, 200);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.target = new THREE.Vector3(0, 0.45, 0);
    this.theta = Math.PI * 0.25;
    this.phi = 0.93;
    this.radius = 4.2;
    this.mode = "orbit";
    this.snapMm = 50;
    this.parts = [];
    this.selectedId = "";
    this.meshes = new Map();
    this.pointers = new Map();
    this.drag = null;
    this.pinch = null;
    this.needsFrame = true;
    this.initScene();
    this.initControls();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement || canvas);
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  initScene(){
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xc6ccd0, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(5, 8, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(sun);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color:"#d9dee1", roughness:0.96, metalness:0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.006;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(20, 40, 0x89949b, 0xb9c1c5);
    grid.material.opacity = 0.34;
    grid.material.transparent = true;
    this.scene.add(grid);
    this.selectionBox = new THREE.BoxHelper(undefined, 0x286fd6);
    this.selectionBox.material.depthTest = false;
    this.selectionBox.material.transparent = true;
    this.selectionBox.material.opacity = 0.95;
    this.selectionBox.renderOrder = 10;
    this.selectionBox.visible = false;
    this.scene.add(this.selectionBox);
    this.raycaster = new THREE.Raycaster();
    this.pointerNdc = new THREE.Vector2();
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  initControls(){
    this.canvas.tabIndex = 0;
    this.canvas.addEventListener("pointerdown", (event) => this.pointerDown(event));
    this.canvas.addEventListener("pointermove", (event) => this.pointerMove(event));
    this.canvas.addEventListener("pointerup", (event) => this.pointerEnd(event));
    this.canvas.addEventListener("pointercancel", (event) => this.pointerEnd(event));
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.radius = clamp(this.radius * (event.deltaY > 0 ? 1.1 : 0.9), 0.7, 30);
      this.needsFrame = true;
    }, { passive:false });
  }

  setParts(parts, selectedId){
    this.parts = Array.isArray(parts) ? parts.map((part) => ({ ...part })) : [];
    this.selectedId = selectedId || this.parts[0]?.id || "";
    this.rebuild();
  }

  setMode(mode){
    this.mode = MODE_LABELS[mode] ? mode : "orbit";
    this.drag = null;
    this.updateReadout();
    this.needsFrame = true;
  }

  setSnap(mm){
    this.snapMm = clamp(Number(mm) || 50, 1, 1000);
    this.updateReadout();
  }

  setSelection(id){
    if(!this.meshes.has(id)) return;
    this.selectedId = id;
    this.updateSelection();
    this.updateReadout();
  }

  fitView(){
    const bounds = this.bounds();
    this.target.copy(bounds.center);
    this.target.y = Math.max(0.2, bounds.center.y);
    this.theta = Math.PI * 0.25;
    this.phi = 0.93;
    this.radius = clamp(bounds.size.length() * 1.25 + 0.8, 1.5, 18);
    this.needsFrame = true;
  }

  rebuild(){
    for(const mesh of this.meshes.values()){
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    }
    this.root.clear();
    this.meshes.clear();
    for(const part of this.parts){
      const mesh = this.makeMesh(part);
      mesh.userData.partId = part.id;
      this.root.add(mesh);
      this.meshes.set(part.id, mesh);
    }
    this.updateSelection();
    this.updateReadout();
  }

  makeMesh(part){
    const w = Math.max(0.05, Number(part.wMm) / 1000);
    const d = Math.max(0.05, Number(part.dMm) / 1000);
    const h = Math.max(0.03, Number(part.hMm) / 1000);
    let geometry;
    if(part.type === "cylinder"){
      geometry = new THREE.CylinderGeometry(w / 2, w / 2, h, 32);
      geometry.scale(1, 1, d / w);
    }else if(part.type === "sphere"){
      geometry = new THREE.SphereGeometry(0.5, 32, 20);
      geometry.scale(w, h, d);
    }else{
      geometry = new THREE.BoxGeometry(w, h, d);
    }
    const material = new THREE.MeshStandardMaterial({
      color:part.color || "#b9c0c8",
      roughness:0.68,
      metalness:0.03
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(Number(part.xMm) / 1000, Number(part.zMm) / 1000 + h / 2, Number(part.yMm) / 1000);
    mesh.rotation.y = -THREE.MathUtils.degToRad(Number(part.rotation) || 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  pointerDown(event){
    event.preventDefault();
    this.canvas.focus?.();
    this.pointers.set(event.pointerId, { x:event.clientX, y:event.clientY });
    try{ this.canvas.setPointerCapture(event.pointerId); }catch(_){}
    if(this.pointers.size === 2){
      this.pinch = {
        distance:this.pinchDistance(),
        center:this.pinchCenter(),
        radius:this.radius,
        target:this.target.clone()
      };
      this.drag = null;
      return;
    }
    const hit = this.pick(event.clientX, event.clientY);
    if(hit){
      const id = hit.object.userData.partId;
      if(id !== this.selectedId){
        this.selectedId = id;
        this.updateSelection();
        this.onSelect(id);
      }
    }
    const part = this.selectedPart();
    const canTransform = hit && part && this.mode !== "orbit";
    const planePoint = this.groundPoint(event.clientX, event.clientY);
    this.drag = {
      pointerId:event.pointerId,
      startX:event.clientX,
      startY:event.clientY,
      lastX:event.clientX,
      lastY:event.clientY,
      moved:false,
      orbit:!canTransform,
      partId:part?.id || "",
      startPart:part ? { ...part } : null,
      startPoint:planePoint
    };
  }

  pointerMove(event){
    if(this.pointers.has(event.pointerId)){
      this.pointers.set(event.pointerId, { x:event.clientX, y:event.clientY });
    }
    if(this.pinch && this.pointers.size >= 2){
      event.preventDefault();
      const distance = Math.max(20, this.pinchDistance());
      this.radius = clamp(this.pinch.radius * this.pinch.distance / distance, 0.7, 30);
      const center = this.pinchCenter();
      const dx = center.x - this.pinch.center.x;
      const dy = center.y - this.pinch.center.y;
      const scale = this.pinch.radius * 0.0015;
      const right = new THREE.Vector3(-Math.sin(this.theta), 0, Math.cos(this.theta));
      const forward = new THREE.Vector3(-Math.cos(this.theta), 0, -Math.sin(this.theta));
      this.target.copy(this.pinch.target)
        .addScaledVector(right, -dx * scale)
        .addScaledVector(forward, -dy * scale);
      this.needsFrame = true;
      return;
    }
    if(!this.drag || this.drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - this.drag.lastX;
    const dy = event.clientY - this.drag.lastY;
    if(Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY) > 3) this.drag.moved = true;
    if(this.drag.orbit){
      this.theta -= dx * 0.007;
      this.phi = clamp(this.phi - dy * 0.006, 0.2, 1.48);
    }else{
      this.applyTransform(event.clientX, event.clientY);
    }
    this.drag.lastX = event.clientX;
    this.drag.lastY = event.clientY;
    this.needsFrame = true;
  }

  pointerEnd(event){
    this.pointers.delete(event.pointerId);
    this.pinch = this.pointers.size >= 2 ? {
      distance:this.pinchDistance(),
      center:this.pinchCenter(),
      radius:this.radius,
      target:this.target.clone()
    } : null;
    if(this.drag?.pointerId === event.pointerId){
      if(!this.drag.orbit && this.drag.moved){
        const part = this.selectedPart();
        if(part) this.onChange(part.id, this.partValues(part), true);
      }
      this.drag = null;
    }
  }

  applyTransform(clientX, clientY){
    const part = this.selectedPart();
    const start = this.drag?.startPart;
    if(!part || !start) return;
    if(this.mode === "move"){
      const point = this.groundPoint(clientX, clientY);
      if(!point || !this.drag.startPoint) return;
      part.xMm = snap(start.xMm + (point.x - this.drag.startPoint.x) * 1000, this.snapMm);
      part.yMm = snap(start.yMm + (point.z - this.drag.startPoint.z) * 1000, this.snapMm);
    }else if(this.mode === "scale"){
      const delta = this.drag.startY - clientY;
      const factor = clamp(Math.exp(delta * 0.006), 0.08, 12);
      part.wMm = snap(Math.max(50, start.wMm * factor), this.snapMm);
      part.dMm = snap(Math.max(50, start.dMm * factor), this.snapMm);
      part.hMm = snap(Math.max(30, start.hMm * factor), this.snapMm);
    }else if(this.mode === "rotate"){
      const degrees = start.rotation + (clientX - this.drag.startX) * 0.55;
      part.rotation = normalizeDegrees(snap(degrees, 15));
    }
    this.updateMesh(part);
    this.updateSelection();
    this.updateReadout();
    this.onChange(part.id, this.partValues(part), false);
  }

  updateMesh(part){
    const old = this.meshes.get(part.id);
    if(!old) return;
    const replacement = this.makeMesh(part);
    replacement.userData.partId = part.id;
    this.root.remove(old);
    old.geometry.dispose();
    old.material.dispose();
    this.root.add(replacement);
    this.meshes.set(part.id, replacement);
  }

  updateSelection(){
    const mesh = this.meshes.get(this.selectedId);
    if(!mesh){
      this.selectionBox.visible = false;
      return;
    }
    this.selectionBox.setFromObject(mesh);
    this.selectionBox.visible = true;
    this.needsFrame = true;
  }

  updateReadout(){
    const part = this.selectedPart();
    let detail = "";
    if(part){
      if(this.mode === "move") detail = `X ${Math.round(part.xMm)} / Y ${Math.round(part.yMm)}mm`;
      else if(this.mode === "scale") detail = `${Math.round(part.wMm)} x ${Math.round(part.dMm)} x ${Math.round(part.hMm)}mm`;
      else if(this.mode === "rotate") detail = `${Math.round(part.rotation || 0)}°`;
      else detail = part.label || "";
    }
    this.onReadout(MODE_LABELS[this.mode], detail);
  }

  selectedPart(){
    return this.parts.find((part) => part.id === this.selectedId) || null;
  }

  partValues(part){
    return {
      xMm:part.xMm,
      yMm:part.yMm,
      zMm:part.zMm,
      wMm:part.wMm,
      dMm:part.dMm,
      hMm:part.hMm,
      rotation:part.rotation
    };
  }

  pick(clientX, clientY){
    this.setPointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    return this.raycaster.intersectObjects([...this.meshes.values()], false)[0] || null;
  }

  groundPoint(clientX, clientY){
    this.setPointer(clientX, clientY);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    return this.raycaster.ray.intersectPlane(this.dragPlane, new THREE.Vector3());
  }

  setPointer(clientX, clientY){
    const rect = this.canvas.getBoundingClientRect();
    this.pointerNdc.set(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1
    );
  }

  pinchDistance(){
    const points = [...this.pointers.values()];
    if(points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  pinchCenter(){
    const points = [...this.pointers.values()];
    if(points.length < 2) return { x:0, y:0 };
    return { x:(points[0].x + points[1].x) / 2, y:(points[0].y + points[1].y) / 2 };
  }

  bounds(){
    const box = new THREE.Box3().setFromObject(this.root);
    if(box.isEmpty()) return { center:new THREE.Vector3(0, 0.3, 0), size:new THREE.Vector3(1, 1, 1) };
    return { center:box.getCenter(new THREE.Vector3()), size:box.getSize(new THREE.Vector3()) };
  }

  resize(){
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const pixelRatio = this.renderer.getPixelRatio();
    if(this.canvas.width !== Math.round(width * pixelRatio) || this.canvas.height !== Math.round(height * pixelRatio)){
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.needsFrame = true;
    }
  }

  loop(){
    if(this.needsFrame){
      this.resize();
      const sinPhi = Math.sin(this.phi);
      this.camera.position.set(
        this.target.x + this.radius * sinPhi * Math.cos(this.theta),
        this.target.y + this.radius * Math.cos(this.phi),
        this.target.z + this.radius * sinPhi * Math.sin(this.theta)
      );
      this.camera.lookAt(this.target);
      this.renderer.render(this.scene, this.camera);
      this.needsFrame = false;
    }
    requestAnimationFrame(this.loop);
  }
}

function snap(value, step){
  return Math.round(value / step) * step;
}

function normalizeDegrees(value){
  return ((value % 360) + 360) % 360;
}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}
