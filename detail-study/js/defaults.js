import { mmToPx } from "./data.js";

export const FURNITURE_LIBRARY = [
  { kind:"sofa", label:"ソファ", tone:"green", w:1800, d:900, h:760, color:"#b7c7bd", layer:"furniture" },
  { kind:"dining", label:"ダイニング", tone:"green", w:1500, d:850, h:720, color:"#d6bd91", layer:"furniture" },
  { kind:"desk", label:"デスク", tone:"blue", w:1200, d:600, h:720, color:"#b7c4d8", layer:"furniture" },
  { kind:"bed", label:"ベッド", tone:"blue", w:1400, d:2000, h:520, color:"#c9c2d9", layer:"furniture" },
  { kind:"shelf", label:"可動棚", tone:"amber", w:900, d:350, h:2100, color:"#c89b64", layer:"shelves" },
  { kind:"counter", label:"造作カウンター", tone:"amber", w:1800, d:450, h:900, color:"#bf8f58", layer:"shelves" },
  { kind:"windowNote", label:"窓検討", tone:"blue", w:1600, d:120, h:1200, color:"#8dc2df", layer:"openings" },
  { kind:"plant", label:"植栽", tone:"green", w:700, d:700, h:1400, color:"#4f9a5c", layer:"exterior" }
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
      fence: true
    },
    finishes: {},
    customItems: [],
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
    glMm: 0,
    rotation: 0,
    color: preset.color
  };
}

export function uid(){
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}
