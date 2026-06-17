import { DetailScene3D } from "./scene3d.js";
import {
  DEFAULT_LAYOUT_ID,
  loadLayout,
  floorBounds,
  floorItems,
  roomsForFloor,
  openingsForFloor,
  furnitureForFloor,
  areaM2,
  formatM2,
  formatTsubo,
  pxToMm,
  mmToPx
} from "./data.js";
import { FURNITURE_LIBRARY, EXTERIOR_LIBRARY, FINISHES, createDefaultDesign, seedFinishes, makeCustomItem, uid } from "./defaults.js";

const state = {
  plan: null,
  design: null,
  view: "3d",
  floorMode: "0",
  selectedId: null,
  cameraPreset: "exterior",
  dockMode: "select",
  mobilePanelOpen: false,
  drag: null,
  nudgeDrag: null,
  undoStack: [],
  measurePoints: [],
  nudgeUi: { x: null, y: null },
  layers: {
    rooms: true,
    walls: true,
    openings: true,
    furniture: true,
    shelves: true,
    exterior: true
  }
};

const dom = {};
let scene3d = null;
let toastTimer = null;

document.addEventListener("DOMContentLoaded", init);

async function init(){
  cacheDom();
  bindEvents();
  renderPalette();
  scene3d = new DetailScene3D(dom.sceneCanvas);
  scene3d.attachWalkUi({
    stage: dom.stage3d,
    stick: dom.walkStick,
    knob: dom.walkStickKnob,
    roomWarp: dom.roomWarp,
    onModeChange: update3dControls
  });
  await loadCurrentLayout();
}

function cacheDom(){
  [
    "layoutMeta","reloadBtn","exportBtn","saveBtn","viewTabs","floorTabs","metricStrip","stage3d","stagePlan","stageList",
    "sceneCanvas","walkHud","walkModeBtn","reset3dBtn","walkStatus","viewPresetBar","roomWarp","walkStick","walkStickKnob","planSvg","planHud","planNudge","planHudTitle","centerPlanBtn","clearSelectionBtn","undoBtn","measureHud","measureText","clearMeasureBtn","layerToggles","siteNorthInput","siteEastInput","siteSouthInput","siteWestInput","applySiteBtn","setbackInput","parkingInput","deckInput","northInput","fenceInput","palette","exteriorPalette",
    "selectedPanel","itemListLarge","noteList","noteListLarge","noteInput","noteCategory",
    "addNoteBtn","toast","viewBadge","modeDock","inspector"
  ].forEach((id) => { dom[id] = document.getElementById(id); });
}

function bindEvents(){
  dom.reloadBtn.addEventListener("click", () => loadCurrentLayout(false));
  dom.saveBtn.addEventListener("click", () => saveDesign(true));
  dom.exportBtn.addEventListener("click", exportDesign);
  dom.walkModeBtn.addEventListener("click", toggleWalkMode);
  dom.reset3dBtn.addEventListener("click", () => {
    scene3d?.resetView();
    update3dControls();
  });
  dom.viewPresetBar.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-preset]");
    if(!button) return;
    apply3dPreset(button.dataset.preset);
  });
  dom.viewTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-view]");
    if(!button) return;
    state.view = button.dataset.view;
    state.dockMode = state.view === "3d" ? "3d" : (state.view === "list" ? "browse" : "select");
    state.mobilePanelOpen = false;
    render();
  });
  dom.modeDock?.addEventListener("click", onDockClick);
  dom.floorTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-floor]");
    if(!button) return;
    state.floorMode = (scene3d?.isWalkMode() && button.dataset.floor === "all") ? "0" : button.dataset.floor;
    state.selectedId = null;
    render();
  });
  dom.layerToggles.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-layer]");
    if(!input) return;
    state.layers[input.dataset.layer] = input.checked;
    render();
  });
  dom.centerPlanBtn.addEventListener("click", () => {
    state.view = "plan";
    state.floorMode = "0";
    state.mobilePanelOpen = false;
    render();
  });
  dom.clearSelectionBtn.addEventListener("click", () => {
    state.selectedId = null;
    state.mobilePanelOpen = false;
    render();
  });
  dom.undoBtn.addEventListener("click", undo);
  dom.clearMeasureBtn.addEventListener("click", () => {
    state.measurePoints = [];
    renderPlan();
  });
  ["setbackInput","parkingInput","deckInput","northInput"].forEach((id) => {
    dom[id].addEventListener("input", () => {
      pushHistory();
      const exterior = state.design.exterior;
      exterior.setbackM = numberValue(dom.setbackInput, exterior.setbackM);
      exterior.parkingCars = numberValue(dom.parkingInput, exterior.parkingCars);
      exterior.deckM = numberValue(dom.deckInput, exterior.deckM);
      exterior.northDeg = numberValue(dom.northInput, exterior.northDeg);
      saveDesign(false);
      renderSceneOnly();
    });
  });
  ["siteNorthInput","siteEastInput","siteSouthInput","siteWestInput"].forEach((id) => {
    dom[id].addEventListener("input", () => {
      pushHistory();
      applySiteOffsets(false);
    });
  });
  dom.applySiteBtn.addEventListener("click", () => applySiteOffsets(true));
  dom.fenceInput.addEventListener("change", () => {
    pushHistory();
    state.design.exterior.fence = dom.fenceInput.checked;
    saveDesign(false);
    renderSceneOnly();
  });
  dom.planSvg.addEventListener("click", (event) => {
    if(state.dockMode === "measure") return;
    const target = event.target.closest("[data-id]");
    if(!target) return;
    state.selectedId = target.dataset.id;
    state.mobilePanelOpen = false;
    render();
  });
  dom.planSvg.addEventListener("pointerdown", onPlanPointerDown);
  dom.planNudge.addEventListener("click", onPlanNudgeClick);
  dom.planNudge.addEventListener("pointerdown", onPlanNudgePointerDown);
  window.addEventListener("pointermove", onPlanPointerMove);
  window.addEventListener("pointermove", onNudgePointerMove);
  window.addEventListener("pointerup", onPlanPointerUp);
  window.addEventListener("pointerup", onNudgePointerUp);
  window.addEventListener("pointercancel", onPlanPointerUp);
  window.addEventListener("pointercancel", onNudgePointerUp);
  dom.addNoteBtn.addEventListener("click", addNote);
  dom.noteInput.addEventListener("keydown", (event) => {
    if(event.key === "Enter") addNote();
  });
}

async function loadCurrentLayout(force = false){
  const id = new URLSearchParams(location.search).get("id") || DEFAULT_LAYOUT_ID;
  dom.layoutMeta.textContent = `ID ${id} を読み込み中`;
  try{
    state.plan = await loadLayout(id);
    state.design = loadDesign(id, force);
    seedFinishes(state.plan, state.design);
    state.floorMode = String(state.plan.activeFloor || 0);
    state.selectedId = null;
    dom.layoutMeta.textContent = `${state.plan.title} / ${id}`;
    saveDesign(false);
    render();
  }catch(error){
    console.error(error);
    dom.layoutMeta.textContent = "間取りを読み込めませんでした";
    toast(error.message || "読み込みに失敗しました");
  }
}

function loadDesign(layoutId, force){
  if(!force){
    try{
      const raw = localStorage.getItem(storageKey(layoutId));
      if(raw){
        const saved = JSON.parse(raw);
        if(saved && saved.version === 1) return mergeDesign(createDefaultDesign(layoutId), saved);
      }
    }catch(error){
      console.warn(error);
    }
  }
  return createDefaultDesign(layoutId);
}

function mergeDesign(base, saved){
  return {
    ...base,
    ...saved,
    exterior: { ...base.exterior, ...(saved.exterior || {}) },
    finishes: { ...base.finishes, ...(saved.finishes || {}) },
    customItems: Array.isArray(saved.customItems) ? saved.customItems : [],
    notes: Array.isArray(saved.notes) ? saved.notes : base.notes
  };
}

function storageKey(layoutId){
  return `detail_study_${layoutId}_v1`;
}

function saveDesign(showToast = true){
  if(!state.plan || !state.design) return;
  localStorage.setItem(storageKey(state.plan.id), JSON.stringify(state.design));
  if(showToast) toast("保存しました");
}

function historySnapshot(){
  return {
    design: JSON.parse(JSON.stringify(state.design)),
    selectedId: state.selectedId,
    floorMode: state.floorMode,
    view: state.view,
    dockMode: state.dockMode,
    mobilePanelOpen: state.mobilePanelOpen
  };
}

function pushHistory(snapshot = historySnapshot()){
  if(!snapshot || !snapshot.design) return;
  state.undoStack.push(snapshot);
  if(state.undoStack.length > 40) state.undoStack.shift();
  updateUndoControls();
}

function undo(){
  const snapshot = state.undoStack.pop();
  if(!snapshot) return;
  state.design = snapshot.design;
  state.selectedId = snapshot.selectedId;
  state.floorMode = snapshot.floorMode || state.floorMode;
  state.view = snapshot.view || state.view;
  state.dockMode = snapshot.dockMode || state.dockMode;
  state.mobilePanelOpen = !!snapshot.mobilePanelOpen;
  state.drag = null;
  state.measurePoints = [];
  saveDesign(false);
  render();
  toast("元に戻しました");
}

function updateUndoControls(){
  if(dom.undoBtn) dom.undoBtn.disabled = state.undoStack.length === 0;
}

function render(){
  renderViewTabs();
  renderFloorTabs();
  renderExteriorControls();
  renderMetrics();
  renderPlan();
  renderLists();
  renderSelectedPanel();
  renderSceneOnly();
  updateUndoControls();
}

function renderSceneOnly(){
  if(!scene3d || !state.plan) return;
  scene3d.setState({
    plan: state.plan,
    design: state.design,
    floorMode: state.floorMode,
    layers: state.layers,
    selectedId: state.selectedId
  });
  update3dControls();
}

function renderViewTabs(){
  dom.viewTabs.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("on", button.dataset.view === state.view);
  });
  dom.stage3d.hidden = state.view !== "3d";
  dom.stagePlan.hidden = state.view !== "plan";
  dom.stageList.hidden = state.view !== "list";
  if(state.view !== "3d" && scene3d?.isWalkMode()) scene3d.setWalkMode(false);
  update3dControls();
  dom.viewBadge.textContent = state.floorMode === "all" ? "全体3D" : `${Number(state.floorMode) + 1}F 3D`;
  updateDockControls();
}

function toggleWalkMode(){
  if(!scene3d) return;
  const next = !scene3d.isWalkMode();
  if(next){
    state.view = "3d";
    if(state.floorMode === "all") state.floorMode = "0";
    state.cameraPreset = "interior";
    render();
  }else{
    state.cameraPreset = "exterior";
  }
  scene3d.setWalkMode(next);
  update3dControls();
}

function onDockClick(event){
  const button = event.target.closest("button[data-dock]");
  if(!button) return;
  const mode = button.dataset.dock;
  const closingActivePanel = state.view === "plan" && state.dockMode === mode && state.mobilePanelOpen;
  if(closingActivePanel){
    state.view = "plan";
    state.dockMode = "select";
    state.mobilePanelOpen = false;
    render();
    return;
  }
  state.dockMode = mode;
  state.measurePoints = mode === "measure" ? state.measurePoints : [];
  if(mode === "3d"){
    state.view = "3d";
    state.mobilePanelOpen = false;
    render();
    return;
  }
  if(mode === "browse"){
    state.view = "list";
    state.mobilePanelOpen = false;
    render();
    return;
  }
  state.view = "plan";
  state.mobilePanelOpen = mode !== "measure" && !closingActivePanel;
  render();
}

function updateDockControls(){
  if(!dom.modeDock) return;
  document.body.dataset.view = state.view;
  document.body.dataset.dockMode = state.dockMode;
  document.body.dataset.panelOpen = state.mobilePanelOpen ? "1" : "0";
  dom.modeDock.querySelectorAll("button[data-dock]").forEach((button) => {
    const mode = button.dataset.dock;
    const on = state.view === "3d" ? mode === "3d" : state.view === "list" ? mode === "browse" : mode === state.dockMode;
    button.classList.toggle("on", on);
  });
}

function apply3dPreset(preset){
  if(!scene3d) return;
  state.view = "3d";
  state.cameraPreset = preset;
  if(preset === "exterior"){
    state.floorMode = "all";
    scene3d.setWalkMode(false);
    render();
    scene3d.applyPreset("exterior");
  }else if(preset === "top"){
    scene3d.setWalkMode(false);
    render();
    scene3d.applyPreset("top");
  }else if(preset === "interior"){
    if(state.floorMode === "all") state.floorMode = "0";
    render();
    scene3d.setWalkMode(true);
  }
  update3dControls();
}

function update3dControls(){
  if(!dom.walkModeBtn || !scene3d) return;
  const walking = scene3d.isWalkMode();
  dom.walkModeBtn.classList.toggle("on", walking);
  dom.walkModeBtn.textContent = walking ? "俯瞰" : "歩く";
  const floorLabel = state.floorMode === "1" ? "2F" : "1F";
  dom.walkStatus.textContent = walking ? `${floorLabel} 歩行` : "俯瞰";
  dom.viewPresetBar?.querySelectorAll("button[data-preset]").forEach((button) => {
    const on = walking ? button.dataset.preset === "interior" : button.dataset.preset === state.cameraPreset;
    button.classList.toggle("on", on);
  });
}

function renderFloorTabs(){
  dom.floorTabs.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("on", button.dataset.floor === state.floorMode);
  });
}

function renderExteriorControls(){
  const ext = state.design?.exterior || {};
  const offsets = siteOffsets();
  dom.siteNorthInput.value = offsets.north;
  dom.siteEastInput.value = offsets.east;
  dom.siteSouthInput.value = offsets.south;
  dom.siteWestInput.value = offsets.west;
  dom.setbackInput.value = ext.setbackM ?? 2.4;
  dom.parkingInput.value = ext.parkingCars ?? 2;
  dom.deckInput.value = ext.deckM ?? 1.8;
  dom.northInput.value = ext.northDeg ?? 0;
  dom.fenceInput.checked = !!ext.fence;
}

function siteOffsets(){
  const raw = state.design?.exterior?.siteOffsetsM || {};
  return {
    north: Number.isFinite(Number(raw.north)) ? Number(raw.north) : 2.0,
    east: Number.isFinite(Number(raw.east)) ? Number(raw.east) : 2.0,
    south: Number.isFinite(Number(raw.south)) ? Number(raw.south) : 3.0,
    west: Number.isFinite(Number(raw.west)) ? Number(raw.west) : 2.0
  };
}

function applySiteOffsets(showToast){
  if(!state.plan || !state.design) return;
  if(showToast) pushHistory();
  const offsets = {
    north: numberValue(dom.siteNorthInput, siteOffsets().north),
    east: numberValue(dom.siteEastInput, siteOffsets().east),
    south: numberValue(dom.siteSouthInput, siteOffsets().south),
    west: numberValue(dom.siteWestInput, siteOffsets().west)
  };
  state.design.exterior.siteOffsetsM = offsets;
  const house = houseBoundsPx();
  if(!house) return;
  const site = ensureSiteItem();
  const northPx = mmToPx(offsets.north * 1000);
  const eastPx = mmToPx(offsets.east * 1000);
  const southPx = mmToPx(offsets.south * 1000);
  const westPx = mmToPx(offsets.west * 1000);
  site.x = house.minX - westPx;
  site.y = house.minY - northPx;
  site.w = house.width + westPx + eastPx;
  site.h = house.height + northPx + southPx;
  site.floorIndex = 0;
  state.view = "plan";
  state.floorMode = "0";
  state.selectedId = site.id;
  saveDesign(false);
  render();
  if(showToast) toast("敷地を反映しました");
}

function ensureSiteItem(){
  const existing = (state.design.customItems || []).find((item) => item.layer === "exterior" && item.kind === "site");
  if(existing) return existing;
  const preset = EXTERIOR_LIBRARY.find((item) => item.kind === "site");
  const house = houseBoundsPx() || { minX: -200, minY: -200, width: 400, height: 400 };
  const site = makeCustomItem(preset, 0, { x: house.minX + house.width / 2, y: house.minY + house.height / 2 });
  state.design.customItems.push(site);
  return site;
}

function houseBoundsPx(){
  const floor = state.plan?.floors?.[0];
  if(!floor) return null;
  let items = (floor.items || []).filter((item) => item.type === "frame");
  if(!items.length) items = (floor.items || []).filter((item) => item.type === "room");
  if(!items.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  items.forEach((item) => {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.w);
    maxY = Math.max(maxY, item.y + item.h);
  });
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function renderMetrics(){
  const rooms = roomsForFloor(state.plan, state.floorMode);
  const openings = openingsForFloor(state.plan, state.floorMode);
  const furn = furnitureForFloor(state.plan, state.floorMode);
  const custom = visibleCustomItems();
  const m2 = rooms.reduce((sum, room) => sum + areaM2(room), 0);
  dom.metricStrip.innerHTML = [
    `<span>${formatM2(m2)}</span>`,
    `<span>${formatTsubo(m2)}</span>`,
    `<span>部屋 ${rooms.length}</span>`,
    `<span>窓/建具 ${openings.length}</span>`,
    `<span>家具 ${furn.length + custom.length}</span>`
  ].join("");
}

function renderPalette(){
  dom.exteriorPalette.innerHTML = renderLibrary(EXTERIOR_LIBRARY, "外構");
  dom.palette.innerHTML = renderLibrary(FURNITURE_LIBRARY, "検討");
  [dom.exteriorPalette, dom.palette].forEach((palette) => {
    palette.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-kind]");
      if(!button) return;
      addCustomItem(button.dataset.kind);
    });
  });
}

function renderLibrary(items, fallbackCategory){
  const categories = [...new Set(items.map((item) => item.category || fallbackCategory))];
  return categories.map((category) => {
    const buttons = items.filter((item) => (item.category || fallbackCategory) === category).map((item) => (
      `<button type="button" data-kind="${item.kind}" data-tone="${item.tone}">
        <b>${escapeHtml(item.label)}</b><span>${escapeHtml(item.meta || "")}</span>
      </button>`
    )).join("");
    return `<div class="paletteGroup"><div class="paletteTitle">${escapeHtml(category)}</div><div class="paletteGrid">${buttons}</div></div>`;
  }).join("");
}

function allLibraryItems(){
  return [...EXTERIOR_LIBRARY, ...FURNITURE_LIBRARY];
}

function onPlanPointerDown(event){
  if(state.dockMode === "measure"){
    event.preventDefault();
    addMeasurePoint(event);
    return;
  }
  const target = event.target.closest("[data-id]");
  if(!target) return;
  const item = findCustomById(target.dataset.id);
  if(!item) return;
  event.preventDefault();
  const point = svgPoint(event);
  state.selectedId = item.id;
  state.mobilePanelOpen = false;
  state.drag = {
    id: item.id,
    mode: event.target.closest("[data-resize]") ? "resize" : "move",
    pointerId: event.pointerId,
    start: point,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    before: historySnapshot()
  };
  try{ dom.planSvg.setPointerCapture?.(event.pointerId); }catch(_){}
  document.body.classList.add("draggingPlan");
  render();
}

function onPlanPointerMove(event){
  if(!state.drag) return;
  const item = findCustomById(state.drag.id);
  if(!item) return;
  event.preventDefault();
  const point = svgPoint(event);
  const dx = point.x - state.drag.start.x;
  const dy = point.y - state.drag.start.y;
  if(state.drag.mode === "resize"){
    item.w = snap(Math.max(8, state.drag.w + dx));
    item.h = snap(Math.max(8, state.drag.h + dy));
  }else{
    item.x = snap(state.drag.x + dx);
    item.y = snap(state.drag.y + dy);
  }
  saveDesign(false);
  renderPlan();
  renderLists();
  renderSelectedPanel();
  renderSceneOnly();
}

function onPlanPointerUp(){
  if(!state.drag) return;
  const item = findCustomById(state.drag.id);
  const changed = item && (
    Math.abs(item.x - state.drag.x) > 0.01 ||
    Math.abs(item.y - state.drag.y) > 0.01 ||
    Math.abs(item.w - state.drag.w) > 0.01 ||
    Math.abs(item.h - state.drag.h) > 0.01
  );
  if(changed) pushHistory(state.drag.before);
  try{ dom.planSvg.releasePointerCapture?.(state.drag.pointerId); }catch(_){}
  state.drag = null;
  document.body.classList.remove("draggingPlan");
  saveDesign(false);
  render();
}

function onPlanNudgeClick(event){
  const button = event.target.closest("button[data-move],button[data-size-step],button[data-delete-selected]");
  if(!button) return;
  const item = findCustomById(state.selectedId);
  if(!item) return;
  event.preventDefault();
  if(button.dataset.deleteSelected){
    deleteCustomItem(item.id);
    return;
  }
  if(button.dataset.sizeStep){
    const next = Number(button.dataset.sizeStep);
    if(Number.isFinite(next)){
      item.nudgeMm = next;
      renderPlanNudge();
    }
    return;
  }
  const [mx, my] = button.dataset.move.split(",").map(Number);
  const step = mmToPx(Number(item.nudgeMm || 100));
  pushHistory();
  item.x = snapFine(item.x + mx * step);
  item.y = snapFine(item.y + my * step);
  saveDesign(false);
  renderPlan();
  renderLists();
  renderSelectedPanel();
  renderSceneOnly();
}

function onPlanNudgePointerDown(event){
  if(event.target.closest("button")) return;
  if(dom.planNudge.hidden) return;
  event.preventDefault();
  const panelRect = dom.planNudge.getBoundingClientRect();
  const stageRect = dom.stagePlan.getBoundingClientRect();
  state.nudgeDrag = {
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
    x: Number.isFinite(state.nudgeUi.x) ? state.nudgeUi.x : panelRect.left - stageRect.left,
    y: Number.isFinite(state.nudgeUi.y) ? state.nudgeUi.y : panelRect.top - stageRect.top
  };
  dom.planNudge.classList.add("draggingNudge");
  try{ dom.planNudge.setPointerCapture?.(event.pointerId); }catch(_){}
}

function onNudgePointerMove(event){
  if(!state.nudgeDrag) return;
  event.preventDefault();
  const stageRect = dom.stagePlan.getBoundingClientRect();
  const panelRect = dom.planNudge.getBoundingClientRect();
  const maxX = Math.max(8, stageRect.width - panelRect.width - 8);
  const maxY = Math.max(8, stageRect.height - panelRect.height - 8);
  state.nudgeUi.x = clamp(state.nudgeDrag.x + event.clientX - state.nudgeDrag.clientX, 8, maxX);
  state.nudgeUi.y = clamp(state.nudgeDrag.y + event.clientY - state.nudgeDrag.clientY, 8, maxY);
  positionPlanNudge();
}

function onNudgePointerUp(){
  if(!state.nudgeDrag) return;
  try{ dom.planNudge.releasePointerCapture?.(state.nudgeDrag.pointerId); }catch(_){}
  state.nudgeDrag = null;
  dom.planNudge.classList.remove("draggingNudge");
}

function deleteCustomItem(id){
  const item = findCustomById(id);
  if(!item) return;
  pushHistory();
  state.design.customItems = state.design.customItems.filter((candidate) => candidate.id !== id);
  state.selectedId = null;
  saveDesign(false);
  render();
  toast(`${item.label || "選択中"}を削除しました`);
}

function svgPoint(event){
  const pt = dom.planSvg.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const matrix = dom.planSvg.getScreenCTM();
  if(!matrix) return { x: 0, y: 0 };
  const p = pt.matrixTransform(matrix.inverse());
  return { x: p.x, y: p.y };
}

function snap(value){
  return Math.round(value / 8) * 8;
}

function snapFine(value){
  return Math.round(value * 10) / 10;
}

function findCustomById(id){
  return (state.design?.customItems || []).find((item) => item.id === id) || null;
}

function renderPlan(){
  if(!state.plan) return;
  const bounds = displayBounds();
  dom.planSvg.setAttribute("viewBox", `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`);
  const items = floorItems(state.plan, state.floorMode);
  const rooms = items.filter((item) => item.type === "room" && !item.void);
  const frames = items.filter((item) => item.type === "frame");
  const walls = items.filter((item) => item.type === "wallLine");
  const openings = items.filter((item) => item.type === "opening");
  const furn = items.filter((item) => item.type === "furn" || item.type === "stair");
  const chunks = [];
  if(state.layers.exterior) chunks.push(renderExteriorSvg(bounds));
  frames.forEach((frame) => {
    chunks.push(`<rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" fill="#fffef9" stroke="rgba(31,35,28,.34)" stroke-width="2"/>`);
  });
  if(state.layers.rooms){
    rooms.forEach((room) => chunks.push(renderRoomSvg(room)));
  }
  if(state.layers.walls){
    walls.forEach((wall) => chunks.push(`<line x1="${wall.x1}" y1="${wall.y1}" x2="${wall.x2}" y2="${wall.y2}" stroke="#1f241f" stroke-width="${Math.max(4, wall.thick || 8)}" stroke-linecap="square"/>`));
  }
  if(state.layers.openings){
    openings.forEach((opening) => chunks.push(renderOpeningSvg(opening)));
  }
  if(state.layers.furniture) furn.forEach((item) => chunks.push(renderFurnitureSvg(item, true)));
  visibleCustomItems().forEach((item) => {
    if(state.layers[item.layer] !== false) chunks.push(renderFurnitureSvg(item, false));
  });
  if(state.layers.exterior) chunks.push(renderSiteDistanceSvg());
  chunks.push(renderMeasureSvg());
  dom.planSvg.innerHTML = chunks.join("");
  const selected = findSelected();
  dom.planHudTitle.textContent = selected?.source === "custom" ? `選択: ${selected.item.label}` : "図面操作";
  renderPlanNudge();
  renderMeasureHud();
}

function addMeasurePoint(event){
  const point = svgPoint(event);
  if(state.measurePoints.length >= 2) state.measurePoints = [];
  state.measurePoints.push(point);
  state.selectedId = null;
  renderPlan();
}

function renderMeasureHud(){
  if(!dom.measureHud) return;
  const active = state.view === "plan" && state.dockMode === "measure";
  dom.measureHud.hidden = !active;
  if(!active) return;
  if(state.measurePoints.length === 0){
    dom.measureText.textContent = "始点をタップ";
  }else if(state.measurePoints.length === 1){
    dom.measureText.textContent = "終点をタップ";
  }else{
    dom.measureText.textContent = `距離 ${measureDistanceText(state.measurePoints[0], state.measurePoints[1])}`;
  }
}

function renderMeasureSvg(){
  const points = state.measurePoints;
  if(!points.length) return "";
  const dots = points.map((point, index) => (
    `<g class="measurePoint">
      <circle cx="${point.x}" cy="${point.y}" r="5" fill="#ff2d55" stroke="#fff" stroke-width="2"/>
      <text x="${point.x + 8}" y="${point.y - 8}" class="measureText">${index === 0 ? "始点" : "終点"}</text>
    </g>`
  )).join("");
  if(points.length < 2) return dots;
  const [a, b] = points;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return `<g class="measureLayer">
    <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="measureLine"/>
    ${dots}
    <text x="${mx}" y="${my - 10}" text-anchor="middle" class="measureLabel">${measureDistanceText(a, b)}</text>
  </g>`;
}

function measureDistanceText(a, b){
  return `${(pxToMm(Math.hypot(b.x - a.x, b.y - a.y)) / 1000).toFixed(2)}m`;
}

function renderPlanNudge(){
  const item = findCustomById(state.selectedId);
  if(!item){
    dom.planNudge.hidden = true;
    dom.planNudge.innerHTML = "";
    return;
  }
  const step = Number(item.nudgeMm || 100);
  dom.planNudge.hidden = false;
  dom.planNudge.innerHTML = `<div class="nudgeMiniHead"><b>${escapeHtml(item.label || "選択中")}</b><button type="button" data-delete-selected="1">削除</button></div>
    <div class="nudgeSteps">
      <button type="button" data-size-step="10" class="${step === 10 ? "on" : ""}">1cm</button>
      <button type="button" data-size-step="100" class="${step === 100 ? "on" : ""}">10cm</button>
    </div>
    <div class="nudgePad">
      <span></span><button type="button" data-move="0,-1">↑</button><span></span>
      <button type="button" data-move="-1,0">←</button><button type="button" data-move="0,1">↓</button><button type="button" data-move="1,0">→</button>
    </div>`;
  positionPlanNudge();
}

function positionPlanNudge(){
  if(!dom.planNudge || dom.planNudge.hidden) return;
  if(Number.isFinite(state.nudgeUi.x) && Number.isFinite(state.nudgeUi.y)){
    dom.planNudge.style.left = `${state.nudgeUi.x}px`;
    dom.planNudge.style.top = `${state.nudgeUi.y}px`;
    dom.planNudge.style.right = "auto";
    dom.planNudge.style.bottom = "auto";
  }else{
    dom.planNudge.style.left = "";
    dom.planNudge.style.top = "";
    dom.planNudge.style.right = "";
    dom.planNudge.style.bottom = "";
  }
}

function renderExteriorSvg(bounds){
  const x = bounds.minX + 18;
  const y = bounds.minY + 18;
  const w = bounds.width - 36;
  const h = bounds.height - 36;
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e8f0e4" stroke="#8ba77b" stroke-width="2" stroke-dasharray="8 7" opacity=".55"/>`,
    `<text x="${x + 12}" y="${y + 18}" class="planSub">外構編集範囲</text>`
  ].join("");
}

function renderSiteDistanceSvg(){
  const site = (state.design?.customItems || []).find((item) => item.layer === "exterior" && item.kind === "site");
  const house = houseBoundsPx();
  if(!site || !house) return "";
  const siteRight = site.x + site.w;
  const siteBottom = site.y + site.h;
  const houseRight = house.maxX;
  const houseBottom = house.maxY;
  const cx = house.minX + house.width / 2;
  const cy = house.minY + house.height / 2;
  const north = Math.max(0, house.minY - site.y);
  const east = Math.max(0, siteRight - houseRight);
  const south = Math.max(0, siteBottom - houseBottom);
  const west = Math.max(0, house.minX - site.x);
  const mark = (x1, y1, x2, y2, labelX, labelY, label) => (
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="planDistance"/>
     <circle cx="${x1}" cy="${y1}" r="2.8" fill="#286fd6"/>
     <circle cx="${x2}" cy="${y2}" r="2.8" fill="#286fd6"/>
     <text x="${labelX}" y="${labelY}" text-anchor="middle" class="planDistanceText">${label}</text>`
  );
  return `<g>
    ${mark(cx, site.y, cx, house.minY, cx + 22, (site.y + house.minY) / 2, `北 ${formatDistance(north)}`)}
    ${mark(houseRight, cy, siteRight, cy, (houseRight + siteRight) / 2, cy - 9, `東 ${formatDistance(east)}`)}
    ${mark(cx, houseBottom, cx, siteBottom, cx + 22, (houseBottom + siteBottom) / 2, `南 ${formatDistance(south)}`)}
    ${mark(site.x, cy, house.minX, cy, (site.x + house.minX) / 2, cy - 9, `西 ${formatDistance(west)}`)}
  </g>`;
}

function formatDistance(px){
  return `${(pxToMm(px) / 1000).toFixed(2)}m`;
}

function displayBounds(){
  const base = floorBounds(state.plan, state.floorMode, state.layers.exterior ? 150 : 70);
  const items = state.layers.exterior ? visibleCustomItems().filter((item) => item.layer === "exterior") : [];
  let minX = base.minX;
  let minY = base.minY;
  let maxX = base.maxX;
  let maxY = base.maxY;
  items.forEach((item) => {
    minX = Math.min(minX, item.x - 24);
    minY = Math.min(minY, item.y - 24);
    maxX = Math.max(maxX, item.x + item.w + 24);
    maxY = Math.max(maxY, item.y + item.h + 24);
  });
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function renderRoomSvg(room){
  const selected = state.selectedId === room.id ? " selected" : "";
  const finish = state.design.finishes?.[room.id] || {};
  const floorDef = FINISHES.floor.find((item) => item.id === finish.floor);
  const fill = floorDef?.color || room.color || "#fff3e0";
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  const name = escapeHtml(room.label || "部屋");
  const area = formatM2(areaM2(room));
  return `<g class="planRoom${selected}" data-id="${room.id}">
    <rect x="${room.x}" y="${room.y}" width="${room.w}" height="${room.h}" fill="${fill}" stroke="rgba(31,35,28,.34)" stroke-width="1.5"/>
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="planLabel">${name}</text>
    <text x="${cx}" y="${cy + 9}" text-anchor="middle" class="planSub">${area}</text>
  </g>`;
}

function renderOpeningSvg(opening){
  const color = opening.kind === "window" ? "#2a91bd" : "#a86a38";
  const selected = state.selectedId === opening.id ? " selected" : "";
  return `<g class="planItem${selected}" data-id="${opening.id}">
    <line x1="${opening.x1}" y1="${opening.y1}" x2="${opening.x2}" y2="${opening.y2}" stroke="${color}" stroke-width="7" stroke-linecap="round"/>
    <line x1="${opening.x1}" y1="${opening.y1}" x2="${opening.x2}" y2="${opening.y2}" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
  </g>`;
}

function renderFurnitureSvg(item, existing){
  const selected = state.selectedId === item.id ? " selected" : "";
  const label = escapeHtml(item.label || "家具");
  const color = item.color || (existing ? "#d8dce3" : "#c9c9d2");
  const rotate = item.rotation ? ` transform="rotate(${item.rotation} ${item.x + item.w / 2} ${item.y + item.h / 2})"` : "";
  if(item.layer === "exterior") return renderExteriorItemSvg(item, selected, label, color, rotate);
  if(item.kind === "plant" || item.kind === "tree"){
    const r = Math.max(4, Math.min(item.w, item.h) / 2);
    return `<g class="planItem${selected}" data-id="${item.id}"><circle cx="${item.x + item.w / 2}" cy="${item.y + item.h / 2}" r="${r}" fill="${color}" stroke="#355d38" stroke-width="1.5"/><text x="${item.x + item.w / 2}" y="${item.y + item.h / 2 + 3}" text-anchor="middle" class="planSub">${label}</text></g>`;
  }
  return `<g class="planItem${selected}" data-id="${item.id}"${rotate}>
    <rect x="${item.x}" y="${item.y}" width="${Math.max(3, item.w)}" height="${Math.max(3, item.h)}" rx="2" fill="${color}" stroke="rgba(31,35,28,.42)" stroke-width="1.4"/>
    <text x="${item.x + item.w / 2}" y="${item.y + item.h / 2 + 3}" text-anchor="middle" class="planSub">${label}</text>
  </g>`;
}

function renderExteriorItemSvg(item, selected, label, color, rotate){
  const cx = item.x + item.w / 2;
  const cy = item.y + item.h / 2;
  const cls = `planItem exteriorItem${selected}`;
  const handle = selected ? `<rect data-resize="1" x="${item.x + item.w - 9}" y="${item.y + item.h - 9}" width="18" height="18" rx="4" fill="#286fd6" stroke="#fff" stroke-width="2"/>` : "";
  const commonText = `<text x="${cx}" y="${cy + 3}" text-anchor="middle" class="planSub">${label}</text>`;
  if(item.kind === "site"){
    return `<g class="${cls}" data-id="${item.id}">
      <rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" fill="${color}" fill-opacity=".42" stroke="#59764d" stroke-width="3" stroke-dasharray="10 8"/>
      <text x="${item.x + 12}" y="${item.y + 18}" class="planSub">${label}</text>${handle}
    </g>`;
  }
  if(item.kind === "tree" || item.kind === "plant"){
    const r = Math.max(7, Math.min(item.w, item.h) / 2);
    return `<g class="${cls}" data-id="${item.id}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" fill-opacity=".8" stroke="#315f37" stroke-width="2"/>
      <circle cx="${cx - r * .25}" cy="${cy - r * .18}" r="${r * .34}" fill="#6daa68" opacity=".8"/>
      ${commonText}${handle}
    </g>`;
  }
  if(item.kind === "fence"){
    return `<g class="${cls}" data-id="${item.id}"${rotate}>
      <rect x="${item.x}" y="${item.y}" width="${item.w}" height="${Math.max(8, item.h)}" rx="2" fill="${color}" stroke="#70583e" stroke-width="1.5"/>
      <line x1="${item.x}" y1="${cy}" x2="${item.x + item.w}" y2="${cy}" stroke="#f3e5d0" stroke-width="2" stroke-dasharray="10 8"/>
      ${commonText}${handle}
    </g>`;
  }
  const stroke = item.kind === "parking" || item.kind === "driveway" ? "#8c918b" : "rgba(31,35,28,.42)";
  const dash = item.kind === "parking" ? ` stroke-dasharray="12 7"` : "";
  return `<g class="${cls}" data-id="${item.id}"${rotate}>
    <rect x="${item.x}" y="${item.y}" width="${Math.max(3, item.w)}" height="${Math.max(3, item.h)}" rx="3" fill="${color}" fill-opacity=".72" stroke="${stroke}" stroke-width="1.8"${dash}/>
    ${item.kind === "parking" ? `<text x="${cx}" y="${cy - 8}" text-anchor="middle" class="planSub">P</text>` : ""}
    ${commonText}${handle}
  </g>`;
}

function renderLists(){
  const items = visibleCustomItems();
  const itemRows = items.length ? items.map((item) => itemRow(item)).join("") : `<div class="denseRow"><b>未追加</b><span>検討パーツなし</span></div>`;
  dom.itemListLarge.innerHTML = itemRows;
  const noteRows = (state.design.notes || []).map((note) => noteRow(note)).join("");
  dom.noteList.innerHTML = noteRows;
  dom.noteListLarge.innerHTML = noteRows || `<div class="denseRow"><b>メモなし</b><span></span></div>`;
  [dom.itemListLarge, dom.noteList, dom.noteListLarge].forEach((list) => {
    list.onclick = handleListClick;
  });
}

function itemRow(item){
  const on = state.selectedId === item.id ? " on" : "";
  return `<div class="denseRow${on}" data-id="${item.id}">
    <div><b>${escapeHtml(item.label)}</b><span>${escapeHtml(item.category || item.layer)} / ${pxToMm(item.w)}x${pxToMm(item.h)}x${Math.round(item.heightMm || 0)}mm</span></div>
    <button type="button" data-select="${item.id}">選択</button>
  </div>`;
}

function noteRow(note){
  return `<div class="miniRow" data-note="${note.id}">
    <div><b>${escapeHtml(note.category)}</b><span>${escapeHtml(note.text)}</span></div>
    <button type="button" data-note-delete="${note.id}">削除</button>
  </div>`;
}

function handleListClick(event){
  const del = event.target.closest("[data-note-delete]");
  if(del){
    pushHistory();
    state.design.notes = (state.design.notes || []).filter((note) => note.id !== del.dataset.noteDelete);
    saveDesign(false);
    renderLists();
    return;
  }
  const pick = event.target.closest("[data-id]");
  if(pick){
    state.selectedId = pick.dataset.id;
    render();
  }
}

function renderSelectedPanel(){
  const selected = findSelected();
  if(!selected){
    dom.selectedPanel.innerHTML = `<div class="selectedHead"><div><b>未選択</b><span>部屋または検討パーツ</span></div></div>`;
    return;
  }
  if(selected.source === "room"){
    dom.selectedPanel.innerHTML = renderRoomEditor(selected.item);
    bindRoomEditor(selected.item);
  }else if(selected.source === "custom"){
    dom.selectedPanel.innerHTML = renderCustomEditor(selected.item);
    bindCustomEditor(selected.item);
  }else{
    dom.selectedPanel.innerHTML = `<div class="selectedHead"><div><b>${escapeHtml(selected.item.label || "既存パーツ")}</b><span>元間取りの要素</span></div></div>`;
  }
}

function renderRoomEditor(room){
  const finish = state.design.finishes[room.id] || {};
  return `<div class="selectedHead"><div><b>${escapeHtml(room.label)}</b><span>${formatM2(areaM2(room))}</span></div></div>
    <div class="selectedGrid">
      <label>床<select id="floorFinish">${finishOptions("floor", finish.floor)}</select></label>
      <label>壁<select id="wallFinish">${finishOptions("wall", finish.wall)}</select></label>
      <label>天井<select id="ceilingFinish">${finishOptions("ceiling", finish.ceiling)}</select></label>
      <label>メモ<input id="roomMemo" type="text" maxlength="40" value="${escapeAttr(finish.memo || "")}"></label>
    </div>`;
}

function finishOptions(group, active){
  return FINISHES[group].map((item) => `<option value="${item.id}" ${item.id === active ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("");
}

function bindRoomEditor(room){
  const finish = state.design.finishes[room.id] || (state.design.finishes[room.id] = {});
  let editSnapshot = null;
  [["floorFinish","floor"],["wallFinish","wall"],["ceilingFinish","ceiling"],["roomMemo","memo"]].forEach(([id, key]) => {
    const input = document.getElementById(id);
    input.addEventListener("focus", () => {
      editSnapshot = editSnapshot || historySnapshot();
    });
    input.addEventListener("input", (event) => {
      if(editSnapshot){
        pushHistory(editSnapshot);
        editSnapshot = null;
      }
      finish[key] = event.target.value;
      saveDesign(false);
      renderPlan();
      renderSceneOnly();
    });
  });
}

function renderCustomEditor(item){
  const isExterior = item.layer === "exterior";
  return `<div class="selectedHead"><div><b>${escapeHtml(item.label)}</b><span>${escapeHtml(isExterior ? (item.category || "外構") : floorLabel(item.floorIndex))}</span></div><button class="dangerBtn" id="deleteItemBtn" type="button">削除</button></div>
    <div class="selectedGrid">
      <label>名前<input id="itemLabel" type="text" maxlength="20" value="${escapeAttr(item.label)}"></label>
      <label>色<input id="itemColor" type="color" value="${escapeAttr(item.color || "#c9c9d2")}"></label>
      <label>幅mm<input id="itemW" type="number" min="50" step="10" value="${pxToMm(item.w)}"></label>
      <label>奥行mm<input id="itemD" type="number" min="50" step="10" value="${pxToMm(item.h)}"></label>
      <label>高さmm<input id="itemH" type="number" min="10" step="10" value="${Math.round(item.heightMm || 700)}"></label>
      <label>回転°<input id="itemRot" type="number" step="15" value="${Math.round(item.rotation || 0)}"></label>
    </div>
    <div class="buttonRow">
      <button type="button" data-nudge="0,-16">↑</button>
      <button type="button" data-nudge="-16,0">←</button>
      <button type="button" data-nudge="16,0">→</button>
      <button type="button" data-nudge="0,16">↓</button>
      <button type="button" id="rotateItemBtn">90°</button>
    </div>`;
}

function bindCustomEditor(item){
  let editSnapshot = null;
  const update = () => {
    if(editSnapshot){
      pushHistory(editSnapshot);
      editSnapshot = null;
    }
    item.label = document.getElementById("itemLabel").value.trim() || item.label;
    item.color = document.getElementById("itemColor").value;
    item.w = mmToPx(numberValue(document.getElementById("itemW"), pxToMm(item.w)));
    item.h = mmToPx(numberValue(document.getElementById("itemD"), pxToMm(item.h)));
    item.heightMm = numberValue(document.getElementById("itemH"), item.heightMm || 700);
    item.rotation = numberValue(document.getElementById("itemRot"), item.rotation || 0);
    saveDesign(false);
    renderPlan();
    renderLists();
    renderSceneOnly();
  };
  ["itemLabel","itemColor","itemW","itemD","itemH","itemRot"].forEach((id) => {
    const input = document.getElementById(id);
    input.addEventListener("focus", () => {
      editSnapshot = editSnapshot || historySnapshot();
    });
    input.addEventListener("input", update);
  });
  document.getElementById("deleteItemBtn").addEventListener("click", () => {
    deleteCustomItem(item.id);
  });
  document.getElementById("rotateItemBtn").addEventListener("click", () => {
    pushHistory();
    item.rotation = ((item.rotation || 0) + 90) % 360;
    saveDesign(false);
    render();
  });
  dom.selectedPanel.querySelectorAll("[data-nudge]").forEach((button) => {
    button.addEventListener("click", () => {
      const [dx, dy] = button.dataset.nudge.split(",").map(Number);
      pushHistory();
      item.x += dx;
      item.y += dy;
      saveDesign(false);
      render();
    });
  });
}

function addCustomItem(kind){
  const preset = allLibraryItems().find((item) => item.kind === kind);
  if(!preset || !state.plan) return;
  pushHistory();
  const floorIndex = state.floorMode === "all" ? 0 : Number(state.floorMode || 0);
  const selectedRoom = findSelected()?.source === "room" ? findSelected().item : roomsForFloor(state.plan, String(floorIndex))[0];
  const bounds = floorBounds(state.plan, String(floorIndex), 0);
  const center = selectedRoom
    ? { x: selectedRoom.x + selectedRoom.w / 2, y: selectedRoom.y + selectedRoom.h / 2 }
    : { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  const item = makeCustomItem(preset, floorIndex, center);
  if(preset.layer === "exterior"){
    item.floorIndex = 0;
    state.view = "plan";
    state.floorMode = "0";
    placeExteriorItem(item, floorBounds(state.plan, "0", 0));
  }
  state.design.customItems.push(item);
  state.selectedId = item.id;
  state.dockMode = "select";
  state.mobilePanelOpen = false;
  saveDesign(false);
  render();
  toast(`${preset.label}を追加しました`);
}

function placeExteriorItem(item, bounds){
  const gap = 32;
  if(item.kind === "site"){
    item.x = bounds.minX - 96;
    item.y = bounds.minY - 96;
    item.w = Math.max(item.w, bounds.width + 192);
    item.h = Math.max(item.h, bounds.height + 192);
    return;
  }
  if(item.kind === "parking" || item.kind === "driveway" || item.kind === "bike"){
    item.x = bounds.minX + bounds.width * 0.55;
    item.y = bounds.maxY + gap;
    return;
  }
  if(item.kind === "approach" || item.kind === "gate"){
    item.x = bounds.minX + bounds.width * 0.18;
    item.y = bounds.maxY + gap;
    return;
  }
  if(item.kind === "deck" || item.kind === "garden" || item.kind === "tree"){
    item.x = bounds.minX + bounds.width * 0.18;
    item.y = bounds.minY - item.h - gap;
    return;
  }
  if(item.kind === "fence"){
    item.x = bounds.minX;
    item.y = bounds.minY - item.h - gap;
  }
}

function visibleCustomItems(){
  if(!state.design) return [];
  if(state.floorMode === "all") return state.design.customItems || [];
  return (state.design.customItems || []).filter((item) => item.floorIndex === Number(state.floorMode));
}

function findSelected(){
  if(!state.selectedId || !state.plan) return null;
  for(const [floorIndex, floor] of state.plan.floors.entries()){
    const found = (floor.items || []).find((item) => item.id === state.selectedId);
    if(found) return { source: found.type === "room" ? "room" : "plan", item: { ...found, floorIndex } };
  }
  const custom = (state.design.customItems || []).find((item) => item.id === state.selectedId);
  if(custom) return { source: "custom", item: custom };
  return null;
}

function addNote(){
  const text = dom.noteInput.value.trim();
  if(!text) return;
  pushHistory();
  state.design.notes.unshift({ id: uid(), category: dom.noteCategory.value, text, done: false });
  dom.noteInput.value = "";
  saveDesign(false);
  renderLists();
}

function exportDesign(){
  if(!state.plan || !state.design) return;
  const payload = {
    exportedAt: new Date().toISOString(),
    layout: { id: state.plan.id, title: state.plan.title },
    design: state.design
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${state.plan.title || "detail-study"}_detail-study.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function numberValue(input, fallback){
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max){
  return Math.min(max, Math.max(min, value));
}

function floorLabel(index){
  return `${Number(index || 0) + 1}F`;
}

function toast(message){
  clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  toastTimer = setTimeout(() => dom.toast.classList.remove("show"), 1800);
}

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[char]));
}

function escapeAttr(value){
  return escapeHtml(value).replace(/`/g, "&#96;");
}
