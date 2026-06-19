import { mmToPx } from "./data.js";

export const FURNITURE_LIBRARY = [
  { kind:"sofa", label:"ソファ", meta:"1800x900", tone:"green", w:1800, d:900, h:760, color:"#b7c7bd", layer:"furniture", category:"家具" },
  { kind:"dining", label:"ダイニング", meta:"4人", tone:"green", w:1500, d:850, h:720, color:"#d6bd91", layer:"furniture", category:"家具" },
  { kind:"desk", label:"デスク", meta:"1200", tone:"blue", w:1200, d:600, h:720, color:"#b7c4d8", layer:"furniture", category:"家具" },
  { kind:"bed", label:"ベッド", meta:"ダブル", tone:"blue", w:1400, d:2000, h:520, color:"#c9c2d9", layer:"furniture", category:"家具" },
  { kind:"shelf", label:"可動棚", meta:"900x350", tone:"amber", w:900, d:350, h:2100, color:"#c89b64", layer:"shelves", category:"棚" },
  { kind:"counter", label:"造作カウンター", meta:"1800", tone:"amber", w:1800, d:450, h:900, color:"#bf8f58", layer:"shelves", category:"棚" },
  { kind:"furringWall", label:"ふかし壁", meta:"W1800 H2400", tone:"wall", w:1800, d:150, h:2400, color:"#e5e2dc", layer:"furniture", category:"造作" },
  { kind:"dropWall", label:"垂れ壁", meta:"天井から450", tone:"wall", w:1800, d:150, h:450, gl:1950, color:"#e5e2dc", layer:"furniture", category:"造作" },
  { kind:"underStairWall", label:"階段下収納壁", meta:"W1800 H1800", tone:"wall", w:1800, d:120, h:1800, color:"#ddd9d2", layer:"furniture", category:"造作" },
  { kind:"niche", label:"ニッチ", meta:"W900 H1200", tone:"amber", w:900, d:180, h:1200, gl:700, color:"#c9b69a", layer:"shelves", category:"造作" },
  { kind:"downlight", label:"ダウンライト", meta:"天井付", tone:"blue", w:125, d:125, h:45, gl:2350, color:"#fff3b0", layer:"furniture", category:"照明" },
  { kind:"pendantLight", label:"ペンダント照明", meta:"天井吊り", tone:"blue", w:300, d:300, h:450, gl:1750, color:"#e2c680", layer:"furniture", category:"照明" },
  { kind:"windowNote", label:"窓検討", meta:"1600", tone:"blue", w:1600, d:120, h:1200, color:"#8dc2df", layer:"openings", category:"窓" },
  { kind:"freeObject", label:"自由オブジェクト", meta:"寸法変更", tone:"blue", w:900, d:600, h:900, color:"#b9c0c8", layer:"furniture", category:"自由" }
];

export const EXTERIOR_LIBRARY = [
  { kind:"site", label:"敷地", meta:"固定境界", tone:"site", w:14500, d:11500, h:40, color:"#dfeadb", layer:"exterior", category:"敷地", locked:true },
  { kind:"parking", label:"駐車場", meta:"1台", tone:"drive", w:2700, d:5200, h:60, color:"#c9ccc7", layer:"exterior", category:"駐車" },
  { kind:"car", label:"車", meta:"普通車", tone:"drive", w:1800, d:4300, h:1450, color:"#586169", layer:"exterior", category:"駐車" },
  { kind:"carport", label:"カーポート", meta:"1台", tone:"drive", w:3000, d:5400, h:2500, color:"#9aa4aa", layer:"exterior", category:"駐車" },
  { kind:"driveway", label:"土間コン", meta:"車路", tone:"drive", w:5600, d:3600, h:60, color:"#c7cbc5", layer:"exterior", category:"駐車" },
  { kind:"bike", label:"自転車置場", meta:"屋根", tone:"drive", w:2200, d:1400, h:2100, color:"#aeb8bd", layer:"exterior", category:"駐車" },
  { kind:"porchStep", label:"ポーチ階段", meta:"玄関", tone:"path", w:1800, d:900, h:450, color:"#cfc7bb", layer:"exterior", category:"玄関" },
  { kind:"frontDoor", label:"玄関ドア", meta:"親子対応", tone:"wall", w:1050, d:140, h:2250, color:"#7b5637", layer:"exterior", category:"玄関" },
  { kind:"approach", label:"アプローチ", meta:"玄関動線", tone:"path", w:1500, d:4200, h:70, color:"#d8c7ac", layer:"exterior", category:"動線" },
  { kind:"freeExterior", label:"自由外構", meta:"寸法変更", tone:"wall", w:1200, d:800, h:500, color:"#b8b2a7", layer:"exterior", category:"自由" },
  { kind:"deck", label:"デッキ", meta:"南庭", tone:"wood", w:3600, d:1800, h:220, color:"#b78354", layer:"exterior", category:"庭" },
  { kind:"garden", label:"植栽帯", meta:"低木", tone:"green", w:3200, d:1200, h:180, color:"#78a763", layer:"exterior", category:"庭" },
  { kind:"tree", label:"シンボルツリー", meta:"高木", tone:"green", w:900, d:900, h:2600, color:"#3f7e49", layer:"exterior", category:"庭" },
  { kind:"fence", label:"フェンス", meta:"目隠し", tone:"wood", w:3600, d:160, h:1600, color:"#9b7a55", layer:"exterior", category:"境界" },
  { kind:"gate", label:"門柱", meta:"宅配", tone:"wall", w:900, d:450, h:1600, color:"#b8b2a7", layer:"exterior", category:"境界" }
];

export const FINISHES = {
  floor: [
    { id:"oak", label:"オーク", color:"#d8bf96" },
    { id:"walnut", label:"ウォルナット", color:"#8c5e3d" },
    { id:"tile", label:"タイル", color:"#cfd4d1" },
    { id:"tatami", label:"畳", color:"#b7c98b" },
    { id:"vinyl", label:"白系床", color:"#ede8df" }
  ],
  wall: [
    { id:"warmWhite", label:"温白", color:"#f5f0e7" },
    { id:"gray", label:"グレー", color:"#d7d9d4" },
    { id:"green", label:"淡グリーン", color:"#dcebdd" },
    { id:"blue", label:"淡ブルー", color:"#dbe6f3" },
    { id:"accent", label:"アクセント", color:"#b98256" }
  ],
  ceiling: [
    { id:"standard", label:"標準", mm:2400 },
    { id:"high", label:"高天井", mm:2600 },
    { id:"low", label:"下がり", mm:2200 }
  ]
};

export function createDefaultDesign(layoutId){
  return {
    version: 1,
    layoutId,
    exterior: {
      setbackM: 2.4,
      parkingCars: 2,
      deckM: 1.8,
      northDeg: 0,
      fence: true,
      wallColor: "#f5f1e9",
      porchTileColor: "#cfc7bb",
      siteOffsetsM: { north: 2.0, east: 2.0, south: 3.0, west: 2.0 }
    },
    finishes: {},
    customItems: [],
    customModels: [],
    stairWallModes: {},
    notes: [
      { id: uid(), category:"外構", text:"駐車2台と玄関アプローチの幅を確認", done:false },
      { id: uid(), category:"家具", text:"LDKのソファ・ダイニング間隔を確認", done:false },
      { id: uid(), category:"棚", text:"ランドリーと玄関収納の可動棚奥行を確認", done:false },
      { id: uid(), category:"窓", text:"LDK南面の窓高さと家具干渉を確認", done:false },
      { id: uid(), category:"内装", text:"LDK床材と水回り床材を分けて確認", done:false }
    ]
  };
}

export function seedFinishes(plan, design){
  if(!plan || !design) return design;
  plan.floors.forEach((floor, floorIndex) => {
    (floor.items || []).forEach((item) => {
      if(item.type !== "room" || item.void || design.finishes[item.id]) return;
      design.finishes[item.id] = defaultFinishForRoom(item, floorIndex);
    });
  });
  return design;
}

function defaultFinishForRoom(room, floorIndex){
  const label = String(room.label || "");
  let floor = floorIndex === 1 ? "oak" : "oak";
  let wall = "warmWhite";
  let ceiling = "standard";
  if(/和室|畳/.test(label)) floor = "tatami";
  if(/洗面|ランドリー|お風呂|トイレ|土間|玄関/.test(label)) floor = "tile";
  if(/収納|玄関収納/.test(label)) wall = "gray";
  if(/LDK|キッチン/.test(label)) ceiling = "high";
  return { floor, wall, ceiling, memo:"" };
}

export function makeCustomItem(preset, floorIndex, center){
  return {
    id: uid(),
    kind: preset.kind,
    label: preset.label,
    layer: preset.layer,
    floorIndex,
    x: center.x - mmToPx(preset.w) / 2,
    y: center.y - mmToPx(preset.d) / 2,
    w: mmToPx(preset.w),
    h: mmToPx(preset.d),
    heightMm: preset.h,
    glMm: Number(preset.gl || 0),
    rotation: 0,
    color: preset.color,
    category: preset.category || "",
    meta: preset.meta || "",
    shape: preset.shape || preset.kind,
    locked: !!preset.locked,
    modelId: preset.modelId || "",
    modelParts: preset.modelParts ? cloneModelParts(preset.modelParts) : null
  };
}

export function uid(){
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

export function cloneModelParts(parts){
  return Array.isArray(parts) ? parts.map((part) => ({ ...part })) : [];
}
