export const DEFAULT_LAYOUT_ID = "E045fDIDlULYaWzIoKP4";
export const API_KEY = "AIzaSyBH4zoH5ZnfPcZmmXNvfeGOJz9__KkSMrg";
export const PROJECT_ID = "test-55430";
export const GRID_PX = 32;
export const PX_TO_M = 0.910 / GRID_PX;
export const TSUBO_TO_M2 = 3.305785;

export function pxToM(px){
  return Number(px || 0) * PX_TO_M;
}

export function pxToMm(px){
  return Math.round(pxToM(px) * 1000);
}

export function mmToPx(mm){
  return Number(mm || 0) / 1000 / PX_TO_M;
}

export function areaM2(item){
  return Math.max(0, Number(item.w || 0) * Number(item.h || 0) * PX_TO_M * PX_TO_M);
}

export function firestoreValueToJson(value){
  if(!value || typeof value !== "object") return value;
  if("stringValue" in value) return value.stringValue;
  if("integerValue" in value) return Number(value.integerValue);
  if("doubleValue" in value) return Number(value.doubleValue);
  if("booleanValue" in value) return value.booleanValue;
  if("timestampValue" in value) return value.timestampValue;
  if("nullValue" in value) return null;
  if("arrayValue" in value) return (value.arrayValue.values || []).map(firestoreValueToJson);
  if("mapValue" in value){
    const out = {};
    const fields = value.mapValue.fields || {};
    Object.entries(fields).forEach(([key, child]) => {
      out[key] = firestoreValueToJson(child);
    });
    return out;
  }
  return value;
}

export async function loadLayout(layoutId = DEFAULT_LAYOUT_ID){
  const id = layoutId || DEFAULT_LAYOUT_ID;
  const encoded = encodeURIComponent(id);
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/layouts/${encoded}?key=${API_KEY}`;
  const response = await fetch(url, { cache: "no-store" });
  if(!response.ok){
    throw new Error(`間取りを取得できませんでした (${response.status})`);
  }
  const doc = await response.json();
  const data = firestoreValueToJson({ mapValue: { fields: doc.fields || {} } });
  return normalizePlan(data, id, doc.updateTime || data.updatedAt || "");
}

export async function loadDetailDesign(layoutId = DEFAULT_LAYOUT_ID){
  const encoded = encodeURIComponent(layoutId || DEFAULT_LAYOUT_ID);
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/layouts/${encoded}?key=${API_KEY}`;
  const response = await fetch(url, { cache: "no-store" });
  if(response.status === 404) return null;
  if(!response.ok) throw new Error(`詳細データを取得できませんでした (${response.status})`);
  const doc = await response.json();
  const data = firestoreValueToJson({ mapValue: { fields: doc.fields || {} } });
  if(typeof data.detailDesignPayload !== "string") return null;
  try{
    return JSON.parse(data.detailDesignPayload);
  }catch(_){
    return null;
  }
}

export async function saveDetailDesign(layoutId, design){
  const encoded = encodeURIComponent(layoutId || DEFAULT_LAYOUT_ID);
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/layouts/${encoded}?updateMask.fieldPaths=detailDesignPayload&updateMask.fieldPaths=detailDesignUpdatedAt&key=${API_KEY}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        detailDesignPayload: { stringValue: JSON.stringify(design) },
        detailDesignUpdatedAt: { timestampValue: new Date().toISOString() }
      }
    })
  });
  if(!response.ok) throw new Error(`詳細データを共有保存できませんでした (${response.status})`);
}

export function normalizePlan(data, id, updateTime = ""){
  const rawFloors = Array.isArray(data.floors) && data.floors.length
    ? data.floors
    : [{ name: "1F", items: data.items || [], elec: [] }, { name: "2F", items: [], elec: [] }];
  const floors = rawFloors.map((floor, index) => ({
    name: floor.name || `${index + 1}F`,
    items: (floor.items || []).map((item) => normalizeItem(item)),
    elec: floor.elec || []
  }));
  while(floors.length < 2) floors.push({ name: `${floors.length + 1}F`, items: [], elec: [] });
  return {
    id,
    title: data.title || "MORI",
    activeFloor: Number.isInteger(data.activeFloor) ? data.activeFloor : 0,
    isMerged: !!data.isMerged,
    readonly: !!data.readonly,
    stairWallSegments: data.stairWallSegments && typeof data.stairWallSegments === "object" ? { ...data.stairWallSegments } : {},
    updateTime,
    floors
  };
}

function normalizeItem(item){
  const out = { ...item };
  ["x","y","w","h","x1","y1","x2","y2","thick","fh","gl","winB","winT","ceilMm"].forEach((key) => {
    if(out[key] !== undefined) out[key] = Number(out[key]);
  });
  out.type = out.type || "room";
  out.label = out.label || labelForType(out.type);
  out.id = out.id || `${out.type}_${Math.random().toString(36).slice(2)}`;
  if(out.type === "room" && !out.color) out.color = "#fff3e0";
  if(out.type === "frame" && !out.color) out.color = "#ffffff";
  if(out.type === "furn" && !out.color) out.color = "#d8dce3";
  if(out.type === "opening" && !out.kind) out.kind = "door";
  return out;
}

function labelForType(type){
  if(type === "frame") return "外枠";
  if(type === "wallLine") return "壁";
  if(type === "opening") return "建具";
  if(type === "furn") return "家具";
  if(type === "stair") return "階段";
  return "部屋";
}

export function floorItems(plan, floorMode){
  if(!plan) return [];
  if(floorMode === "all"){
    return plan.floors.flatMap((floor, floorIndex) => (floor.items || []).map((item) => ({ ...item, floorIndex })));
  }
  const index = Number(floorMode || 0);
  return (plan.floors[index]?.items || []).map((item) => ({ ...item, floorIndex: index }));
}

export function floorBounds(plan, floorMode = "all", padding = 80){
  const items = floorItems(plan, floorMode);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  items.forEach((item) => {
    if(item.type === "wallLine" || item.type === "opening"){
      minX = Math.min(minX, item.x1, item.x2);
      minY = Math.min(minY, item.y1, item.y2);
      maxX = Math.max(maxX, item.x1, item.x2);
      maxY = Math.max(maxY, item.y1, item.y2);
    }else if(Number.isFinite(item.x) && Number.isFinite(item.y)){
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + Math.max(1, item.w || 1));
      maxY = Math.max(maxY, item.y + Math.max(1, item.h || 1));
    }
  });
  if(!Number.isFinite(minX)){
    minX = -200; minY = -200; maxX = 200; maxY = 200;
  }
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2)
  };
}

export function roomsForFloor(plan, floorMode = "all"){
  return floorItems(plan, floorMode).filter((item) => item.type === "room" && !item.void);
}

export function openingsForFloor(plan, floorMode = "all"){
  return floorItems(plan, floorMode).filter((item) => item.type === "opening");
}

export function furnitureForFloor(plan, floorMode = "all"){
  return floorItems(plan, floorMode).filter((item) => item.type === "furn" || item.type === "stair");
}

export function formatM2(value){
  return `${value.toFixed(value >= 10 ? 1 : 2)}m²`;
}

export function formatTsubo(value){
  return `${(value / TSUBO_TO_M2).toFixed(2)}坪`;
}
