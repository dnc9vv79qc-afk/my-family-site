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
import { FURNITURE_LIBRARY, FINISHES, createDefaultDesign, seedFinishes, makeCustomItem, uid } from "./defaults.js";

const state = {
  plan: null,
  design: null,
  view: "3d",
  floorMode: "0",
  selectedId: null,
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
  await loadCurrentLayout();
}

function cacheDom(){
  [
    "layoutMeta","reloadBtn","exportBtn","saveBtn","viewTabs","floorTabs","metricStrip","stage3d","stagePlan","stageList",
    "sceneCanvas","planSvg","layerToggles","setbackInput","parkingInput","deckInput","northInput","fenceInput","palette",
    "selectedPanel","roomList","roomListLarge","itemListLarge","noteList","noteListLarge","noteInput","noteCategory",
    "addNoteBtn","toast","viewBadge"
  ].forEach((id) => { dom[id] = document.getElementById(id); });
}

function bindEvents(){
  dom.reloadBtn.addEventListener("click", () => loadCurrentLayout(false));
  dom.saveBtn.addEventListener("click", () => saveDesign(true));
  dom.exportBtn.addEventListener("click", exportDesign);
  dom.viewTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-view]");
    if(!button) return;
    state.view = button.dataset.view;
    render();
  });
  dom.floorTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-floor]");
    if(!button) return;
    state.floorMode = button.dataset.floor;
    state.selectedId = null;
    render();
  });
  dom.layerToggles.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-layer]");
    if(!input) return;
    state.layers[input.dataset.layer] = input.checked;
    render();
  });
  ["setbackInput","parkingInput","deckInput","northInput"].forEach((id) => {
    dom[id].addEventListener("input", () => {
      const exterior = state.design.exterior;
      exterior.setbackM = numberValue(dom.setbackInput, exterior.setbackM);
      exterior.parkingCars = numberValue(dom.parkingInput, exterior.parkingCars);
      exterior.deckM = numberValue(dom.deckInput, exterior.deckM);
      exterior.northDeg = numberValue(dom.northInput, exterior.northDeg);
      saveDesign(false);
      renderSceneOnly();
    });
  });
  dom.fenceInput.addEventListener("change", () => {
    state.design.exterior.fence = dom.fenceInput.checked;
    saveDesign(false);
    renderSceneOnly();
  });
  dom.planSvg.addEventListener("click", (event) => {
    const target = event.target.closest("[data-id]");
    if(!target) return;
    state.selectedId = target.dataset.id;
    render();
  });
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

function render(){
  renderViewTabs();
  renderFloorTabs();
  renderExteriorControls();
  renderMetrics();
  renderPlan();
  renderLists();
  renderSelectedPanel();
  renderSceneOnly();
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
}

function renderViewTabs(){
  dom.viewTabs.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("on", button.dataset.view === state.view);
  });
  dom.stage3d.hidden = state.view !== "3d";
  dom.stagePlan.hidden = state.view !== "plan";
  dom.stageList.hidden = state.view !== "list";
  dom.viewBadge.textContent = state.floorMode === "all" ? "全体3D" : `${Number(state.floorMode) + 1}F 3D`;
}

function renderFloorTabs(){
  dom.floorTabs.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("on", button.dataset.floor === state.floorMode);
  });
}

function renderExteriorControls(){
  const ext = state.design?.exterior || {};
  dom.setbackInput.value = ext.setbackM ?? 2.4;
  dom.parkingInput.value = ext.parkingCars ?? 2;
  dom.deckInput.value = ext.deckM ?? 1.8;
  dom.northInput.value = ext.northDeg ?? 0;
  dom.fenceInput.checked = !!ext.fence;
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
  dom.palette.innerHTML = FURNITURE_LIBRARY.map((item) => (
    `<button type="button" data-kind="${item.kind}" data-tone="${item.tone}">${escapeHtml(item.label)}</button>`
  )).join("");
  dom.palette.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-kind]");
    if(!button) return;
    addCustomItem(button.dataset.kind);
  });
}

function renderPlan(){
  if(!state.plan) return;
  const bounds = floorBounds(state.plan, state.floorMode, state.layers.exterior ? 130 : 70);
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
  dom.planSvg.innerHTML = chunks.join("");
}

function renderExteriorSvg(bounds){
  const pad = 70;
  const x = bounds.minX + pad / 2;
  const y = bounds.minY + pad / 2;
  const w = bounds.width - pad;
  const h = bounds.height - pad;
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#dfeadb" stroke="#7d956f" stroke-width="3" stroke-dasharray="9 7"/>`,
    `<rect x="${x + w * 0.58}" y="${y + h - 72}" width="${Math.min(150, w * .34)}" height="62" fill="#c9ccc7" stroke="#9ca19a" stroke-width="1"/>`,
    `<rect x="${x + 26}" y="${y + h - 56}" width="${Math.min(130, w * .28)}" height="36" fill="#7aa85d" opacity=".65"/>`,
    `<text x="${x + 12}" y="${y + 18}" class="planSub">敷地</text>`
  ].join("");
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
  if(item.kind === "plant"){
    const r = Math.max(4, Math.min(item.w, item.h) / 2);
    return `<g class="planItem${selected}" data-id="${item.id}"><circle cx="${item.x + item.w / 2}" cy="${item.y + item.h / 2}" r="${r}" fill="${color}" stroke="#355d38" stroke-width="1.5"/><text x="${item.x + item.w / 2}" y="${item.y + item.h / 2 + 3}" text-anchor="middle" class="planSub">${label}</text></g>`;
  }
  return `<g class="planItem${selected}" data-id="${item.id}"${rotate}>
    <rect x="${item.x}" y="${item.y}" width="${Math.max(3, item.w)}" height="${Math.max(3, item.h)}" rx="2" fill="${color}" stroke="rgba(31,35,28,.42)" stroke-width="1.4"/>
    <text x="${item.x + item.w / 2}" y="${item.y + item.h / 2 + 3}" text-anchor="middle" class="planSub">${label}</text>
  </g>`;
}

function renderLists(){
  const rooms = roomsForFloor(state.plan, state.floorMode);
  const roomRows = rooms.map((room) => roomRow(room)).join("");
  dom.roomList.innerHTML = roomRows;
  dom.roomListLarge.innerHTML = roomRows;
  const items = visibleCustomItems();
  const itemRows = items.length ? items.map((item) => itemRow(item)).join("") : `<div class="denseRow"><b>未追加</b><span>検討パーツなし</span></div>`;
  dom.itemListLarge.innerHTML = itemRows;
  const noteRows = (state.design.notes || []).map((note) => noteRow(note)).join("");
  dom.noteList.innerHTML = noteRows;
  dom.noteListLarge.innerHTML = noteRows || `<div class="denseRow"><b>メモなし</b><span></span></div>`;
  [dom.roomList, dom.roomListLarge, dom.itemListLarge, dom.noteList, dom.noteListLarge].forEach((list) => {
    list.onclick = handleListClick;
  });
}

function roomRow(room){
  const on = state.selectedId === room.id ? " on" : "";
  return `<div class="miniRow${on}" data-id="${room.id}">
    <div><b>${escapeHtml(room.label)}</b><span>${formatM2(areaM2(room))} / ${pxToMm(room.w)}x${pxToMm(room.h)}mm</span></div>
    <button type="button" data-select="${room.id}">選択</button>
  </div>`;
}

function itemRow(item){
  const on = state.selectedId === item.id ? " on" : "";
  return `<div class="denseRow${on}" data-id="${item.id}">
    <div><b>${escapeHtml(item.label)}</b><span>${floorLabel(item.floorIndex)} / ${pxToMm(item.w)}x${pxToMm(item.h)}x${Math.round(item.heightMm || 0)}mm</span></div>
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
  [["floorFinish","floor"],["wallFinish","wall"],["ceilingFinish","ceiling"],["roomMemo","memo"]].forEach(([id, key]) => {
    document.getElementById(id).addEventListener("input", (event) => {
      finish[key] = event.target.value;
      saveDesign(false);
      renderPlan();
      renderSceneOnly();
    });
  });
}

function renderCustomEditor(item){
  return `<div class="selectedHead"><div><b>${escapeHtml(item.label)}</b><span>${floorLabel(item.floorIndex)}</span></div><button class="dangerBtn" id="deleteItemBtn" type="button">削除</button></div>
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
  const update = () => {
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
    document.getElementById(id).addEventListener("input", update);
  });
  document.getElementById("deleteItemBtn").addEventListener("click", () => {
    state.design.customItems = state.design.customItems.filter((candidate) => candidate.id !== item.id);
    state.selectedId = null;
    saveDesign(false);
    render();
  });
  document.getElementById("rotateItemBtn").addEventListener("click", () => {
    item.rotation = ((item.rotation || 0) + 90) % 360;
    saveDesign(false);
    render();
  });
  dom.selectedPanel.querySelectorAll("[data-nudge]").forEach((button) => {
    button.addEventListener("click", () => {
      const [dx, dy] = button.dataset.nudge.split(",").map(Number);
      item.x += dx;
      item.y += dy;
      saveDesign(false);
      render();
    });
  });
}

function addCustomItem(kind){
  const preset = FURNITURE_LIBRARY.find((item) => item.kind === kind);
  if(!preset || !state.plan) return;
  const floorIndex = state.floorMode === "all" ? 0 : Number(state.floorMode || 0);
  const selectedRoom = findSelected()?.source === "room" ? findSelected().item : roomsForFloor(state.plan, String(floorIndex))[0];
  const bounds = floorBounds(state.plan, String(floorIndex), 0);
  const center = selectedRoom
    ? { x: selectedRoom.x + selectedRoom.w / 2, y: selectedRoom.y + selectedRoom.h / 2 }
    : { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  const item = makeCustomItem(preset, floorIndex, center);
  if(preset.layer === "exterior"){
    item.x = bounds.maxX + 32;
    item.y = bounds.maxY - 80;
  }
  state.design.customItems.push(item);
  state.selectedId = item.id;
  saveDesign(false);
  render();
  toast(`${preset.label}を追加しました`);
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
