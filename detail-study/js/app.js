import { DetailScene3D } from "./scene3d.js?v=20260624-roomwarp-v28";
import { ObjectBuilder3D } from "./object-builder-3d.js";
import {
  DEFAULT_LAYOUT_ID,
  loadLayout,
  listSavedLayouts,
  loadDetailDesign,
  saveDetailDesign,
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
} from "./data.js?v=20260624-roomwarp-v28";
import { FURNITURE_LIBRARY, EXTERIOR_LIBRARY, FINISHES, createDefaultDesign, seedFinishes, makeCustomItem, uid, cloneModelParts } from "./defaults.js?v=20260624-roomwarp-v28";

const DETAIL_VERSION_LABEL = "06/24 部屋移動修正 v28";
const LIGHTING_DEFAULTS = {
  scene: "night",
  quality: "standard",
  showHeatmap: true,
  showWallGlow: true
};

const state = {
  plan: null,
  design: null,
  view: "plan",
  floorMode: "0",
  selectedId: null,
  cameraPreset: "exterior",
  workMode: "furniture",
  dockMode: "select",
  mobilePanelOpen: false,
  drag: null,
  nudgeDrag: null,
  undoStack: [],
  measurePoints: [],
  nudgeUi: { x: null, y: null },
  builder: null,
  wallSheetKey: "",
  siteSettingsTab: "position",
  pendingAddKind: "",
  planView: null,
  planPointers: new Map(),
  planPinch: null,
  planPan: null,
  suppressPlanClickUntil: 0,
  layers: {
    site: true,
    rooms: true,
    walls: true,
    openings: true,
    furniture: true,
    guideFurniture: false,
    shelves: true,
    exterior: true
  }
};

const dom = {};
let scene3d = null;
let builder3d = null;
let cloudSaveTimer = 0;
let cloudSaveRevision = 0;
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
  builder3d = new ObjectBuilder3D(dom.builderPreview, {
    onSelect: (id) => {
      if(!state.builder) return;
      state.builder.selectedPartId = id;
      renderBuilderPartList();
      renderBuilderEditor();
    },
    onChange: (id, changes, final) => {
      if(!state.builder) return;
      const part = state.builder.parts.find((item) => item.id === id);
      if(!part) return;
      Object.assign(part, changes);
      if(final){
        state.builder.parts = normalizeModelParts(state.builder.parts);
        renderObjectBuilder();
      }
    },
    onReadout: (mode, detail) => {
      if(dom.builderReadout) dom.builderReadout.textContent = mode;
      if(dom.builderSizeText) dom.builderSizeText.textContent = detail;
    }
  });
  await loadCurrentLayout();
}

function cacheDom(){
  [
    "layoutMeta","editLayoutLink","openLayoutsBtn","savedLayoutsModal","savedLayoutsCloseBtn","savedLayoutsList","reloadBtn","exportBtn","saveBtn","viewTabs","floorTabs","workTabs","metricStrip","stage3d","stagePlan","stageList",
    "sceneCanvas","walkHud","walkModeBtn","reset3dBtn","walkStatus","viewPresetBar","lighting3dQuick","lighting3dQuickText","roomWarp","walkStick","walkStickKnob","planSvg","planHud","planModes","planNudge","planHudTitle","centerPlanBtn","zoomInBtn","zoomOutBtn","clearSelectionBtn","undoBtn","measureHud","measureText","clearMeasureBtn","layerToggles","siteSettingsTabs","siteNorthInput","siteEastInput","siteSouthInput","siteWestInput","siteEqualInput","siteEqualBtn","applySiteBtn","setbackInput","parkingInput","deckInput","northInput","wallColorInput","porchTileInput","fenceInput","palette","constructionPalette","exteriorPalette","lightingPalette","lightingSceneMode","lightingQualityMode","lightingHeatmapInput","lightingWallGlowInput","lightingSimHint","lightingSummary","workModeTitle","workModeHint",
    "selectedPanel","itemListLarge","noteList","noteListLarge","noteInput","noteCategory",
    "wallSheetBtn","wallSheetModal","wallSheetCloseBtn","wallSheetSaveBtn","wallSheetRooms","wallSheetCanvas",
    "addNoteBtn","toast","viewBadge","modeDock","inspector","openObjectBuilderBtn","objectBuilder",
    "quickAddModal","quickAddTitle","quickAddLabel","quickAddW","quickAddD","quickAddH","quickAddGl","quickLightFields","quickAddLumens","quickAddKelvin","quickAddBeam","quickAddDimming","quickAddCancelBtn","quickAddConfirmBtn",
    "builderCloseBtn","builderSaveBtn","builderPreview","builderFitBtn","builderReadout","builderSizeText","builderSnapInput","builderNameInput","builderLayerInput","builderOverallW","builderOverallD","builderOverallH","builderPartList","builderEditor"
  ].forEach((id) => { dom[id] = document.getElementById(id); });
}

function bindEvents(){
  dom.reloadBtn.addEventListener("click", () => loadCurrentLayout(false));
  dom.openLayoutsBtn?.addEventListener("click", openSavedLayouts);
  dom.savedLayoutsCloseBtn?.addEventListener("click", closeSavedLayouts);
  dom.savedLayoutsModal?.addEventListener("click", (event) => {
    if(event.target === dom.savedLayoutsModal) closeSavedLayouts();
  });
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
    if(state.view === "plan" && !["select", "browse", "measure"].includes(state.dockMode)) state.dockMode = "select";
    state.mobilePanelOpen = false;
    render();
  });
  dom.modeDock?.addEventListener("click", onDockClick);
  dom.workTabs?.addEventListener("click", onDockClick);
  dom.planModes?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-plan-mode]");
    if(!button) return;
    state.view = "plan";
    state.dockMode = button.dataset.planMode;
    state.measurePoints = state.dockMode === "measure" ? state.measurePoints : [];
    if(state.dockMode === "browse"){
      state.selectedId = null;
      state.mobilePanelOpen = false;
    }
    render();
  });
  dom.floorTabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-floor]");
    if(!button) return;
    state.floorMode = (scene3d?.isWalkMode() && button.dataset.floor === "all") ? "0" : button.dataset.floor;
    state.selectedId = null;
    state.planView = null;
    render();
  });
  dom.layerToggles.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-layer]");
    if(!input) return;
    state.layers[input.dataset.layer] = input.checked;
    render();
  });
  dom.lightingSceneMode?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-light-scene]");
    if(!button) return;
    updateLightingSettings({ scene:button.dataset.lightScene });
  });
  dom.lightingQualityMode?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-light-quality]");
    if(!button) return;
    updateLightingSettings({ quality:button.dataset.lightQuality });
  });
  dom.lighting3dQuick?.addEventListener("click", (event) => {
    const sceneButton = event.target.closest("button[data-light-scene]");
    if(sceneButton){
      updateLightingSettings({ scene:sceneButton.dataset.lightScene });
      return;
    }
    const qualityButton = event.target.closest("button[data-light-quality]");
    if(qualityButton) updateLightingSettings({ quality:qualityButton.dataset.lightQuality });
  });
  dom.lightingHeatmapInput?.addEventListener("change", () => {
    updateLightingSettings({ showHeatmap:!!dom.lightingHeatmapInput.checked });
  });
  dom.lightingWallGlowInput?.addEventListener("change", () => {
    updateLightingSettings({ showWallGlow:!!dom.lightingWallGlowInput.checked });
  });
  dom.centerPlanBtn.addEventListener("click", () => {
    state.view = "plan";
    state.planView = null;
    state.mobilePanelOpen = false;
    render();
  });
  dom.zoomInBtn?.addEventListener("click", () => zoomPlan(1.25));
  dom.zoomOutBtn?.addEventListener("click", () => zoomPlan(0.8));
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
  bindExteriorColorInputs();
  ["siteNorthInput","siteEastInput","siteSouthInput","siteWestInput"].forEach((id) => {
    dom[id].addEventListener("change", () => {
      pushHistory();
      applySiteOffsets(false);
    });
  });
  dom.applySiteBtn.addEventListener("click", () => applySiteOffsets(true));
  dom.siteSettingsTabs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-site-tab]");
    if(!button) return;
    state.siteSettingsTab = button.dataset.siteTab;
    renderExteriorSettingsTabs();
  });
  dom.siteEqualBtn?.addEventListener("click", applyEqualSiteOffsets);
  dom.fenceInput.addEventListener("change", () => {
    pushHistory();
    state.design.exterior.fence = dom.fenceInput.checked;
    saveDesign(false);
    renderSceneOnly();
  });
  dom.planSvg.addEventListener("click", (event) => {
    if(Date.now() < state.suppressPlanClickUntil) return;
    if(state.dockMode === "measure" || state.dockMode === "browse") return;
    const target = event.target.closest("[data-id]");
    if(!target){
      if(state.selectedId || state.mobilePanelOpen){
        state.selectedId = null;
        state.mobilePanelOpen = false;
        render();
      }
      return;
    }
    const targetId = target.dataset.id;
    if(!isSelectableDetailTarget(targetId)){
      state.selectedId = null;
      state.mobilePanelOpen = false;
      render();
      return;
    }
    state.selectedId = targetId;
    const custom = findCustomById(targetId);
    if(custom) state.workMode = workModeForItem(custom);
    state.mobilePanelOpen = true;
    state.dockMode = "select";
    render();
  });
  dom.planSvg.addEventListener("pointerdown", onPlanPointerDown);
  dom.planSvg.addEventListener("pointerdown", onPlanZoomPointerDown);
  dom.planSvg.addEventListener("pointermove", onPlanZoomPointerMove);
  dom.planSvg.addEventListener("pointerup", onPlanZoomPointerUp);
  dom.planSvg.addEventListener("pointercancel", onPlanZoomPointerUp);
  dom.planSvg.addEventListener("wheel", onPlanWheel, { passive:false });
  dom.planNudge.addEventListener("click", onPlanNudgeClick);
  dom.planNudge.addEventListener("pointerdown", onPlanNudgePointerDown);
  window.addEventListener("pointermove", onPlanPointerMove);
  window.addEventListener("pointermove", onNudgePointerMove);
  window.addEventListener("pointerup", onPlanPointerUp);
  window.addEventListener("pointerup", onNudgePointerUp);
  window.addEventListener("pointerup", onPlanZoomPointerUp);
  window.addEventListener("pointercancel", onPlanPointerUp);
  window.addEventListener("pointercancel", onNudgePointerUp);
  window.addEventListener("pointercancel", onPlanZoomPointerUp);
  dom.addNoteBtn.addEventListener("click", addNote);
  dom.noteInput.addEventListener("keydown", (event) => {
    if(event.key === "Enter") addNote();
  });
  dom.openObjectBuilderBtn?.addEventListener("click", () => openObjectBuilder());
  dom.builderCloseBtn?.addEventListener("click", closeObjectBuilder);
  dom.builderSaveBtn?.addEventListener("click", saveObjectBuilder);
  dom.builderFitBtn?.addEventListener("click", () => builder3d?.fitView());
  dom.wallSheetBtn?.addEventListener("click", openWallSheet);
  dom.wallSheetCloseBtn?.addEventListener("click", closeWallSheet);
  dom.wallSheetSaveBtn?.addEventListener("click", saveWallSheetImage);
  dom.wallSheetModal?.addEventListener("click", (event) => {
    if(event.target === dom.wallSheetModal) closeWallSheet();
  });
  dom.objectBuilder?.addEventListener("click", onObjectBuilderClick);
  dom.objectBuilder?.addEventListener("input", onObjectBuilderInput);
  dom.builderSnapInput?.addEventListener("change", () => builder3d?.setSnap(dom.builderSnapInput.value));
  dom.quickAddCancelBtn?.addEventListener("click", closeQuickAdd);
  dom.quickAddConfirmBtn?.addEventListener("click", confirmQuickAdd);
  [dom.quickAddW, dom.quickAddD, dom.quickAddH, dom.quickAddGl, dom.quickAddLumens, dom.quickAddKelvin, dom.quickAddBeam].forEach((input) => {
    input?.addEventListener("keydown", (event) => {
      if(event.key === "Enter") confirmQuickAdd();
    });
  });
  dom.quickAddModal?.addEventListener("click", (event) => {
    if(event.target === dom.quickAddModal) closeQuickAdd();
  });
  [dom.builderOverallW, dom.builderOverallD, dom.builderOverallH].forEach((input) => {
    input?.addEventListener("change", () => resizeBuilderModel(input));
  });
}

async function loadCurrentLayout(force = false){
  const id = new URLSearchParams(location.search).get("id") || DEFAULT_LAYOUT_ID;
  dom.layoutMeta.textContent = `ID ${id} を読み込み中`;
  try{
    state.plan = await loadLayout(id);
    state.design = await loadDesign(id, force);
    state.design.stairWallSegments = {};
    seedFinishes(state.plan, state.design);
    state.floorMode = String(state.plan.activeFloor || 0);
    state.planView = null;
    state.selectedId = null;
    dom.layoutMeta.textContent = `${state.plan.title} / ${DETAIL_VERSION_LABEL}`;
    dom.editLayoutLink.href = `../madori.html?id=${encodeURIComponent(id)}`;
    saveDesign(false);
    renderPalette();
    render();
  }catch(error){
    console.error(error);
    dom.layoutMeta.textContent = "間取りを読み込めませんでした";
    toast(error.message || "読み込みに失敗しました");
  }
}

async function openSavedLayouts(){
  if(!dom.savedLayoutsModal) return;
  dom.savedLayoutsModal.hidden = false;
  dom.savedLayoutsList.innerHTML = `<div class="savedLayoutsEmpty">保存済み間取りを読み込み中…</div>`;
  try{
    const layouts = await listSavedLayouts();
    renderSavedLayouts(layouts);
  }catch(error){
    console.warn(error);
    dom.savedLayoutsList.innerHTML = `<div class="savedLayoutsEmpty">一覧を取得できませんでした。通信状態を確認してください。</div>`;
  }
}

function closeSavedLayouts(){
  if(dom.savedLayoutsModal) dom.savedLayoutsModal.hidden = true;
}

function renderSavedLayouts(layouts){
  if(!layouts.length){
    dom.savedLayoutsList.innerHTML = `<div class="savedLayoutsEmpty">保存済みの間取りがありません。</div>`;
    return;
  }
  const currentId = state.plan?.id || "";
  dom.savedLayoutsList.innerHTML = layouts.map((layout) => {
    const current = layout.id === currentId ? " current" : "";
    const badge = layout.hasDetail ? `<span class="savedDetailBadge">詳細保存あり</span>` : `<span class="savedPlanBadge">間取りのみ</span>`;
    return `<article class="savedLayoutRow${current}">
      <div class="savedLayoutInfo">
        <b>${escapeHtml(layout.title)}</b>
        <span>${badge}<small>${escapeHtml(formatSavedLayoutDate(layout.updatedAt))}</small></span>
      </div>
      <div class="savedLayoutActions">
        <a href="./?id=${encodeURIComponent(layout.id)}">詳細を開く</a>
        <a class="secondary" href="../madori.html?id=${encodeURIComponent(layout.id)}">間取りを修正</a>
      </div>
    </article>`;
  }).join("");
}

function formatSavedLayoutDate(value){
  if(!value) return "";
  const date = new Date(value);
  if(!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("ja-JP", {
    month:"2-digit",
    day:"2-digit",
    hour:"2-digit",
    minute:"2-digit"
  });
}

async function loadDesign(layoutId, force){
  let local = null;
  if(!force){
    try{
      const raw = localStorage.getItem(storageKey(layoutId));
      if(raw) local = JSON.parse(raw);
    }catch(error){
      console.warn(error);
    }
  }
  try{
    const shared = await loadDetailDesign(layoutId);
    if(shared?.version === 1){
      const migrated = local?.version === 1 ? mergeLocalAndShared(local, shared) : shared;
      return mergeDesign(createDefaultDesign(layoutId), migrated);
    }
  }catch(error){
    console.warn(error);
    toast("共有データを取得できないため、この端末のデータを表示します");
  }
  if(local?.version === 1) return mergeDesign(createDefaultDesign(layoutId), local);
  return createDefaultDesign(layoutId);
}

function mergeLocalAndShared(local, shared){
  return {
    ...local,
    ...shared,
    exterior: { ...(local.exterior || {}), ...(shared.exterior || {}) },
    finishes: { ...(local.finishes || {}), ...(shared.finishes || {}) },
    customItems: mergeById(local.customItems, shared.customItems),
    customModels: mergeById(local.customModels, shared.customModels),
    notes: mergeById(local.notes, shared.notes)
  };
}

function mergeById(localItems, sharedItems){
  const merged = new Map();
  (Array.isArray(localItems) ? localItems : []).forEach((item) => {
    if(item?.id) merged.set(item.id, item);
  });
  (Array.isArray(sharedItems) ? sharedItems : []).forEach((item) => {
    if(item?.id) merged.set(item.id, item);
  });
  return [...merged.values()];
}

function mergeDesign(base, saved){
  const merged = {
    ...base,
    ...saved,
    exterior: { ...base.exterior, ...(saved.exterior || {}) },
    finishes: { ...base.finishes, ...(saved.finishes || {}) },
    lighting: normalizeLightingSettings(saved.lighting || base.lighting),
    customItems: Array.isArray(saved.customItems) ? saved.customItems.map(normalizeCustomItem) : [],
    customModels: Array.isArray(saved.customModels) ? saved.customModels.map(normalizeCustomModel) : [],
    stairWallSegments: saved.stairWallSegments && typeof saved.stairWallSegments === "object" ? { ...saved.stairWallSegments } : {},
    notes: Array.isArray(saved.notes) ? saved.notes : base.notes
  };
  return merged;
}

function normalizeLightingSettings(raw = {}){
  return {
    scene:["night", "evening", "day"].includes(raw.scene) ? raw.scene : LIGHTING_DEFAULTS.scene,
    quality:["direct", "standard", "high"].includes(raw.quality) ? raw.quality : LIGHTING_DEFAULTS.quality,
    showHeatmap:raw.showHeatmap !== false,
    showWallGlow:raw.showWallGlow !== false
  };
}

function lightingSettings(){
  if(!state.design) return { ...LIGHTING_DEFAULTS };
  state.design.lighting = normalizeLightingSettings(state.design.lighting);
  return state.design.lighting;
}

function updateLightingSettings(changes, showToast = false){
  if(!state.design) return;
  pushHistory();
  state.design.lighting = normalizeLightingSettings({ ...lightingSettings(), ...changes });
  saveDesign(false);
  renderLightingControls();
  renderLightingSummary();
  renderSceneOnly();
  if(showToast) toast("照明シミュレーション設定を更新しました");
}

function renderLightingControls(){
  if(!state.design) return;
  const settings = lightingSettings();
  [dom.lightingSceneMode, dom.lighting3dQuick].forEach((container) => {
    container?.querySelectorAll("[data-light-scene]").forEach((button) => {
      button.classList.toggle("on", button.dataset.lightScene === settings.scene);
    });
  });
  [dom.lightingQualityMode, dom.lighting3dQuick].forEach((container) => {
    container?.querySelectorAll("[data-light-quality]").forEach((button) => {
      button.classList.toggle("on", button.dataset.lightQuality === settings.quality);
    });
  });
  if(dom.lightingHeatmapInput) dom.lightingHeatmapInput.checked = !!settings.showHeatmap;
  if(dom.lightingWallGlowInput) dom.lightingWallGlowInput.checked = !!settings.showWallGlow;
  if(dom.lighting3dQuickText){
    const sceneShort = settings.scene === "day" ? "昼" : settings.scene === "evening" ? "夕方" : "夜";
    dom.lighting3dQuickText.textContent = `${sceneShort} / 反射${reflectionBounces(settings)}回`;
  }
  if(dom.lightingSimHint){
    const sceneLabel = settings.scene === "day" ? "昼・日射込み" : settings.scene === "evening" ? "夕方・弱い日射込み" : "夜・人工照明のみ";
    const bounce = reflectionBounces(settings);
    dom.lightingSimHint.textContent = `${sceneLabel} / ${bounce === 0 ? "反射なし" : `反射${bounce}回`} / 普通3Dには影響しません`;
  }
}

function normalizeCustomItem(item){
  const next = { ...item };
  if(next.kind === "site") next.locked = true;
  if(!next.layer) next.layer = "exterior";
  if(isLightItem(next)){
    next.lumens = finiteNumber(next.lumens, next.kind === "ceilingLight" ? 3000 : next.kind === "pendantLight" ? 800 : 600);
    next.kelvin = finiteNumber(next.kelvin, next.kind === "ceilingLight" ? 4000 : 2700);
    next.beamDeg = finiteNumber(next.beamDeg, next.kind === "downlight" ? 60 : next.kind === "pendantLight" ? 90 : 120);
    next.dimming = next.dimming !== false;
    next.lightOn = next.lightOn !== false;
  }
  if(Array.isArray(next.modelParts)) next.modelParts = cloneModelParts(next.modelParts);
  return next;
}

function normalizeCustomModel(model){
  const parts = normalizeModelParts(model?.parts);
  const size = modelSizeFromParts(parts);
  return {
    id: model?.id || uid(),
    label: String(model?.label || "作成部品").slice(0, 18),
    parts,
    w: Number(model?.w) || size.w,
    d: Number(model?.d) || size.d,
    h: Number(model?.h) || size.h,
    color: safeColor(model?.color, parts[0]?.color || "#b9c0c8"),
    layer: model?.layer === "furniture" ? "furniture" : "exterior",
    category: "作成部品",
    createdAt: model?.createdAt || new Date().toISOString()
  };
}

function normalizeModelParts(parts){
  const source = Array.isArray(parts) && parts.length ? parts : defaultModelParts();
  return source.slice(0, 24).map((part) => ({
    id: part.id || uid(),
    type: ["box", "cylinder", "sphere"].includes(part.type) ? part.type : "box",
    label: part.label || partLabel(part.type),
    xMm: finiteNumber(part.xMm, 0),
    yMm: finiteNumber(part.yMm, 0),
    zMm: finiteNumber(part.zMm, 0),
    wMm: clamp(finiteNumber(part.wMm, 600), 50, 6000),
    dMm: clamp(finiteNumber(part.dMm, 400), 50, 6000),
    hMm: clamp(finiteNumber(part.hMm, 500), 30, 5000),
    rotation: ((finiteNumber(part.rotation, 0) % 360) + 360) % 360,
    color: safeColor(part.color, "#b9c0c8")
  }));
}

function storageKey(layoutId){
  return `detail_study_${layoutId}_v1`;
}

function saveDesign(showToast = true){
  if(!state.plan || !state.design) return;
  localStorage.setItem(storageKey(state.plan.id), JSON.stringify(state.design));
  scheduleCloudSave(showToast);
}

function scheduleCloudSave(showToast){
  const revision = ++cloudSaveRevision;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(async () => {
    if(!state.plan || !state.design || revision !== cloudSaveRevision) return;
    const layoutId = state.plan.id;
    const snapshot = JSON.parse(JSON.stringify(state.design));
    try{
      await saveDetailDesign(layoutId, snapshot);
      if(showToast) toast("共有保存しました");
    }catch(error){
      console.warn(error);
      if(showToast) toast("端末には保存しましたが、共有保存に失敗しました");
    }
  }, showToast ? 0 : 600);
}

function historySnapshot(){
  return {
    design: JSON.parse(JSON.stringify(state.design)),
    selectedId: state.selectedId,
    floorMode: state.floorMode,
    view: state.view,
    workMode: state.workMode,
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
  state.workMode = snapshot.workMode || state.workMode;
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
  renderLightingControls();
  renderLightingSummary();
  renderSelectedPanel();
  renderSceneOnly();
  renderWorkModeInfo();
  updateUndoControls();
}

function renderSceneOnly(){
  if(!scene3d || !state.plan) return;
  scene3d.setState({
    plan: state.plan,
    design: {
      ...state.design,
      stairWallSegments: { ...(state.plan?.stairWallSegments || {}) }
    },
    floorMode: state.floorMode,
    layers: state.layers,
    selectedId: state.selectedId,
    lighting: {
      ...lightingSettings(),
      enabled: state.workMode === "lighting"
    }
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
  const baseLabel = state.floorMode === "all" ? "全体3D" : `${Number(state.floorMode) + 1}F 3D`;
  dom.viewBadge.textContent = state.workMode === "lighting" ? `${baseLabel} 照明` : baseLabel;
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
  const button = event.target.closest("button[data-work]");
  if(!button) return;
  const mode = button.dataset.work;
  const closingActivePanel = state.view === "plan" && state.workMode === mode && state.mobilePanelOpen;
  state.workMode = mode;
  if(state.view !== "3d") state.view = "plan";
  state.dockMode = mode === "review" ? "browse" : "select";
  state.measurePoints = [];
  state.mobilePanelOpen = !closingActivePanel;
  if(mode === "review") state.selectedId = null;
  render();
}

function renderWorkModeInfo(){
  const info = {
    furniture:["家具を配置","部屋を選ぶか、家具を追加して図面上で動かします。"],
    construction:["造作・内装を検討","ふかし壁、ニッチ、棚を追加。部屋を選ぶと仕上げも変更できます。"],
    lighting:["照明計画","3Dでは照明専用表示に切り替わり、床/壁の明るさと日射込みを確認できます。"],
    site:["外構を配置","駐車、アプローチ、デッキ、植栽などを検討します。"],
    review:["確認・閲覧","建物と配置物を重ねて確認します。間取り自体はここでは変更しません。"]
  }[state.workMode] || ["詳細検討","配置物を編集します。"];
  if(dom.workModeTitle) dom.workModeTitle.textContent = info[0];
  if(dom.workModeHint) dom.workModeHint.textContent = info[1];
}

function updateDockControls(){
  if(!dom.modeDock) return;
  document.body.dataset.view = state.view;
  document.body.dataset.dockMode = state.dockMode;
  document.body.dataset.workMode = state.workMode;
  document.body.dataset.panelOpen = state.mobilePanelOpen ? "1" : "0";
  [dom.modeDock, dom.workTabs].forEach((container) => {
    container?.querySelectorAll("button[data-work]").forEach((button) => {
      button.classList.toggle("on", button.dataset.work === state.workMode);
    });
  });
  dom.planModes?.querySelectorAll("button[data-plan-mode]").forEach((button) => {
    button.classList.toggle("on", button.dataset.planMode === state.dockMode);
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
  dom.wallColorInput.value = safeColor(ext.wallColor, "#f5f1e9");
  dom.porchTileInput.value = safeColor(ext.porchTileColor, "#cfc7bb");
  dom.fenceInput.checked = !!ext.fence;
  renderExteriorSettingsTabs();
}

function renderExteriorSettingsTabs(){
  if(!dom.siteSettingsTabs) return;
  dom.siteSettingsTabs.querySelectorAll("[data-site-tab]").forEach((button) => {
    button.classList.toggle("on", button.dataset.siteTab === state.siteSettingsTab);
  });
  document.querySelectorAll("[data-site-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.sitePanel !== state.siteSettingsTab;
  });
}

function applyEqualSiteOffsets(){
  const value = clamp(numberValue(dom.siteEqualInput, 2), 0, 15);
  [dom.siteNorthInput, dom.siteEastInput, dom.siteSouthInput, dom.siteWestInput].forEach((input) => {
    input.value = value;
  });
  applySiteOffsets(true);
}

function bindExteriorColorInputs(){
  let editSnapshot = null;
  const arm = () => {
    editSnapshot = editSnapshot || historySnapshot();
  };
  const update = () => {
    if(!state.design) return;
    if(editSnapshot){
      pushHistory(editSnapshot);
      editSnapshot = null;
    }
    const exterior = state.design.exterior;
    exterior.wallColor = safeColor(dom.wallColorInput.value, "#f5f1e9");
    exterior.porchTileColor = safeColor(dom.porchTileInput.value, "#cfc7bb");
    syncPorchTileItems(exterior.porchTileColor);
    saveDesign(false);
    renderPlan();
    renderLists();
    renderSceneOnly();
  };
  ["wallColorInput","porchTileInput"].forEach((id) => {
    dom[id].addEventListener("focus", arm);
    dom[id].addEventListener("input", update);
  });
}

function syncPorchTileItems(color){
  (state.design?.customItems || []).forEach((item) => {
    if(item.kind === "approach" || item.kind === "porchStep") item.color = color;
  });
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
  site.locked = true;
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
  site.locked = true;
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
  const guideFurnitureCount = state.layers.guideFurniture ? furn.filter((item) => !isStructuralStair(item)).length : 0;
  const custom = visibleCustomItems();
  const detailedFurnitureCount = custom.filter((item) => item.layer === "furniture" || item.layer === "shelves").length;
  const lights = custom.filter(isLightItem);
  const totalLumens = lights.reduce((sum, item) => sum + Math.max(0, Number(item.lumens || 0)), 0);
  const m2 = rooms.reduce((sum, room) => sum + areaM2(room), 0);
  const common = [
    `<span>${formatM2(m2)}</span>`,
    `<span>${formatTsubo(m2)}</span>`,
    `<span>部屋 ${groupRooms(rooms).length}</span>`
  ];
  if(state.workMode === "lighting"){
    common.push(`<span>照明 ${lights.length}</span>`, `<span>${Math.round(totalLumens).toLocaleString()}lm</span>`);
  }else if(state.workMode === "site"){
    common.push(`<span>外構 ${custom.filter((item) => item.layer === "exterior").length}</span>`);
  }else if(state.workMode === "construction"){
    common.push(
      `<span>造作 ${custom.filter((item) => ["shelves", "openings"].includes(item.layer) || item.category === "造作").length}</span>`,
      `<span>家具 ${Math.max(0, detailedFurnitureCount - lights.length)}</span>`
    );
  }else{
    common.push(`<span>窓/建具 ${openings.length}</span>`, `<span>家具 ${detailedFurnitureCount + guideFurnitureCount - lights.length}</span>`);
  }
  dom.metricStrip.innerHTML = common.join("");
}

function renderPalette(){
  dom.exteriorPalette.innerHTML = renderLibrary([...customModelLibrary("exterior"), ...EXTERIOR_LIBRARY], "外構");
  dom.palette.innerHTML = renderLibrary([
    ...customModelLibrary("furniture"),
    ...FURNITURE_LIBRARY.filter((item) => ["家具", "家電", "自由"].includes(item.category))
  ], "家具");
  dom.constructionPalette.innerHTML = renderLibrary(
    FURNITURE_LIBRARY.filter((item) => ["棚", "造作", "窓"].includes(item.category)),
    "造作"
  );
  dom.lightingPalette.innerHTML = renderLibrary(FURNITURE_LIBRARY.filter((item) => item.category === "照明"), "照明");
  [dom.exteriorPalette, dom.palette, dom.constructionPalette, dom.lightingPalette].forEach((palette) => {
    if(!palette) return;
    palette.onclick = (event) => {
      const editButton = event.target.closest("[data-model-edit]");
      if(editButton){
        openObjectBuilder(editButton.dataset.modelEdit);
        return;
      }
      const deleteButton = event.target.closest("[data-model-delete]");
      if(deleteButton){
        deleteCustomModel(deleteButton.dataset.modelDelete);
        return;
      }
      const modelButton = event.target.closest("button[data-model-id]");
      if(modelButton){
        addCustomModelItem(modelButton.dataset.modelId);
        return;
      }
      const button = event.target.closest("button[data-kind]");
      if(!button) return;
      openQuickAdd(button.dataset.kind);
    };
  });
}

function renderLibrary(items, fallbackCategory){
  const categories = [...new Set(items.map((item) => item.category || fallbackCategory))];
  return categories.map((category) => {
    const buttons = items.filter((item) => (item.category || fallbackCategory) === category).map((item) => {
      const button = `<button type="button" data-kind="${escapeAttr(item.kind)}" ${item.modelId ? `data-model-id="${escapeAttr(item.modelId)}"` : ""} data-tone="${item.tone}">
        <b>${escapeHtml(item.label)}</b><span>${escapeHtml(item.meta || "")}</span>
      </button>`;
      return item.modelId
        ? `<div class="paletteModel">${button}<div class="paletteModelActions">
            <button class="paletteModelEdit" type="button" data-model-edit="${escapeAttr(item.modelId)}">編集</button>
            <button class="paletteModelDelete" type="button" data-model-delete="${escapeAttr(item.modelId)}">削除</button>
          </div></div>`
        : button;
    }).join("");
    return `<div class="paletteGroup"><div class="paletteTitle">${escapeHtml(category)}</div><div class="paletteGrid">${buttons}</div></div>`;
  }).join("");
}

function allLibraryItems(){
  return [...EXTERIOR_LIBRARY, ...customModelLibrary(), ...FURNITURE_LIBRARY];
}

function customModelLibrary(layer = ""){
  return (state.design?.customModels || [])
    .filter((model) => !layer || (model.layer || "exterior") === layer)
    .map((model) => ({
    kind: `customModel:${model.id}`,
    label: model.label,
    meta: `${Math.round(model.w)}x${Math.round(model.d)}`,
    tone: "blue",
    w: model.w,
    d: model.d,
    h: model.h,
    color: model.color,
    layer: model.layer || "exterior",
    category: "作成部品",
    modelId: model.id,
    modelParts: model.parts
  }));
}

function deleteCustomModel(modelId){
  const model = (state.design?.customModels || []).find((item) => item.id === modelId);
  if(!model) return;
  if(!window.confirm(`保存部品「${model.label}」を削除しますか？\n配置済みの部品は残ります。`)) return;
  pushHistory();
  state.design.customModels = state.design.customModels.filter((item) => item.id !== modelId);
  saveDesign(false);
  renderPalette();
  toast(`${model.label}を保存部品から削除しました`);
}

function onPlanPointerDown(event){
  if(state.dockMode === "measure"){
    event.preventDefault();
    addMeasurePoint(event);
    return;
  }
  if(state.dockMode === "browse") return;
  const target = event.target.closest("[data-id]");
  if(!target) return;
  const item = findCustomById(target.dataset.id);
  if(!item) return;
  event.preventDefault();
  if(item.locked){
    state.selectedId = item.id;
    state.mobilePanelOpen = false;
    render();
    return;
  }
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
  if(changed){
    pushHistory(state.drag.before);
    state.suppressPlanClickUntil = Date.now() + 350;
  }
  try{ dom.planSvg.releasePointerCapture?.(state.drag.pointerId); }catch(_){}
  state.drag = null;
  document.body.classList.remove("draggingPlan");
  saveDesign(false);
  render();
}

function onPlanNudgeClick(event){
  const button = event.target.closest("button[data-move],button[data-size-step],button[data-rotate-step],button[data-delete-selected],button[data-duplicate-selected]");
  if(!button) return;
  const item = findCustomById(state.selectedId);
  if(!item) return;
  if(item.locked) return;
  event.preventDefault();
  if(button.dataset.deleteSelected){
    deleteCustomItem(item.id);
    return;
  }
  if(button.dataset.duplicateSelected){
    duplicateCustomItem(item.id);
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
  if(button.dataset.rotateStep){
    const step = Number(button.dataset.rotateStep);
    if(Number.isFinite(step)){
      pushHistory();
      item.rotation = ((Number(item.rotation || 0) + step) % 360 + 360) % 360;
      saveDesign(false);
      renderPlan();
      renderLists();
      renderLightingSummary();
      renderSelectedPanel();
      renderSceneOnly();
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
  renderLightingSummary();
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
  if(item.locked){
    toast("敷地は固定中です。敷地条件から変更してください");
    return;
  }
  pushHistory();
  state.design.customItems = state.design.customItems.filter((candidate) => candidate.id !== id);
  state.selectedId = null;
  saveDesign(false);
  render();
  toast(`${item.label || "選択中"}を削除しました`);
}

function duplicateCustomItem(id){
  const item = findCustomById(id);
  if(!item || item.locked) return;
  pushHistory();
  const copy = {
    ...item,
    id: uid(),
    label: `${item.label || "部品"} コピー`.slice(0, 20),
    x: snapFine(item.x + mmToPx(300)),
    y: snapFine(item.y + mmToPx(300)),
    modelParts: Array.isArray(item.modelParts) ? cloneModelParts(item.modelParts) : item.modelParts
  };
  state.design.customItems.push(copy);
  state.selectedId = copy.id;
  saveDesign(false);
  render();
  toast(`${item.label || "部品"}を複製しました`);
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

function planViewport(bounds = displayBounds()){
  if(!state.planView){
    state.planView = {
      cx: bounds.minX + bounds.width / 2,
      cy: bounds.minY + bounds.height / 2,
      zoom: 1
    };
  }
  const zoom = clamp(Number(state.planView.zoom || 1), 0.45, 6);
  const width = bounds.width / zoom;
  const height = bounds.height / zoom;
  return {
    minX: state.planView.cx - width / 2,
    minY: state.planView.cy - height / 2,
    width,
    height
  };
}

function zoomPlan(factor, anchor = null){
  const bounds = displayBounds();
  const before = planViewport(bounds);
  const point = anchor || { x:before.minX + before.width / 2, y:before.minY + before.height / 2 };
  const nextZoom = clamp(state.planView.zoom * factor, 0.45, 6);
  const ratio = state.planView.zoom / nextZoom;
  state.planView.cx = point.x + (state.planView.cx - point.x) * ratio;
  state.planView.cy = point.y + (state.planView.cy - point.y) * ratio;
  state.planView.zoom = nextZoom;
  renderPlan();
}

function onPlanWheel(event){
  if(state.view !== "plan") return;
  event.preventDefault();
  zoomPlan(event.deltaY < 0 ? 1.16 : 0.86, svgPoint(event));
}

function onPlanZoomPointerDown(event){
  state.planPointers.set(event.pointerId, { x:event.clientX, y:event.clientY });
  if(state.planPointers.size === 1 && state.dockMode === "browse"){
    planViewport(displayBounds());
    state.planPan = {
      pointerId:event.pointerId,
      clientX:event.clientX,
      clientY:event.clientY,
      cx:state.planView?.cx,
      cy:state.planView?.cy,
      moved:false
    };
    try{ dom.planSvg.setPointerCapture?.(event.pointerId); }catch(_){}
  }
  if(state.planPointers.size === 2){
    state.drag = null;
    state.planPan = null;
    document.body.classList.remove("draggingPlan");
    const points = [...state.planPointers.values()];
    state.planPinch = {
      distance:Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
      zoom:state.planView?.zoom || 1
    };
  }
}

function onPlanZoomPointerMove(event){
  if(!state.planPointers.has(event.pointerId)) return;
  state.planPointers.set(event.pointerId, { x:event.clientX, y:event.clientY });
  if(state.planPan && state.planPointers.size === 1 && state.planPan.pointerId === event.pointerId){
    event.preventDefault();
    const bounds = displayBounds();
    const viewport = planViewport(bounds);
    const rect = dom.planSvg.getBoundingClientRect();
    if(rect.width > 0 && rect.height > 0){
      const dx = event.clientX - state.planPan.clientX;
      const dy = event.clientY - state.planPan.clientY;
      state.planView.cx = state.planPan.cx - dx * viewport.width / rect.width;
      state.planView.cy = state.planPan.cy - dy * viewport.height / rect.height;
      state.planPan.moved ||= Math.hypot(dx, dy) > 3;
      renderPlan();
    }
    return;
  }
  if(!state.planPinch || state.planPointers.size < 2) return;
  event.preventDefault();
  const points = [...state.planPointers.values()];
  const distance = Math.max(20, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
  const rect = dom.planSvg.getBoundingClientRect();
  const centerEvent = {
    clientX:(points[0].x + points[1].x) / 2,
    clientY:(points[0].y + points[1].y) / 2
  };
  const anchor = svgPoint(centerEvent);
  const targetZoom = clamp(state.planPinch.zoom * distance / Math.max(20, state.planPinch.distance), 0.45, 6);
  const current = state.planView?.zoom || 1;
  if(rect.width > 0 && Math.abs(targetZoom - current) > 0.005) zoomPlan(targetZoom / current, anchor);
}

function onPlanZoomPointerUp(event){
  state.planPointers.delete(event.pointerId);
  if(state.planPointers.size < 2) state.planPinch = null;
  if(state.planPan?.pointerId === event.pointerId){
    try{ dom.planSvg.releasePointerCapture?.(event.pointerId); }catch(_){}
    state.planPan = null;
  }
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
  const viewport = planViewport(bounds);
  dom.planSvg.setAttribute("viewBox", `${viewport.minX} ${viewport.minY} ${viewport.width} ${viewport.height}`);
  const items = floorItems(state.plan, state.floorMode);
  const rooms = items.filter((item) => item.type === "room" && !item.void);
  const frames = items.filter((item) => item.type === "frame");
  const walls = items.filter((item) => item.type === "wallLine");
  const openings = items.filter((item) => item.type === "opening");
  const furn = items.filter((item) => item.type === "furn" || item.type === "stair");
  const chunks = [];
  if(state.layers.site && !hasSiteItem()) chunks.push(renderExteriorSvg(bounds));
  frames.forEach((frame) => {
    chunks.push(`<rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" fill="#fffef9" stroke="rgba(31,35,28,.34)" stroke-width="2"/>`);
  });
  if(state.layers.rooms){
    groupRooms(rooms).forEach((group) => chunks.push(renderRoomGroupSvg(group)));
  }
  if(state.layers.walls){
    walls.forEach((wall) => {
      chunks.push(`<line class="fixedPlanLine" x1="${wall.x1}" y1="${wall.y1}" x2="${wall.x2}" y2="${wall.y2}" stroke="#1f241f" stroke-width="${Math.max(4, wall.thick || 8)}" stroke-linecap="square"/>`);
    });
  }
  if(state.layers.openings){
    openings.forEach((opening) => chunks.push(renderOpeningSvg(opening)));
  }
  furn.filter((item) => isStructuralStair(item) || state.layers.guideFurniture).forEach((item) => chunks.push(renderFurnitureSvg(item, true)));
  visibleCustomItems().forEach((item) => {
    if(isItemLayerVisible(item)) chunks.push(renderFurnitureSvg(item, false));
  });
  if(state.layers.site) chunks.push(renderSiteDistanceSvg());
  chunks.push(renderMeasureSvg());
  dom.planSvg.innerHTML = chunks.join("");
  const selected = findSelected();
  const workLabel = { furniture:"家具", construction:"造作・内装", lighting:"照明", site:"外構", review:"確認" }[state.workMode] || "図面";
  dom.planHudTitle.textContent = state.dockMode === "browse"
    ? `${workLabel}・移動`
    : state.dockMode === "measure"
      ? `${workLabel}・計測`
      : selected?.source === "custom" ? `選択: ${selected.item.label}` : workLabel;
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
  if(!item || item.locked || (isMobileViewport() && state.mobilePanelOpen)){
    dom.planNudge.hidden = true;
    dom.planNudge.innerHTML = "";
    return;
  }
  const step = Number(item.nudgeMm || 100);
  dom.planNudge.hidden = false;
  dom.planNudge.innerHTML = `<div class="nudgeMiniHead"><b>${escapeHtml(item.label || "選択中")}</b><div><button type="button" data-duplicate-selected="1">複製</button><button type="button" data-delete-selected="1">削除</button></div></div>
    <div class="nudgeSteps">
      <button type="button" data-size-step="10" class="${step === 10 ? "on" : ""}">1cm</button>
      <button type="button" data-size-step="100" class="${step === 100 ? "on" : ""}">10cm</button>
      <button type="button" data-rotate-step="90">90°回転</button>
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

function hasSiteItem(){
  return (state.design?.customItems || []).some((item) => item.layer === "exterior" && item.kind === "site");
}

function itemLayerKey(item){
  return item?.kind === "site" ? "site" : item?.layer;
}

function isItemLayerVisible(item){
  const key = itemLayerKey(item);
  return state.layers[key] !== false;
}

function formatDistance(px){
  return `${(pxToMm(px) / 1000).toFixed(2)}m`;
}

function displayBounds(){
  const base = floorBounds(state.plan, state.floorMode, state.layers.exterior || state.layers.site ? 150 : 70);
  const items = visibleCustomItems().filter((item) => item.layer === "exterior" && isItemLayerVisible(item));
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

function groupRooms(rooms){
  const groups = [];
  const pending = new Set(rooms);
  while(pending.size){
    const first = pending.values().next().value;
    pending.delete(first);
    const floorIndex = Number(first.floorIndex || 0);
    const label = first.label || "部屋";
    const connected = [first];
    for(let index = 0; index < connected.length; index++){
      const current = connected[index];
      [...pending].forEach((candidate) => {
        if(Number(candidate.floorIndex || 0) !== floorIndex || (candidate.label || "部屋") !== label) return;
        if(!roomRectsTouch(current, candidate)) return;
        pending.delete(candidate);
        connected.push(candidate);
      });
    }
    groups.push({ key:`${floorIndex}:${label}:${first.id}`, floorIndex, label, rooms:connected });
  }
  return groups;
}

function roomRectsTouch(a, b){
  const tolerance = 2;
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return (overlapX > tolerance && overlapY >= -tolerance)
    || (overlapY > tolerance && overlapX >= -tolerance);
}

function isLightItem(item){
  return !!item && (item.category === "照明" || ["downlight", "pendantLight", "ceilingLight"].includes(item.kind));
}

function roomLightingRows(){
  if(!state.plan) return [];
  const rooms = roomsForFloor(state.plan, state.floorMode);
  const groups = groupRooms(rooms);
  const lights = visibleCustomItems().filter(isLightItem);
  const openings = openingsForFloor(state.plan, state.floorMode).filter((item) => item.kind === "window");
  const settings = lightingSettings();
  return groups.map((group) => {
    const groupLights = lights.filter((light) => {
      if(Number(light.floorIndex || 0) !== Number(group.floorIndex || 0)) return false;
      const cx = light.x + light.w / 2;
      const cy = light.y + light.h / 2;
      return group.rooms.some((room) => cx >= room.x && cx <= room.x + room.w && cy >= room.y && cy <= room.y + room.h);
    });
    const area = group.rooms.reduce((sum, room) => sum + areaM2(room), 0);
    const lumens = groupLights.reduce((sum, light) => sum + (light.lightOn === false ? 0 : Math.max(0, Number(light.lumens || 0))), 0);
    const sampled = sampleRoomLighting(group, groupLights, openings, settings);
    const lux = sampled.avg;
    const target = lightingTarget(group.label);
    const status = lux < target.min ? "dark" : lux > target.max ? "bright" : "ok";
    return { ...group, area, lights:groupLights, lumens, lux, minLux:sampled.min, maxLux:sampled.max, sampleCount:sampled.count, target, status };
  });
}

function sampleRoomLighting(group, lights, windows, settings){
  const step = settings.quality === "high" ? mmToPx(450) : settings.quality === "direct" ? mmToPx(800) : mmToPx(600);
  const values = [];
  group.rooms.forEach((room) => {
    const cols = clamp(Math.ceil(room.w / step), 1, 10);
    const rows = clamp(Math.ceil(room.h / step), 1, 10);
    for(let row = 0; row < rows; row++){
      for(let col = 0; col < cols; col++){
        const x = room.x + (col + 0.5) * room.w / cols;
        const y = room.y + (row + 0.5) * room.h / rows;
        values.push(estimatePointLux(x, y, Number(group.floorIndex || 0), lights, windows, settings));
      }
    }
  });
  if(!values.length) return { avg:0, min:0, max:0, count:0 };
  const sum = values.reduce((acc, value) => acc + value, 0);
  return {
    avg:Math.round(sum / values.length),
    min:Math.round(Math.min(...values)),
    max:Math.round(Math.max(...values)),
    count:values.length
  };
}

function estimatePointLux(x, y, floorIndex, lights, windows, settings){
  const direct = lights.reduce((sum, light) => sum + lightPointLux(light, x, y), 0);
  const bounces = reflectionBounces(settings);
  const reflect = bounces === 0 ? 0 : direct * (bounces === 1 ? 0.18 : 0.28);
  const daylight = daylightPointLux(x, y, floorIndex, windows, settings);
  return Math.max(0, direct + reflect + daylight);
}

function lightPointLux(light, x, y){
  if(!light || light.lightOn === false) return 0;
  const lumens = clamp(Number(light.lumens || 0), 0, 20000);
  if(lumens <= 0) return 0;
  const lx = pxToMm((light.x || 0) + (light.w || 0) / 2) / 1000;
  const ly = pxToMm((light.y || 0) + (light.h || 0) / 2) / 1000;
  const px = pxToMm(x) / 1000;
  const py = pxToMm(y) / 1000;
  const horizontal = Math.hypot(px - lx, py - ly);
  const height = clamp(Number(light.glMm || 2350) / 1000, 0.35, 3.2);
  const distance2 = Math.max(0.12, height * height + horizontal * horizontal);
  const incidence = clamp(height / Math.sqrt(distance2), 0, 1);
  const beamDeg = clamp(Number(light.beamDeg || (light.kind === "ceilingLight" ? 120 : 70)), 15, 180);
  const half = beamDeg * Math.PI / 360;
  const angle = Math.atan2(horizontal, height);
  if(angle > half * 1.16) return 0;
  const edge = angle > half ? clamp(1 - (angle - half) / Math.max(0.01, half * 0.16), 0, 1) : 1;
  const solidAngle = Math.max(0.35, 2 * Math.PI * (1 - Math.cos(half)));
  const candela = lumens / solidAngle;
  const diffuser = light.kind === "ceilingLight" ? 0.82 : light.kind === "pendantLight" ? 0.72 : 0.95;
  return candela * incidence * edge * diffuser / distance2;
}

function daylightPointLux(x, y, floorIndex, windows, settings){
  if(settings.scene === "night") return 0;
  const base = settings.scene === "day" ? 180 : 48;
  let lux = 0;
  windows.forEach((opening) => {
    if(Number(opening.floorIndex || floorIndex) !== floorIndex && opening.floorIndex !== undefined) return;
    const cx = ((opening.x1 || 0) + (opening.x2 || 0)) / 2;
    const cy = ((opening.y1 || 0) + (opening.y2 || 0)) / 2;
    const widthM = Math.max(0.3, pxToMm(Math.hypot((opening.x2 || 0) - (opening.x1 || 0), (opening.y2 || 0) - (opening.y1 || 0))) / 1000);
    const heightM = Math.max(0.4, (Number(opening.winT || 2000) - Number(opening.winB || 900)) / 1000);
    const distM = Math.max(0.45, pxToMm(Math.hypot(x - cx, y - cy)) / 1000);
    const areaFactor = clamp(widthM * heightM / 2.0, 0.25, 2.2);
    lux += base * areaFactor / (1 + distM * 0.72);
  });
  return lux;
}

function reflectionBounces(settings){
  if(settings.quality === "high") return 2;
  if(settings.quality === "direct") return 0;
  return 1;
}

function lightingTarget(label){
  const text = String(label || "");
  if(/キッチン/.test(text)) return { min:300, max:500 };
  if(/LDK|リビング|ダイニング/.test(text)) return { min:200, max:350 };
  if(/洗面|ランドリー|脱衣/.test(text)) return { min:200, max:400 };
  if(/玄関|廊下|階段|収納|土間/.test(text)) return { min:75, max:200 };
  if(/寝室|洋室|和室/.test(text)) return { min:100, max:250 };
  if(/トイレ|お風呂|浴室/.test(text)) return { min:100, max:300 };
  return { min:100, max:300 };
}

function renderLightingSummary(){
  if(!dom.lightingSummary || !state.plan) return;
  const rows = roomLightingRows();
  if(!rows.length){
    dom.lightingSummary.innerHTML = `<div class="emptySummary">表示中の階に部屋がありません</div>`;
    return;
  }
  dom.lightingSummary.innerHTML = rows.map((row) => {
    const statusLabel = row.status === "dark" ? "不足" : row.status === "bright" ? "明るめ" : "目安内";
    const daylight = lightingSettings().scene === "night" ? "" : " / 日射込";
    return `<button type="button" class="luxRow ${row.status}" data-room-id="${escapeAttr(row.rooms[0].id)}">
      <span><b>${escapeHtml(row.label)}</b><small>${row.lights.length}灯 / ${Math.round(row.lumens).toLocaleString()}lm</small></span>
      <span class="luxValue"><b>${row.lux} lx</b><small>最暗${row.minLux} / 最大${row.maxLux}${daylight} ${statusLabel}</small></span>
    </button>`;
  }).join("");
  dom.lightingSummary.onclick = (event) => {
    const row = event.target.closest("[data-room-id]");
    if(!row) return;
    state.selectedId = row.dataset.roomId;
    state.dockMode = "select";
    state.mobilePanelOpen = true;
    render();
  };
}

function renderRoomGroupSvg(group){
  const room = group.rooms[0];
  const ids = new Set(group.rooms.map((item) => item.id));
  const selected = ids.has(state.selectedId) ? " selected" : "";
  const finish = state.design.finishes?.[room.id] || {};
  const floorDef = FINISHES.floor.find((item) => item.id === finish.floor);
  const fill = floorDef?.color || room.color || "#fff3e0";
  const totalArea = group.rooms.reduce((sum, item) => sum + areaM2(item), 0);
  const totalWeight = group.rooms.reduce((sum, item) => sum + Math.max(1, item.w * item.h), 0);
  const cx = group.rooms.reduce((sum, item) => sum + (item.x + item.w / 2) * Math.max(1, item.w * item.h), 0) / totalWeight;
  const cy = group.rooms.reduce((sum, item) => sum + (item.y + item.h / 2) * Math.max(1, item.w * item.h), 0) / totalWeight;
  const rects = group.rooms.map((item) => `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" fill="${fill}" stroke="rgba(31,35,28,.18)" stroke-width=".8"/>`).join("");
  return `<g class="planRoom${selected}" data-id="${room.id}">
    ${rects}
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="planLabel">${escapeHtml(group.label)}</text>
    <text x="${cx}" y="${cy + 9}" text-anchor="middle" class="planSub">${formatM2(totalArea)}</text>
  </g>`;
}

function renderOpeningSvg(opening){
  const color = opening.kind === "window" ? "#2a91bd" : "#a86a38";
  return `<g class="fixedOpening">
    <line x1="${opening.x1}" y1="${opening.y1}" x2="${opening.x2}" y2="${opening.y2}" stroke="${color}" stroke-width="7" stroke-linecap="round"/>
    <line x1="${opening.x1}" y1="${opening.y1}" x2="${opening.x2}" y2="${opening.y2}" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
  </g>`;
}

function renderFurnitureSvg(item, existing){
  const selected = state.selectedId === item.id ? " selected" : "";
  const guideClass = existing && item.type === "furn" ? " guideItem" : "";
  const label = escapeHtml(item.label || "家具");
  const color = item.color || (existing ? "#d8dce3" : "#c9c9d2");
  const rotate = item.rotation ? ` transform="rotate(${item.rotation} ${item.x + item.w / 2} ${item.y + item.h / 2})"` : "";
  if(Array.isArray(item.modelParts) && item.modelParts.length) return renderCustomModelSvg(item, selected, label, rotate);
  if(item.layer === "exterior") return renderExteriorItemSvg(item, selected, label, color, rotate);
  if(!existing && isLightItem(item)){
    const cx = item.x + item.w / 2;
    const cy = item.y + item.h / 2;
    const beam = clamp(Number(item.beamDeg || 60), 15, 170);
    const beamRadius = Math.max(12, mmToPx(clamp(Number(item.glMm || 2400) * Math.tan((beam * Math.PI / 180) / 2), 600, 5000)));
    const influence = state.workMode === "lighting"
      ? `<circle class="lightInfluence" cx="${cx}" cy="${cy}" r="${beamRadius}" fill="${kelvinCss(item.kelvin)}" fill-opacity=".11" stroke="${kelvinCss(item.kelvin)}" stroke-opacity=".42" stroke-width="1.5" stroke-dasharray="5 4"/>`
      : "";
    const pickRing = selected
      ? `<circle class="lightPickRing" cx="${cx}" cy="${cy}" r="18" fill="none" stroke="#1687d9" stroke-width="3"/>`
      : "";
    return `<g class="planItem lightItem${selected}" data-id="${item.id}">
      ${influence}
      ${pickRing}
      <circle cx="${cx}" cy="${cy}" r="${Math.max(6, Math.min(12, item.w / 2))}" fill="${color}" stroke="#6d622d" stroke-width="1.5"/>
      <path d="M ${cx - 4} ${cy} H ${cx + 4} M ${cx} ${cy - 4} V ${cx} ${cy + 4}" stroke="#6d622d" stroke-width="1.4"/>
      <text x="${cx}" y="${cy + 24}" text-anchor="middle" class="${selected ? "selectedLightLabel" : "planSub"}">${selected ? "配置中 " : ""}${Math.round(Number(item.lumens || 0))}lm</text>
    </g>`;
  }
  if(item.kind === "plant" || item.kind === "tree"){
    const r = Math.max(4, Math.min(item.w, item.h) / 2);
    const cls = existing ? "fixedPlanItem" : `planItem${selected}`;
    const idAttr = existing ? "" : ` data-id="${item.id}"`;
    return `<g class="${cls}"${idAttr}><circle cx="${item.x + item.w / 2}" cy="${item.y + item.h / 2}" r="${r}" fill="${color}" stroke="#355d38" stroke-width="1.5"/><text x="${item.x + item.w / 2}" y="${item.y + item.h / 2 + 3}" text-anchor="middle" class="planSub">${label}</text></g>`;
  }
  const itemClass = existing ? `fixedPlanItem${guideClass}` : `planItem${guideClass}${selected}`;
  const idAttr = existing ? "" : ` data-id="${item.id}"`;
  return `<g class="${itemClass}"${idAttr}>
    <g${rotate}><rect x="${item.x}" y="${item.y}" width="${Math.max(3, item.w)}" height="${Math.max(3, item.h)}" rx="2" fill="${color}" stroke="rgba(31,35,28,.42)" stroke-width="1.4"/></g>
    <text x="${item.x + item.w / 2}" y="${item.y + item.h / 2 + 3}" text-anchor="middle" class="planSub">${label}</text>
  </g>`;
}

function kelvinCss(kelvin){
  const k = clamp(Number(kelvin || 3000), 2000, 6500);
  if(k < 3000) return "#ffd37c";
  if(k < 4000) return "#ffeab0";
  if(k < 5000) return "#f7f7e8";
  return "#d7e9ff";
}

function isStructuralStair(item){
  return !!item && (item.type === "stair" || (item.type === "furn" && /(?:^階段|直線階段|かね折れ階段)/.test(item.label || "")));
}

function isSelectableDetailTarget(id){
  if(!id) return false;
  if(findCustomById(id)) return true;
  const selected = findSelectedById(id);
  if(selected?.source !== "room") return false;
  return ["furniture", "construction", "lighting"].includes(state.workMode);
}

function findSelectedById(id){
  if(!id || !state.plan) return null;
  for(const [floorIndex, floor] of state.plan.floors.entries()){
    const found = (floor.items || []).find((item) => item.id === id);
    if(found) return { source:found.type === "room" ? "room" : "plan", item:{ ...found, floorIndex } };
  }
  const custom = (state.design?.customItems || []).find((item) => item.id === id);
  return custom ? { source:"custom", item:custom } : null;
}

function renderCustomModelSvg(item, selected, label, rotate){
  const normalizedParts = normalizeModelParts(item.modelParts);
  const size = modelSizeFromParts(normalizedParts);
  const scaleX = pxToMm(item.w) / Math.max(1, size.w);
  const scaleY = pxToMm(item.h) / Math.max(1, size.d);
  const centerX = item.x + item.w / 2;
  const centerY = item.y + item.h / 2;
  const parts = normalizedParts.map((part) => {
    const x = centerX + mmToPx((part.xMm - size.centerX - part.wMm / 2) * scaleX);
    const y = centerY + mmToPx((part.yMm - size.centerY - part.dMm / 2) * scaleY);
    const w = Math.max(3, mmToPx(part.wMm * scaleX));
    const h = Math.max(3, mmToPx(part.dMm * scaleY));
    const cx = x + w / 2;
    const cy = y + h / 2;
    const partRotate = part.rotation ? ` transform="rotate(${part.rotation} ${cx} ${cy})"` : "";
    if(part.type === "cylinder" || part.type === "sphere"){
      return `<ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}" fill="${escapeAttr(part.color)}" fill-opacity=".88" stroke="rgba(31,35,28,.42)" stroke-width="1.2"${partRotate}/>`;
    }
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${escapeAttr(part.color)}" fill-opacity=".88" stroke="rgba(31,35,28,.42)" stroke-width="1.2"${partRotate}/>`;
  }).join("");
  const cls = item.layer === "exterior" ? `planItem exteriorItem${selected}` : `planItem${selected}`;
  const handle = selected && !item.locked ? `<rect data-resize="1" x="${item.x + item.w - 9}" y="${item.y + item.h - 9}" width="18" height="18" rx="4" fill="#286fd6" stroke="#fff" stroke-width="2"/>` : "";
  return `<g class="${cls}" data-id="${item.id}">
    <g${rotate}>${parts}
      <rect x="${item.x}" y="${item.y}" width="${Math.max(3, item.w)}" height="${Math.max(3, item.h)}" rx="2" fill="none" stroke="rgba(31,35,28,.26)" stroke-width="1.1" stroke-dasharray="5 4"/>
      ${handle}
    </g>
    <text x="${centerX}" y="${centerY + 3}" text-anchor="middle" class="planSub">${label}</text>
  </g>`;
}

function renderExteriorItemSvg(item, selected, label, color, rotate){
  const cx = item.x + item.w / 2;
  const cy = item.y + item.h / 2;
  const cls = `planItem exteriorItem${selected}`;
  const handle = selected && !item.locked ? `<rect data-resize="1" x="${item.x + item.w - 9}" y="${item.y + item.h - 9}" width="18" height="18" rx="4" fill="#286fd6" stroke="#fff" stroke-width="2"/>` : "";
  const commonText = `<text x="${cx}" y="${cy + 3}" text-anchor="middle" class="planSub">${label}</text>`;
  if(item.kind === "site"){
    return `<g class="siteBoundary">
      <rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" fill="${color}" fill-opacity=".42" stroke="#59764d" stroke-width="3" stroke-dasharray="10 8"/>
      <text x="${item.x + 12}" y="${item.y + 18}" class="planSub">${label}</text>
    </g>`;
  }
  if(item.kind === "porchStep"){
    const steps = 3;
    const lines = Array.from({ length: steps - 1 }, (_, index) => {
      const y = item.y + item.h * ((index + 1) / steps);
      return `<line x1="${item.x}" y1="${y}" x2="${item.x + item.w}" y2="${y}" stroke="rgba(31,35,28,.35)" stroke-width="1.5"/>`;
    }).join("");
    return `<g class="${cls}" data-id="${item.id}">
      <g${rotate}><rect x="${item.x}" y="${item.y}" width="${Math.max(3, item.w)}" height="${Math.max(3, item.h)}" rx="2" fill="${color}" fill-opacity=".86" stroke="rgba(31,35,28,.42)" stroke-width="1.8"/>
      ${lines}${handle}</g>${commonText}
    </g>`;
  }
  if(item.kind === "frontDoor"){
    return `<g class="${cls}" data-id="${item.id}">
      <g${rotate}><rect x="${item.x}" y="${item.y}" width="${Math.max(3, item.w)}" height="${Math.max(3, item.h)}" rx="2" fill="${color}" fill-opacity=".9" stroke="#3f3028" stroke-width="1.8"/>
      <circle cx="${item.x + item.w * .78}" cy="${cy}" r="3" fill="#e2c46d"/>
      ${handle}</g>${commonText}
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
    return `<g class="${cls}" data-id="${item.id}">
      <g${rotate}><rect x="${item.x}" y="${item.y}" width="${item.w}" height="${Math.max(8, item.h)}" rx="2" fill="${color}" stroke="#70583e" stroke-width="1.5"/>
      <line x1="${item.x}" y1="${cy}" x2="${item.x + item.w}" y2="${cy}" stroke="#f3e5d0" stroke-width="2" stroke-dasharray="10 8"/>
      ${handle}</g>${commonText}
    </g>`;
  }
  const stroke = item.kind === "parking" || item.kind === "driveway" ? "#8c918b" : "rgba(31,35,28,.42)";
  const dash = item.kind === "parking" ? ` stroke-dasharray="12 7"` : "";
  return `<g class="${cls}" data-id="${item.id}">
    <g${rotate}><rect x="${item.x}" y="${item.y}" width="${Math.max(3, item.w)}" height="${Math.max(3, item.h)}" rx="3" fill="${color}" fill-opacity=".72" stroke="${stroke}" stroke-width="1.8"${dash}/>${handle}</g>
    ${item.kind === "parking" ? `<text x="${cx}" y="${cy - 8}" text-anchor="middle" class="planSub">P</text>` : ""}${commonText}
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
  const detail = isLightItem(item)
    ? `${Math.round(Number(item.lumens || 0))}lm / ${Math.round(Number(item.kelvin || 0))}K`
    : `${pxToMm(item.w)}x${pxToMm(item.h)}x${Math.round(item.heightMm || 0)}mm`;
  return `<div class="denseRow${on}" data-id="${item.id}">
    <div><b>${escapeHtml(item.label)}</b><span>${escapeHtml(item.category || item.layer)} / ${detail}</span></div>
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
    const custom = findCustomById(state.selectedId);
    if(custom) state.workMode = workModeForItem(custom);
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
    if(state.workMode === "lighting"){
      dom.selectedPanel.innerHTML = renderRoomLightingEditor(selected.item);
      bindRoomLightingEditor();
    }else if(state.workMode === "construction"){
      dom.selectedPanel.innerHTML = renderRoomEditor(selected.item);
      bindRoomEditor(selected.item);
    }else{
      dom.selectedPanel.innerHTML = renderRoomPlacementPanel(selected.item);
    }
  }else if(selected.source === "custom"){
    dom.selectedPanel.innerHTML = renderCustomEditor(selected.item);
    bindCustomEditor(selected.item);
  }else{
    dom.selectedPanel.innerHTML = `<div class="fixedPlanMessage"><b>固定間取り</b><span>壁・建具・階段の変更は「間取りを修正」から行います。</span></div>`;
  }
}

function renderRoomPlacementPanel(room){
  const rooms = matchingRooms(room);
  const totalArea = rooms.reduce((sum, item) => sum + areaM2(item), 0);
  return `<div class="selectedHead"><div><b>${escapeHtml(room.label)}</b><span>${formatM2(totalArea)}</span></div></div>
    <div class="placementHint"><b>配置先に選択中</b><span>次に追加する家具を、この部屋の中央へ仮配置します。追加後に図面上で移動してください。</span></div>`;
}

function renderRoomEditor(room){
  const rooms = matchingRooms(room);
  const finish = state.design.finishes[room.id] || {};
  const totalArea = rooms.reduce((sum, item) => sum + areaM2(item), 0);
  return `<div class="selectedHead"><div><b>${escapeHtml(room.label)}</b><span>${formatM2(totalArea)} / ${rooms.length}ブロックを一括</span></div></div>
    <div class="selectedGrid">
      <label>床<select id="floorFinish">${finishOptions("floor", finish.floor)}</select></label>
      <label>壁<select id="wallFinish">${finishOptions("wall", finish.wall)}</select></label>
      <label>天井<select id="ceilingFinish">${finishOptions("ceiling", finish.ceiling)}</select></label>
      <label>メモ<input id="roomMemo" type="text" maxlength="40" value="${escapeAttr(finish.memo || "")}"></label>
    </div>`;
}

function renderRoomLightingEditor(room){
  const row = roomLightingRows().find((item) => item.rooms.some((target) => target.id === room.id));
  if(!row) return `<div class="selectedHead"><div><b>${escapeHtml(room.label)}</b><span>照明計算対象外</span></div></div>`;
  const statusLabel = row.status === "dark" ? "不足" : row.status === "bright" ? "明るめ" : "目安内";
  const fixtures = row.lights.length
    ? row.lights.map((light) => `<button type="button" data-select-light="${escapeAttr(light.id)}">${escapeHtml(light.label)} ${Math.round(light.lumens || 0)}lm</button>`).join("")
    : `<span class="emptySummary">この部屋には照明がありません</span>`;
  const daylight = lightingSettings().scene === "night" ? "人工照明のみ" : "日射込み";
  return `<div class="selectedHead"><div><b>${escapeHtml(row.label)}</b><span>${formatM2(row.area)} / 床面サンプル${row.sampleCount}点</span></div></div>
    <div class="roomLuxCard ${row.status}">
      <b>${row.lux} lx</b>
      <span>目安 ${row.target.min}–${row.target.max} lx / ${statusLabel}</span>
      <small>${daylight}。平均${row.lux}lx / 最暗${row.minLux}lx / 最大${row.maxLux}lx。配光・距離・反射を使った検討用近似です。</small>
    </div>
    <div class="buttonRow lightFixtureList">${fixtures}</div>`;
}

function bindRoomLightingEditor(){
  dom.selectedPanel.querySelectorAll("[data-select-light]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.selectLight;
      render();
    });
  });
}

function finishOptions(group, active){
  return FINISHES[group].map((item) => `<option value="${item.id}" ${item.id === active ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("");
}

function bindRoomEditor(room){
  const rooms = matchingRooms(room);
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
      rooms.forEach((target) => {
        const targetFinish = state.design.finishes[target.id] || (state.design.finishes[target.id] = {});
        targetFinish[key] = event.target.value;
      });
      saveDesign(false);
      renderPlan();
      renderSceneOnly();
    });
  });
}

function matchingRooms(room){
  const floor = state.plan?.floors?.[Number(room.floorIndex || 0)];
  if(!floor) return [room];
  const rooms = (floor.items || []).filter((item) => item.type === "room" && !item.void);
  return groupRooms(rooms).find((group) => group.rooms.some((item) => item.id === room.id))?.rooms || [room];
}

function renderCustomEditor(item){
  const isExterior = item.layer === "exterior";
  const isLight = isLightItem(item);
  const modelEditButton = Array.isArray(item.modelParts) && item.modelParts.length
    ? `<button type="button" id="editModelBtn">部品を編集</button>`
    : "";
  const wallSnapButton = !isExterior && !isLight
    ? `<button type="button" id="snapWallBtn">最寄りの壁に付ける</button>`
    : "";
  if(item.locked){
    return `<div class="selectedHead"><div><b>${escapeHtml(item.label)}</b><span>固定・敷地条件で変更</span></div></div>
      <div class="selectedGrid">
        <label>色<input id="itemColor" type="color" value="${escapeAttr(item.color || "#dfeadb")}"></label>
        <label>幅mm<input type="number" value="${pxToMm(item.w)}" disabled></label>
        <label>奥行mm<input type="number" value="${pxToMm(item.h)}" disabled></label>
        <label>固定<input type="text" value="移動不可" disabled></label>
      </div>`;
  }
  const lightFields = isLight ? `<div class="lightEditor">
      <div class="blockTitle">照明設定</div>
      <div class="selectedGrid">
        <label>明るさ lm<input id="itemLumens" type="number" min="50" max="20000" step="50" value="${Math.round(item.lumens || 600)}"></label>
        <label>色温度 K<input id="itemKelvin" type="number" min="2000" max="6500" step="100" value="${Math.round(item.kelvin || 2700)}"></label>
        <label>配光角°<input id="itemBeam" type="number" min="15" max="180" step="5" value="${Math.round(item.beamDeg || 60)}"></label>
        <label class="checkLine"><input id="itemDimming" type="checkbox" ${item.dimming ? "checked" : ""}>調光対応</label>
        <label class="checkLine"><input id="itemLightOn" type="checkbox" ${item.lightOn !== false ? "checked" : ""}>点灯して計算</label>
      </div>
    </div>` : "";
  return `<div class="selectedHead"><div><b>${escapeHtml(item.label)}</b><span>${escapeHtml(isExterior ? (item.category || "外構") : floorLabel(item.floorIndex))}</span></div><button class="dangerBtn" id="deleteItemBtn" type="button">削除</button></div>
    <div class="selectedGrid">
      <label>名前<input id="itemLabel" type="text" maxlength="20" value="${escapeAttr(item.label)}"></label>
      <label>色<input id="itemColor" type="color" value="${escapeAttr(item.color || "#c9c9d2")}"></label>
      <label>幅mm<input id="itemW" type="number" min="50" step="10" value="${pxToMm(item.w)}"></label>
      <label>奥行mm<input id="itemD" type="number" min="50" step="10" value="${pxToMm(item.h)}"></label>
      <label>高さmm<input id="itemH" type="number" min="10" step="10" value="${Math.round(item.heightMm || 700)}"></label>
      <label>床からmm<input id="itemGl" type="number" min="0" step="10" value="${Math.round(item.glMm || 0)}"></label>
      <label>回転°<input id="itemRot" type="number" step="15" value="${Math.round(item.rotation || 0)}"></label>
    </div>
    ${lightFields}
    <div class="buttonRow">
      <button type="button" data-nudge="0,-16">↑</button>
      <button type="button" data-nudge="-16,0">←</button>
      <button type="button" data-nudge="16,0">→</button>
      <button type="button" data-nudge="0,16">↓</button>
      <button type="button" id="rotateItemBtn">90°回転</button>
      ${wallSnapButton}
      <button type="button" id="duplicateItemBtn">複製</button>
      ${modelEditButton}
    </div>`;
}

function bindCustomEditor(item){
  if(item.locked){
    const input = document.getElementById("itemColor");
    if(!input) return;
    let editSnapshot = null;
    input.addEventListener("focus", () => {
      editSnapshot = editSnapshot || historySnapshot();
    });
    input.addEventListener("input", () => {
      if(editSnapshot){
        pushHistory(editSnapshot);
        editSnapshot = null;
      }
      item.color = input.value;
      saveDesign(false);
      renderPlan();
      renderSceneOnly();
    });
    return;
  }
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
    item.glMm = numberValue(document.getElementById("itemGl"), item.glMm || 0);
    item.rotation = numberValue(document.getElementById("itemRot"), item.rotation || 0);
    if(isLightItem(item)){
      item.lumens = clamp(numberValue(document.getElementById("itemLumens"), item.lumens || 600), 50, 20000);
      item.kelvin = clamp(numberValue(document.getElementById("itemKelvin"), item.kelvin || 2700), 2000, 6500);
      item.beamDeg = clamp(numberValue(document.getElementById("itemBeam"), item.beamDeg || 60), 15, 180);
      item.dimming = !!document.getElementById("itemDimming")?.checked;
      item.lightOn = !!document.getElementById("itemLightOn")?.checked;
    }
    saveDesign(false);
    renderPlan();
    renderLists();
    renderLightingSummary();
    renderSceneOnly();
  };
  ["itemLabel","itemColor","itemW","itemD","itemH","itemGl","itemRot","itemLumens","itemKelvin","itemBeam","itemDimming","itemLightOn"].forEach((id) => {
    const input = document.getElementById(id);
    if(!input) return;
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
  document.getElementById("snapWallBtn")?.addEventListener("click", () => snapItemToNearestWall(item));
  document.getElementById("duplicateItemBtn").addEventListener("click", () => duplicateCustomItem(item.id));
  document.getElementById("editModelBtn")?.addEventListener("click", () => {
    const modelId = item.modelId || "";
    if(modelId){
      openObjectBuilder(modelId);
      return;
    }
    const size = modelSizeFromParts(item.modelParts);
    const model = normalizeCustomModel({
      id: uid(),
      label: item.label,
      layer: item.layer,
      parts: item.modelParts,
      w: size.w,
      d: size.d,
      h: size.h,
      color: item.color
    });
    state.design.customModels.unshift(model);
    item.modelId = model.id;
    saveDesign(false);
    renderPalette();
    openObjectBuilder(model.id);
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

function snapItemToNearestWall(item){
  const floorIndex = Number(item.floorIndex || 0);
  const floor = state.plan?.floors?.[floorIndex];
  if(!floor) return;
  const rooms = (floor.items || []).filter((room) => room.type === "room" && !room.void);
  if(!rooms.length) return;
  const cx = item.x + item.w / 2;
  const cy = item.y + item.h / 2;
  const room = rooms.find((candidate) => (
    cx >= candidate.x && cx <= candidate.x + candidate.w
    && cy >= candidate.y && cy <= candidate.y + candidate.h
  )) || rooms.reduce((best, candidate) => {
    const nx = clamp(cx, candidate.x, candidate.x + candidate.w);
    const ny = clamp(cy, candidate.y, candidate.y + candidate.h);
    const distance = Math.hypot(cx - nx, cy - ny);
    return !best || distance < best.distance ? { room:candidate, distance } : best;
  }, null)?.room;
  if(!room) return;
  const group = groupRooms(rooms.map((candidate) => ({ ...candidate, floorIndex })))
    .find((candidate) => candidate.rooms.some((member) => member.id === room.id));
  if(!group) return;
  const segments = roomPerimeterSegments(group);
  const radians = Number(item.rotation || 0) * Math.PI / 180;
  const halfW = item.w / 2;
  const halfD = item.h / 2;
  const extentX = Math.abs(Math.cos(radians)) * halfW + Math.abs(Math.sin(radians)) * halfD;
  const extentY = Math.abs(Math.sin(radians)) * halfW + Math.abs(Math.cos(radians)) * halfD;
  let best = null;
  segments.forEach((segment) => {
    const tangentExtent = Math.abs(segment.ux) * extentX + Math.abs(segment.uy) * extentY;
    const normalExtent = Math.abs(segment.nx) * extentX + Math.abs(segment.ny) * extentY;
    const rawAlong = (cx - segment.ox) * segment.ux + (cy - segment.oy) * segment.uy;
    const minAlong = Math.min(segment.lenPx / 2, tangentExtent);
    const maxAlong = Math.max(segment.lenPx / 2, segment.lenPx - tangentExtent);
    const along = clamp(rawAlong, minAlong, maxAlong);
    const wallX = segment.ox + segment.ux * along;
    const wallY = segment.oy + segment.uy * along;
    const targetX = wallX + segment.nx * normalExtent;
    const targetY = wallY + segment.ny * normalExtent;
    const distance = Math.hypot(targetX - cx, targetY - cy);
    if(!best || distance < best.distance) best = { targetX, targetY, distance, segment };
  });
  if(!best) return;
  pushHistory();
  item.x = best.targetX - item.w / 2;
  item.y = best.targetY - item.h / 2;
  saveDesign(false);
  render();
  toast(`${best.segment.name}の壁に付けました`);
}

function openQuickAdd(kind){
  const preset = allLibraryItems().find((item) => item.kind === kind);
  if(!preset || !dom.quickAddModal) return;
  state.pendingAddKind = kind;
  dom.quickAddTitle.textContent = `${preset.label}を追加`;
  dom.quickAddLabel.value = preset.label || "";
  dom.quickAddW.value = Math.round(preset.w || 900);
  dom.quickAddD.value = Math.round(preset.d || 300);
  dom.quickAddH.value = Math.round(preset.h || 700);
  dom.quickAddGl.value = Math.round(preset.gl || 0);
  const isLight = isLightItem(preset);
  dom.quickLightFields.hidden = !isLight;
  dom.quickAddLumens.value = Math.round(preset.lumens || 600);
  dom.quickAddKelvin.value = Math.round(preset.kelvin || 2700);
  dom.quickAddBeam.value = Math.round(preset.beamDeg || 60);
  dom.quickAddDimming.checked = preset.dimming !== false;
  dom.quickAddModal.hidden = false;
  setTimeout(() => dom.quickAddW?.select(), 0);
}

function closeQuickAdd(){
  state.pendingAddKind = "";
  if(dom.quickAddModal) dom.quickAddModal.hidden = true;
}

function confirmQuickAdd(){
  const kind = state.pendingAddKind;
  if(!kind) return;
  const dimensions = {
    label: dom.quickAddLabel.value.trim(),
    w: clamp(numberValue(dom.quickAddW, 900), 50, 10000),
    d: clamp(numberValue(dom.quickAddD, 300), 20, 10000),
    h: clamp(numberValue(dom.quickAddH, 700), 10, 10000),
    gl: clamp(numberValue(dom.quickAddGl, 0), 0, 10000),
    lumens: clamp(numberValue(dom.quickAddLumens, 600), 50, 20000),
    kelvin: clamp(numberValue(dom.quickAddKelvin, 2700), 2000, 6500),
    beamDeg: clamp(numberValue(dom.quickAddBeam, 60), 15, 180),
    dimming: !!dom.quickAddDimming.checked
  };
  closeQuickAdd();
  addCustomItem(kind, dimensions);
}

function addCustomItem(kind, dimensions = null){
  const preset = allLibraryItems().find((item) => item.kind === kind);
  if(!preset || !state.plan) return;
  pushHistory();
  const floorIndex = state.floorMode === "all" ? 0 : Number(state.floorMode || 0);
  const selected = findSelected();
  const rooms = roomsForFloor(state.plan, String(floorIndex));
  const selectedRoom = selected?.source === "room"
    ? selected.item
    : rooms.reduce((largest, room) => !largest || areaM2(room) > areaM2(largest) ? room : largest, null);
  const bounds = floorBounds(state.plan, String(floorIndex), 0);
  const center = selectedRoom
    ? { x: selectedRoom.x + selectedRoom.w / 2, y: selectedRoom.y + selectedRoom.h / 2 }
    : { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  const item = makeCustomItem(preset, floorIndex, center);
  if(dimensions){
    item.label = dimensions.label || item.label;
    item.w = mmToPx(dimensions.w);
    item.h = mmToPx(dimensions.d);
    item.heightMm = dimensions.h;
    item.glMm = dimensions.gl;
    if(isLightItem(item)){
      item.lumens = dimensions.lumens;
      item.kelvin = dimensions.kelvin;
      item.beamDeg = dimensions.beamDeg;
      item.dimming = dimensions.dimming;
      item.lightOn = true;
    }
    item.meta = `W${Math.round(dimensions.w)} D${Math.round(dimensions.d)} H${Math.round(dimensions.h)}`;
  }
  if(preset.layer === "exterior"){
    item.floorIndex = 0;
    state.view = "plan";
    state.floorMode = "0";
    placeExteriorItem(item, floorBounds(state.plan, "0", 0));
    if(item.kind === "approach" || item.kind === "porchStep") item.color = state.design.exterior.porchTileColor || item.color;
  }
  state.design.customItems.push(item);
  state.selectedId = item.id;
  state.workMode = workModeForItem(item);
  state.dockMode = "select";
  state.mobilePanelOpen = !isMobileViewport();
  state.nudgeUi = { x:null, y:null };
  saveDesign(false);
  render();
  toast(isMobileViewport()
    ? `${preset.label}を追加。青い器具をドラッグして配置`
    : `${preset.label}を追加しました`);
}

function workModeForItem(item){
  if(isLightItem(item)) return "lighting";
  if(item?.layer === "exterior") return "site";
  if(["棚", "造作", "窓"].includes(item?.category) || ["shelves", "openings"].includes(item?.layer)) return "construction";
  return "furniture";
}

function addCustomModelItem(modelId){
  const model = (state.design?.customModels || []).find((item) => item.id === modelId);
  if(!model || !state.plan) return;
  const preset = customModelLibrary().find((item) => item.modelId === modelId);
  if(!preset) return;
  addCustomItem(preset.kind);
}

function openObjectBuilder(modelId = ""){
  const model = (state.design?.customModels || []).find((item) => item.id === modelId);
  const parts = model ? cloneModelParts(model.parts) : defaultModelParts();
  state.builder = {
    modelId: model?.id || "",
    label: model?.label || "作成部品",
    layer: model?.layer || "exterior",
    parts,
    selectedPartId: parts[0]?.id || ""
  };
  dom.objectBuilder.hidden = false;
  document.body.classList.add("builderOpen");
  dom.objectBuilder.querySelectorAll("[data-builder-mode]").forEach((button) => button.classList.toggle("on", button.dataset.builderMode === "orbit"));
  builder3d?.setMode("orbit");
  builder3d?.setSnap(dom.builderSnapInput?.value || 50);
  renderObjectBuilder();
  requestAnimationFrame(() => builder3d?.fitView());
}

function closeObjectBuilder(){
  state.builder = null;
  dom.objectBuilder.hidden = true;
  document.body.classList.remove("builderOpen");
}

function saveObjectBuilder(){
  if(!state.builder || !state.design) return;
  const parts = normalizeModelParts(state.builder.parts);
  const size = modelSizeFromParts(parts);
  const label = dom.builderNameInput.value.trim() || state.builder.label || "作成部品";
  const layer = dom.builderLayerInput.value === "furniture" ? "furniture" : "exterior";
  const model = normalizeCustomModel({
    id: state.builder.modelId || uid(),
    label,
    layer,
    parts,
    w: size.w,
    d: size.d,
    h: size.h,
    color: parts[0]?.color || "#b9c0c8",
    createdAt: new Date().toISOString()
  });
  pushHistory();
  const index = (state.design.customModels || []).findIndex((item) => item.id === model.id);
  if(index >= 0){
    state.design.customModels[index] = model;
    syncModelInstances(model);
  }else{
    state.design.customModels.unshift(model);
  }
  saveDesign(false);
  renderPalette();
  renderLists();
  renderPlan();
  renderSceneOnly();
  closeObjectBuilder();
  toast(`${model.label}を保存しました`);
}

function syncModelInstances(model){
  (state.design.customItems || []).forEach((item) => {
    if(item.modelId !== model.id) return;
    item.label = model.label;
    item.layer = model.layer;
    item.modelParts = cloneModelParts(model.parts);
    item.color = model.color;
    item.w = mmToPx(model.w);
    item.h = mmToPx(model.d);
    item.heightMm = model.h;
  });
}

function onObjectBuilderClick(event){
  if(!state.builder) return;
  const mode = event.target.closest("[data-builder-mode]");
  if(mode){
    dom.objectBuilder.querySelectorAll("[data-builder-mode]").forEach((button) => button.classList.toggle("on", button === mode));
    builder3d?.setMode(mode.dataset.builderMode);
    return;
  }
  const add = event.target.closest("[data-builder-add]");
  if(add){
    addBuilderPart(add.dataset.builderAdd);
    return;
  }
  const duplicate = event.target.closest("[data-builder-duplicate]");
  if(duplicate){
    duplicateBuilderPart();
    return;
  }
  const anchor = event.target.closest("[data-builder-anchor]");
  if(anchor){
    alignBuilderPart(anchor.dataset.builderAnchor);
    return;
  }
  const zSnap = event.target.closest("[data-builder-zsnap]");
  if(zSnap){
    alignBuilderPartZ(zSnap.dataset.builderZsnap);
    return;
  }
  const partButton = event.target.closest("[data-builder-part]");
  if(partButton){
    state.builder.selectedPartId = partButton.dataset.builderPart;
    renderObjectBuilder();
    return;
  }
  const del = event.target.closest("[data-builder-delete]");
  if(del){
    deleteBuilderPart(del.dataset.builderDelete);
    return;
  }
  const rotate = event.target.closest("[data-builder-rotate]");
  if(rotate){
    const part = selectedBuilderPart();
    if(!part) return;
    part.rotation = ((Number(part.rotation || 0) + Number(rotate.dataset.builderRotate || 0)) % 360 + 360) % 360;
    renderObjectBuilder();
  }
}

function onObjectBuilderInput(event){
  if(!state.builder) return;
  if(event.target === dom.builderNameInput){
    state.builder.label = event.target.value;
    return;
  }
  if(event.target === dom.builderLayerInput){
    state.builder.layer = event.target.value === "furniture" ? "furniture" : "exterior";
    return;
  }
  const input = event.target.closest("[data-builder-field]");
  if(!input) return;
  const part = selectedBuilderPart();
  if(!part) return;
  const field = input.dataset.builderField;
  if(field === "color"){
    part.color = safeColor(input.value, part.color);
  }else if(field === "type"){
    part.type = input.value;
    part.label = partLabel(part.type);
    state.builder.parts = normalizeModelParts(state.builder.parts);
    renderObjectBuilder();
    return;
  }else{
    part[field] = Number(input.value);
  }
  state.builder.parts = normalizeModelParts(state.builder.parts);
  renderBuilderPreview();
  renderBuilderPartList();
}

function addBuilderPart(type){
  const part = normalizeModelParts([{
    id: uid(),
    type,
    label: partLabel(type),
    xMm: 0,
    yMm: 0,
    zMm: 0,
    wMm: type === "sphere" ? 450 : 700,
    dMm: type === "sphere" ? 450 : 450,
    hMm: type === "cylinder" ? 700 : type === "sphere" ? 450 : 500,
    color: type === "cylinder" ? "#9aa4aa" : type === "sphere" ? "#78a763" : "#b9c0c8",
    rotation: 0
  }])[0];
  state.builder.parts.push(part);
  state.builder.selectedPartId = part.id;
  renderObjectBuilder();
}

function duplicateBuilderPart(){
  const part = selectedBuilderPart();
  if(!part || state.builder.parts.length >= 24) return;
  const copy = {
    ...part,
    id: uid(),
    label: `${part.label} 複製`,
    xMm: part.xMm + part.wMm + 100
  };
  state.builder.parts.push(copy);
  state.builder.selectedPartId = copy.id;
  renderObjectBuilder();
  toast(`${part.label}を複製しました`);
}

function builderReferencePart(){
  const id = document.getElementById("builderReferenceInput")?.value;
  return state.builder.parts.find((part) => part.id === id) || state.builder.parts.find((part) => part.id !== state.builder.selectedPartId) || null;
}

function alignBuilderPart(anchor){
  const part = selectedBuilderPart();
  const reference = builderReferencePart();
  if(!part || !reference || part.id === reference.id) return;
  const inset = clamp(numberValue(document.getElementById("builderInsetInput"), 0), -3000, 3000);
  const [horizontal, vertical] = String(anchor).split("-");
  if(horizontal === "left") part.xMm = reference.xMm - reference.wMm / 2 + part.wMm / 2 + inset;
  else if(horizontal === "right") part.xMm = reference.xMm + reference.wMm / 2 - part.wMm / 2 - inset;
  else part.xMm = reference.xMm;
  if(vertical === "front") part.yMm = reference.yMm - reference.dMm / 2 + part.dMm / 2 + inset;
  else if(vertical === "back") part.yMm = reference.yMm + reference.dMm / 2 - part.dMm / 2 - inset;
  else part.yMm = reference.yMm;
  state.builder.parts = normalizeModelParts(state.builder.parts);
  renderObjectBuilder();
}

function alignBuilderPartZ(mode){
  const part = selectedBuilderPart();
  const reference = builderReferencePart();
  if(!part || !reference || part.id === reference.id) return;
  if(mode === "below") part.zMm = Math.max(0, reference.zMm - part.hMm);
  else if(mode === "above") part.zMm = reference.zMm + reference.hMm;
  else part.zMm = reference.zMm;
  state.builder.parts = normalizeModelParts(state.builder.parts);
  renderObjectBuilder();
}

function deleteBuilderPart(id){
  if(state.builder.parts.length <= 1){
    toast("部品は1つ以上必要です");
    return;
  }
  state.builder.parts = state.builder.parts.filter((part) => part.id !== id);
  state.builder.selectedPartId = state.builder.parts[0]?.id || "";
  renderObjectBuilder();
}

function selectedBuilderPart(){
  return (state.builder?.parts || []).find((part) => part.id === state.builder.selectedPartId) || state.builder?.parts?.[0] || null;
}

function renderObjectBuilder(){
  if(!state.builder) return;
  state.builder.parts = normalizeModelParts(state.builder.parts);
  if(!state.builder.parts.some((part) => part.id === state.builder.selectedPartId)){
    state.builder.selectedPartId = state.builder.parts[0]?.id || "";
  }
  dom.builderNameInput.value = state.builder.label || "作成部品";
  dom.builderLayerInput.value = state.builder.layer || "exterior";
  const size = modelSizeFromParts(state.builder.parts);
  dom.builderOverallW.value = Math.round(size.w);
  dom.builderOverallD.value = Math.round(size.d);
  dom.builderOverallH.value = Math.round(size.h);
  renderBuilderPreview();
  renderBuilderPartList();
  renderBuilderEditor();
}

function resizeBuilderModel(input){
  if(!state.builder || !input) return;
  const size = modelSizeFromParts(state.builder.parts);
  const current = input === dom.builderOverallW ? size.w : input === dom.builderOverallD ? size.d : size.h;
  const target = clamp(numberValue(input, current), 30, 6000);
  const scale = target / Math.max(1, current);
  const sx = input === dom.builderOverallW ? scale : 1;
  const sy = input === dom.builderOverallD ? scale : 1;
  const sz = input === dom.builderOverallH ? scale : 1;
  state.builder.parts.forEach((part) => {
    part.xMm = size.centerX + (part.xMm - size.centerX) * sx;
    part.yMm = size.centerY + (part.yMm - size.centerY) * sy;
    part.zMm *= sz;
    part.wMm *= sx;
    part.dMm *= sy;
    part.hMm *= sz;
  });
  state.builder.parts = normalizeModelParts(state.builder.parts);
  renderObjectBuilder();
}

function renderBuilderPreview(){
  const parts = state.builder.parts;
  const size = modelSizeFromParts(parts);
  builder3d?.setParts(parts, state.builder.selectedPartId);
  if(dom.builderSizeText && builder3d?.mode === "orbit"){
    dom.builderSizeText.textContent = `${Math.round(size.w)} x ${Math.round(size.d)} x ${Math.round(size.h)}mm`;
  }
}

function renderBuilderPartList(){
  dom.builderPartList.innerHTML = state.builder.parts.map((part, index) => {
    const on = part.id === state.builder.selectedPartId ? " on" : "";
    return `<button type="button" class="builderPart${on}" data-builder-part="${part.id}">
      <span style="background:${escapeAttr(part.color)}"></span><b>${index + 1}. ${escapeHtml(part.label)}</b>
    </button>`;
  }).join("");
}

function renderBuilderEditor(){
  const part = selectedBuilderPart();
  if(!part){
    dom.builderEditor.innerHTML = "";
    return;
  }
  const references = state.builder.parts.filter((item) => item.id !== part.id);
  const referenceOptions = references.map((item, index) => (
    `<option value="${item.id}">${escapeHtml(`${index + 1}. ${item.label}`)}</option>`
  )).join("");
  const left = Math.round(part.xMm - part.wMm / 2);
  const right = Math.round(part.xMm + part.wMm / 2);
  const front = Math.round(part.yMm - part.dMm / 2);
  const back = Math.round(part.yMm + part.dMm / 2);
  const bottom = Math.round(part.zMm);
  const top = Math.round(part.zMm + part.hMm);
  dom.builderEditor.innerHTML = `<div class="builderEditHead">
      <b>${escapeHtml(part.label)}</b>
      <button type="button" data-builder-delete="${part.id}">削除</button>
    </div>
    <div class="builderEdgeReadout">
      <span>左 ${left}</span><span>右 ${right}</span><span>前 ${front}</span>
      <span>後 ${back}</span><span>下 ${bottom}</span><span>上 ${top}</span>
    </div>
    ${references.length ? `<div class="builderPositionBox">
      <div class="builderPositionHead">
        <label>基準部品<select id="builderReferenceInput">${referenceOptions}</select></label>
        <label>端余白mm<input id="builderInsetInput" type="number" step="10" value="0"></label>
      </div>
      <div class="builderAnchorGrid">
        <button type="button" data-builder-anchor="left-front">左前</button>
        <button type="button" data-builder-anchor="center-front">前中央</button>
        <button type="button" data-builder-anchor="right-front">右前</button>
        <button type="button" data-builder-anchor="left-center">左中央</button>
        <button type="button" data-builder-anchor="center-center">中央</button>
        <button type="button" data-builder-anchor="right-center">右中央</button>
        <button type="button" data-builder-anchor="left-back">左後</button>
        <button type="button" data-builder-anchor="center-back">後中央</button>
        <button type="button" data-builder-anchor="right-back">右後</button>
      </div>
      <div class="builderZSnap">
        <button type="button" data-builder-zsnap="below">下面に付ける</button>
        <button type="button" data-builder-zsnap="same">同じ高さ</button>
        <button type="button" data-builder-zsnap="above">上面に載せる</button>
      </div>
    </div>` : ""}
    <div class="builderGrid">
      <label>形<select data-builder-field="type">
        <option value="box" ${part.type === "box" ? "selected" : ""}>四角</option>
        <option value="cylinder" ${part.type === "cylinder" ? "selected" : ""}>丸柱</option>
        <option value="sphere" ${part.type === "sphere" ? "selected" : ""}>球</option>
      </select></label>
      <label>色<input type="color" data-builder-field="color" value="${escapeAttr(part.color)}"></label>
      <label>横mm<input type="number" min="50" max="6000" step="10" data-builder-field="wMm" value="${Math.round(part.wMm)}"></label>
      <label>奥行mm<input type="number" min="50" max="6000" step="10" data-builder-field="dMm" value="${Math.round(part.dMm)}"></label>
      <label>高さmm<input type="number" min="30" max="5000" step="10" data-builder-field="hMm" value="${Math.round(part.hMm)}"></label>
      <label>地面からmm<input type="number" min="0" max="5000" step="10" data-builder-field="zMm" value="${Math.round(part.zMm)}"></label>
      <label>左右mm<input type="number" min="-5000" max="5000" step="10" data-builder-field="xMm" value="${Math.round(part.xMm)}"></label>
      <label>前後mm<input type="number" min="-5000" max="5000" step="10" data-builder-field="yMm" value="${Math.round(part.yMm)}"></label>
      <label>回転°<input type="number" step="15" data-builder-field="rotation" value="${Math.round(part.rotation || 0)}"></label>
    </div>
    <div class="builderEditActions">
      <button class="builderDuplicateBtn" type="button" data-builder-duplicate="1">この部品を複製</button>
      <div class="buttonRow">
        <button type="button" data-builder-rotate="-90">左90°</button>
        <button type="button" data-builder-rotate="90">右90°</button>
      </div>
    </div>`;
}

function defaultModelParts(){
  return normalizeModelParts([{
    id: uid(),
    type: "box",
    label: "四角",
    xMm: 0,
    yMm: 0,
    zMm: 0,
    wMm: 700,
    dMm: 450,
    hMm: 500,
    rotation: 0,
    color: "#b9c0c8"
  }]);
}

function partLabel(type){
  if(type === "cylinder") return "丸柱";
  if(type === "sphere") return "球";
  return "四角";
}

function modelSizeFromParts(parts){
  const normalized = Array.isArray(parts) && parts.length ? parts : defaultModelParts();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxH = 0;
  normalized.forEach((part) => {
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

function placeExteriorItem(item, bounds){
  const gap = 32;
  if(item.kind === "site"){
    item.x = bounds.minX - 96;
    item.y = bounds.minY - 96;
    item.w = Math.max(item.w, bounds.width + 192);
    item.h = Math.max(item.h, bounds.height + 192);
    return;
  }
  if(item.kind === "parking" || item.kind === "driveway" || item.kind === "bike" || item.kind === "car" || item.kind === "carport"){
    item.x = bounds.minX + bounds.width * 0.55;
    item.y = bounds.maxY + gap;
    return;
  }
  if(item.kind === "approach" || item.kind === "porchStep" || item.kind === "frontDoor" || item.kind === "gate"){
    item.x = bounds.minX + bounds.width * 0.18;
    item.y = bounds.maxY + gap;
    return;
  }
  if(item.kind === "freeExterior"){
    item.x = bounds.minX + bounds.width * 0.50;
    item.y = bounds.minY - item.h - gap;
    return;
  }
  if(String(item.kind || "").startsWith("customModel:")){
    item.x = bounds.minX + bounds.width * 0.50;
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
  return (state.design.customItems || []).filter((item) => (
    item.kind === "site" || item.floorIndex === Number(state.floorMode)
  ));
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

function wallSheetGroups(){
  if(!state.plan) return [];
  return groupRooms(roomsForFloor(state.plan, "all")).map((group) => ({
    ...group,
    floorIndex:Number(group.floorIndex || 0),
    key:group.key
  }));
}

function openWallSheet(){
  const groups = wallSheetGroups();
  if(!groups.length){
    toast("出力できる部屋がありません");
    return;
  }
  const selected = findSelected();
  const selectedGroup = selected?.source === "room"
    ? groups.find((group) => group.rooms.some((room) => room.id === selected.item.id))
    : null;
  const floorGroup = groups.find((group) => state.floorMode === "all" || group.floorIndex === Number(state.floorMode));
  state.wallSheetKey = selectedGroup?.key || floorGroup?.key || groups[0].key;
  renderWallSheetRooms();
  drawWallSheet();
  dom.wallSheetModal.hidden = false;
  document.body.classList.add("wallSheetOpen");
}

function closeWallSheet(){
  dom.wallSheetModal.hidden = true;
  document.body.classList.remove("wallSheetOpen");
}

function renderWallSheetRooms(){
  const groups = wallSheetGroups();
  const duplicateCount = {};
  groups.forEach((group) => {
    duplicateCount[`${group.floorIndex}:${group.label}`] = (duplicateCount[`${group.floorIndex}:${group.label}`] || 0) + 1;
  });
  const seen = {};
  dom.wallSheetRooms.innerHTML = groups.map((group) => {
    const duplicateKey = `${group.floorIndex}:${group.label}`;
    seen[duplicateKey] = (seen[duplicateKey] || 0) + 1;
    const suffix = duplicateCount[duplicateKey] > 1 ? seen[duplicateKey] : "";
    const on = group.key === state.wallSheetKey ? " on" : "";
    return `<button type="button" class="${on.trim()}" data-wall-sheet="${escapeAttr(group.key)}">${group.floorIndex + 1}F ${escapeHtml(group.label)}${suffix}</button>`;
  }).join("");
  dom.wallSheetRooms.querySelectorAll("[data-wall-sheet]").forEach((button) => {
    button.addEventListener("click", () => {
      state.wallSheetKey = button.dataset.wallSheet;
      renderWallSheetRooms();
      drawWallSheet();
    });
  });
}

function currentWallSheetGroup(){
  const groups = wallSheetGroups();
  return groups.find((group) => group.key === state.wallSheetKey) || groups[0] || null;
}

function roomPerimeterSegments(group){
  const members = group.rooms;
  const eps = 2;
  const segments = [];
  members.forEach((room) => {
    for(let side = 0; side < 4; side++){
      const horizontal = side === 0 || side === 2;
      const fixed = side === 0 ? room.y : side === 2 ? room.y + room.h : side === 3 ? room.x : room.x + room.w;
      const full = horizontal ? [room.x, room.x + room.w] : [room.y, room.y + room.h];
      const covered = [];
      members.forEach((other) => {
        if(other === room) return;
        if(side === 0 && Math.abs(other.y + other.h - room.y) <= eps){
          covered.push([Math.max(room.x, other.x), Math.min(room.x + room.w, other.x + other.w)]);
        }else if(side === 2 && Math.abs(other.y - room.y - room.h) <= eps){
          covered.push([Math.max(room.x, other.x), Math.min(room.x + room.w, other.x + other.w)]);
        }else if(side === 1 && Math.abs(other.x - room.x - room.w) <= eps){
          covered.push([Math.max(room.y, other.y), Math.min(room.y + room.h, other.y + other.h)]);
        }else if(side === 3 && Math.abs(other.x + other.w - room.x) <= eps){
          covered.push([Math.max(room.y, other.y), Math.min(room.y + room.h, other.y + other.h)]);
        }
      });
      covered.sort((a, b) => a[0] - b[0]);
      let cursor = full[0];
      const exposed = [];
      covered.forEach(([a, b]) => {
        if(b - a <= eps) return;
        if(a > cursor + eps) exposed.push([cursor, Math.min(a, full[1])]);
        cursor = Math.max(cursor, b);
      });
      if(cursor < full[1] - eps) exposed.push([cursor, full[1]]);
      exposed.forEach(([a, b]) => {
        if(b - a <= eps) return;
        if(side === 0) segments.push({ x1:a, y1:fixed, x2:b, y2:fixed, ox:a, oy:fixed, ux:1, uy:0, nx:0, ny:1, side, name:"北側" });
        if(side === 1) segments.push({ x1:fixed, y1:a, x2:fixed, y2:b, ox:fixed, oy:a, ux:0, uy:1, nx:-1, ny:0, side, name:"東側" });
        if(side === 2) segments.push({ x1:a, y1:fixed, x2:b, y2:fixed, ox:b, oy:fixed, ux:-1, uy:0, nx:0, ny:-1, side, name:"南側" });
        if(side === 3) segments.push({ x1:fixed, y1:a, x2:fixed, y2:b, ox:fixed, oy:b, ux:0, uy:-1, nx:1, ny:0, side, name:"西側" });
      });
    }
  });
  return segments.map((segment, index) => ({
    ...segment,
    index,
    lenPx:Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1),
    lenMm:pxToMm(Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1))
  }));
}

function wallSheetOpenings(segment, floor){
  const tolerance = 10;
  const horizontal = Math.abs(segment.y1 - segment.y2) < 0.1;
  return (floor.items || []).filter((item) => item.type === "opening").flatMap((opening) => {
    const openingHorizontal = Math.abs(opening.y1 - opening.y2) < 0.1;
    if(horizontal !== openingHorizontal) return [];
    if(horizontal && Math.abs(opening.y1 - segment.y1) > tolerance) return [];
    if(!horizontal && Math.abs(opening.x1 - segment.x1) > tolerance) return [];
    const p1 = (opening.x1 - segment.ox) * segment.ux + (opening.y1 - segment.oy) * segment.uy;
    const p2 = (opening.x2 - segment.ox) * segment.ux + (opening.y2 - segment.oy) * segment.uy;
    const a = Math.max(0, Math.min(p1, p2));
    const b = Math.min(segment.lenPx, Math.max(p1, p2));
    if(b - a < 2) return [];
    const isWindow = opening.kind === "window";
    return [{
      fromMm:pxToMm(a),
      widthMm:pxToMm(b - a),
      bottomMm:isWindow ? Number(opening.winB || 900) : 0,
      topMm:isWindow ? Number(opening.winT || 2000) : 2020,
      label:isWindow ? "窓" : opening.kind === "slide" ? "引戸" : opening.kind === "fold" ? "折戸" : "ドア",
      isWindow
    }];
  });
}

function wallSheetDevices(segment, floor){
  const tolerance = 5;
  return (floor.elec || []).flatMap((device) => {
    let wx = Number(device.wx);
    let wy = Number(device.wy);
    let nx = Number(device.nx);
    let ny = Number(device.ny);
    if(!Number.isFinite(wx) || !Number.isFinite(wy)){
      const room = (floor.items || []).find((item) => item.id === device.roomId);
      const wall = Number(device.wall);
      const offsetPx = mmToPx(Number(device.x || 0));
      if(!room || !Number.isFinite(wall)) return [];
      if(wall === 0){ wx = room.x + offsetPx; wy = room.y; nx = 0; ny = 1; }
      if(wall === 1){ wx = room.x + room.w; wy = room.y + offsetPx; nx = -1; ny = 0; }
      if(wall === 2){ wx = room.x + room.w - offsetPx; wy = room.y + room.h; nx = 0; ny = -1; }
      if(wall === 3){ wx = room.x; wy = room.y + room.h - offsetPx; nx = 1; ny = 0; }
    }
    if(!Number.isFinite(wx) || !Number.isFinite(wy)) return [];
    if(Number.isFinite(nx) && Number.isFinite(ny) && nx * segment.nx + ny * segment.ny < 0.5) return [];
    const normalDistance = Math.abs((wx - segment.x1) * segment.nx + (wy - segment.y1) * segment.ny);
    if(normalDistance > tolerance) return [];
    const alongPx = (wx - segment.ox) * segment.ux + (wy - segment.oy) * segment.uy;
    if(alongPx < -tolerance || alongPx > segment.lenPx + tolerance) return [];
    const kind = String(device.kind || "out").startsWith("sw") ? "sw" : "out";
    return [{
      xMm:pxToMm(Math.max(0, Math.min(segment.lenPx, alongPx))),
      heightMm:Number(device.h || (kind === "sw" ? 1200 : 250)),
      kind,
      symbol:kind === "sw" ? "S" : "○"
    }];
  });
}

function wallSheetFurniture(segment, floorIndex){
  const floor = state.plan.floors[floorIndex];
  const fixed = (floor.items || [])
    .filter((item) => item.type === "furn" || item.type === "stair")
    .map((item) => ({
      ...item,
      heightMm:Number(item.fh || (item.type === "stair" ? 2400 : 700)),
      glMm:Number(item.gl || 0)
    }));
  const detailed = (state.design.customItems || [])
    .filter((item) => Number(item.floorIndex || 0) === floorIndex)
    .filter((item) => item.layer !== "exterior" && !isLightItem(item));
  const tolerance = mmToPx(500);
  return [...fixed, ...detailed].flatMap((item) => {
    const horizontal = Math.abs(segment.y1 - segment.y2) < 0.1;
    let distance;
    if(horizontal){
      distance = segment.ny > 0 ? Math.abs(item.y - segment.y1) : Math.abs(item.y + item.h - segment.y1);
    }else{
      distance = segment.nx > 0 ? Math.abs(item.x - segment.x1) : Math.abs(item.x + item.w - segment.x1);
    }
    if(distance > tolerance) return [];
    const corners = [
      [item.x, item.y],
      [item.x + item.w, item.y],
      [item.x, item.y + item.h],
      [item.x + item.w, item.y + item.h]
    ];
    const projected = corners.map(([px, py]) => (px - segment.ox) * segment.ux + (py - segment.oy) * segment.uy);
    const fromPx = Math.max(0, Math.min(...projected));
    const toPx = Math.min(segment.lenPx, Math.max(...projected));
    if(toPx - fromPx < 2) return [];
    return [{
      fromMm:pxToMm(fromPx),
      widthMm:pxToMm(toPx - fromPx),
      heightMm:Number(item.heightMm || 700),
      glMm:Number(item.glMm || 0),
      label:String(item.label || "家具")
    }];
  });
}

async function drawWallSheet(){
  const group = currentWallSheetGroup();
  if(!group || !dom.wallSheetCanvas) return;
  const requestedKey = group.key;
  const floor = state.plan.floors[group.floorIndex];
  const segments = roomPerimeterSegments(group);
  const canvas = dom.wallSheetCanvas;
  const width = 1800;
  const columns = 2;
  const panelWidth = 830;
  const panelHeight = 500;
  const gap = 40;
  const startY = 270;
  const rows = Math.max(1, Math.ceil(segments.length / columns));
  canvas.width = width;
  canvas.height = startY + rows * (panelHeight + gap) + 210;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#5e6861";
  ctx.font = "bold 34px sans-serif";
  ctx.fillText("詳細3Dから壁パースを作成中…", 60, 80);
  const perspectives = [];
  for(const segment of segments){
    const dataUrl = scene3d?.captureWallPerspective({
      floorIndex:group.floorIndex,
      segment,
      roomDepthPx:wallViewDepthPx(group, segment),
      width:1200,
      height:720
    }) || "";
    perspectives.push(await loadImage(dataUrl));
  }
  if(state.wallSheetKey !== requestedKey) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#17211b";
  ctx.font = "bold 48px sans-serif";
  ctx.fillText(`${group.floorIndex + 1}F ${group.label}　電気計画用 3D壁パース`, 60, 75);
  ctx.fillStyle = "#667069";
  ctx.font = "26px sans-serif";
  ctx.fillText(`${state.plan.title} / 詳細側の家具・造作・窓・建具を反映`, 60, 120);
  ctx.font = "24px sans-serif";
  ctx.fillText("画像保存後、写真アプリのマークアップ等で希望位置・用途・高さを書き込んでください。", 60, 160);
  drawWallSheetMiniPlan(ctx, group, segments, 1370, 22, 360, 200);
  segments.forEach((segment, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = 50 + column * (panelWidth + gap);
    const y = startY + row * (panelHeight + gap);
    drawWallPerspectivePanel(ctx, segment, floor, perspectives[index], x, y, panelWidth, panelHeight);
  });
  const noteY = canvas.height - 155;
  ctx.strokeStyle = "#aeb5af";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(60, noteY, canvas.width - 120, 105);
  ctx.setLineDash([]);
  ctx.fillStyle = "#7b837e";
  ctx.font = "24px sans-serif";
  ctx.fillText("メモ：回路／用途／必要口数／家具との干渉など", 80, noteY + 34);
}

function wallViewDepthPx(group, segment){
  const minX = Math.min(...group.rooms.map((room) => room.x));
  const minY = Math.min(...group.rooms.map((room) => room.y));
  const maxX = Math.max(...group.rooms.map((room) => room.x + room.w));
  const maxY = Math.max(...group.rooms.map((room) => room.y + room.h));
  return Math.abs(segment.nx) > 0.5 ? maxX - minX : maxY - minY;
}

function loadImage(src){
  return new Promise((resolve) => {
    if(!src){ resolve(null); return; }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function drawWallPerspectivePanel(ctx, segment, floor, image, x, y, width, height){
  ctx.fillStyle = "#f8f8f5";
  ctx.strokeStyle = "#c9cec9";
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = "#1d2721";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(`壁 ${segment.index + 1}　${segment.name}　幅 ${Math.round(segment.lenMm)}mm`, x + 24, y + 38);
  const imageX = x + 18;
  const imageY = y + 56;
  const imageWidth = width - 36;
  const imageHeight = height - 108;
  if(image){
    const sourceRatio = image.width / image.height;
    const targetRatio = imageWidth / imageHeight;
    let sx = 0, sy = 0, sw = image.width, sh = image.height;
    if(sourceRatio > targetRatio){
      sw = image.height * targetRatio;
      sx = (image.width - sw) / 2;
    }else{
      sh = image.width / targetRatio;
      sy = (image.height - sh) / 2;
    }
    ctx.drawImage(image, sx, sy, sw, sh, imageX, imageY, imageWidth, imageHeight);
  }else{
    ctx.fillStyle = "#e8ece9";
    ctx.fillRect(imageX, imageY, imageWidth, imageHeight);
    ctx.fillStyle = "#737c76";
    ctx.font = "24px sans-serif";
    ctx.fillText("3D画像を作成できませんでした", imageX + 30, imageY + 60);
  }
  ctx.fillStyle = "rgba(255,255,255,.88)";
  ctx.fillRect(imageX + 12, imageY + imageHeight - 42, imageWidth - 24, 30);
  ctx.fillStyle = "#334039";
  ctx.font = "19px sans-serif";
  ctx.fillText(`室内側から壁 ${segment.index + 1} を見る　壁幅 ${Math.round(segment.lenMm)}mm`, imageX + 24, imageY + imageHeight - 20);
  const devices = wallSheetDevices(segment, floor);
  if(devices.length){
    ctx.textAlign = "right";
    ctx.fillStyle = "#286fd6";
    ctx.fillText(`既存電気 ${devices.length}箇所`, imageX + imageWidth - 24, imageY + imageHeight - 20);
    ctx.textAlign = "left";
  }
}

function drawWallPanel(ctx, segment, floor, floorIndex, x, y, width, height){
  const ceilingMm = 2400;
  ctx.fillStyle = "#f8f8f5";
  ctx.strokeStyle = "#c9cec9";
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = "#1d2721";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(`壁 ${segment.index + 1}　${segment.name}　幅 ${Math.round(segment.lenMm)}mm`, x + 24, y + 40);
  const areaX = x + 55;
  const areaY = y + 70;
  const areaWidth = width - 110;
  const areaHeight = height - 125;
  const scale = Math.min(areaWidth / Math.max(300, segment.lenMm), areaHeight / ceilingMm);
  const wallWidth = segment.lenMm * scale;
  const wallHeight = ceilingMm * scale;
  const wallX = areaX + (areaWidth - wallWidth) / 2;
  const wallY = areaY + areaHeight - wallHeight;
  ctx.fillStyle = "#fffdfa";
  ctx.strokeStyle = "#303833";
  ctx.lineWidth = 4;
  ctx.fillRect(wallX, wallY, wallWidth, wallHeight);
  ctx.strokeRect(wallX, wallY, wallWidth, wallHeight);
  ctx.strokeStyle = "#d9ddd9";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  for(let mm = 500; mm < segment.lenMm; mm += 500){
    const gx = wallX + mm * scale;
    ctx.beginPath(); ctx.moveTo(gx, wallY); ctx.lineTo(gx, wallY + wallHeight); ctx.stroke();
  }
  for(let mm = 500; mm < ceilingMm; mm += 500){
    const gy = wallY + wallHeight - mm * scale;
    ctx.beginPath(); ctx.moveTo(wallX, gy); ctx.lineTo(wallX + wallWidth, gy); ctx.stroke();
  }
  ctx.setLineDash([]);
  wallSheetFurniture(segment, floorIndex).forEach((item) => {
    const fx = wallX + item.fromMm * scale;
    const fy = wallY + wallHeight - (item.glMm + item.heightMm) * scale;
    const fw = item.widthMm * scale;
    const fh = item.heightMm * scale;
    ctx.fillStyle = "rgba(107,116,111,.13)";
    ctx.strokeStyle = "#8b948e";
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 7]);
    ctx.fillRect(fx, fy, fw, fh);
    ctx.strokeRect(fx, fy, fw, fh);
    ctx.setLineDash([]);
    if(fw > 60){
      ctx.fillStyle = "#6d756f";
      ctx.font = "18px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(item.label, fx + fw / 2, fy + fh / 2 + 6);
    }
  });
  wallSheetOpenings(segment, floor).forEach((opening) => {
    const ox = wallX + opening.fromMm * scale;
    const oy = wallY + wallHeight - opening.topMm * scale;
    const ow = opening.widthMm * scale;
    const oh = (opening.topMm - opening.bottomMm) * scale;
    ctx.fillStyle = opening.isWindow ? "#dbeef8" : "#ead9c4";
    ctx.strokeStyle = opening.isWindow ? "#3789b3" : "#98613b";
    ctx.lineWidth = 3;
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeRect(ox, oy, ow, oh);
    ctx.fillStyle = opening.isWindow ? "#28769d" : "#7c4d2e";
    ctx.font = "bold 21px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(opening.label, ox + ow / 2, oy + oh / 2 + 7);
  });
  wallSheetDevices(segment, floor).forEach((device) => {
    const dx = wallX + device.xMm * scale;
    const dy = wallY + wallHeight - device.heightMm * scale;
    ctx.beginPath();
    ctx.arc(dx, dy, 18, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = device.kind === "sw" ? "#2f9b61" : "#2877d4";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = "bold 21px sans-serif";
    ctx.fillText(device.symbol, dx, dy + 7);
    ctx.font = "18px sans-serif";
    ctx.fillText(`FL+${Math.round(device.heightMm)}`, dx, dy - 27);
  });
  ctx.textAlign = "left";
  ctx.fillStyle = "#68716b";
  ctx.font = "18px sans-serif";
  ctx.fillText("0", wallX - 8, wallY + wallHeight + 28);
  ctx.textAlign = "right";
  ctx.fillText(`${Math.round(segment.lenMm)}mm`, wallX + wallWidth + 8, wallY + wallHeight + 28);
  ctx.textAlign = "left";
}

function drawWallSheetMiniPlan(ctx, group, segments, x, y, width, height){
  const minX = Math.min(...group.rooms.map((room) => room.x));
  const minY = Math.min(...group.rooms.map((room) => room.y));
  const maxX = Math.max(...group.rooms.map((room) => room.x + room.w));
  const maxY = Math.max(...group.rooms.map((room) => room.y + room.h));
  const scale = Math.min((width - 30) / Math.max(1, maxX - minX), (height - 30) / Math.max(1, maxY - minY));
  const ox = x + (width - (maxX - minX) * scale) / 2;
  const oy = y + (height - (maxY - minY) * scale) / 2;
  ctx.fillStyle = "#f5f7f5";
  ctx.fillRect(x, y, width, height);
  group.rooms.forEach((room) => {
    ctx.fillStyle = "#e8eee9";
    ctx.strokeStyle = "#748078";
    ctx.lineWidth = 2;
    ctx.fillRect(ox + (room.x - minX) * scale, oy + (room.y - minY) * scale, room.w * scale, room.h * scale);
    ctx.strokeRect(ox + (room.x - minX) * scale, oy + (room.y - minY) * scale, room.w * scale, room.h * scale);
  });
  segments.forEach((segment) => {
    const sx1 = ox + (segment.x1 - minX) * scale;
    const sy1 = oy + (segment.y1 - minY) * scale;
    const sx2 = ox + (segment.x2 - minX) * scale;
    const sy2 = oy + (segment.y2 - minY) * scale;
    ctx.strokeStyle = "#2877d4";
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2); ctx.stroke();
    ctx.fillStyle = "#2877d4";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(segment.index + 1), (sx1 + sx2) / 2 + segment.nx * 12, (sy1 + sy2) / 2 + segment.ny * 12 + 6);
  });
  ctx.textAlign = "left";
}

function saveWallSheetImage(){
  const group = currentWallSheetGroup();
  if(!group || !dom.wallSheetCanvas) return;
  dom.wallSheetCanvas.toBlob((blob) => {
    if(!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.plan.title || "間取り"}_${group.floorIndex + 1}F_${group.label}_3D壁パース.png`.replace(/[\\/:*?"<>|]/g, "_");
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("3D壁パースを画像保存しました");
  }, "image/png");
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

function finiteNumber(value, fallback){
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeColor(value, fallback){
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
}

function clamp(value, min, max){
  return Math.min(max, Math.max(min, value));
}

function isMobileViewport(){
  return window.matchMedia?.("(max-width: 620px)")?.matches ?? window.innerWidth <= 620;
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
