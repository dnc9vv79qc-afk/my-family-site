import { mmToPx } from "./data.js";

const PLAN_LIGHT_IMG = "./assets/lighting-plan/";
const PDF_LIGHTING_CATEGORY = "PDFプラン照明";
const PDF_CONTROL_CATEGORY = "PDFプラン操作・部材";

function planLight(item){
  return {
    tone:"blue",
    layer:"furniture",
    category:PDF_LIGHTING_CATEGORY,
    lightingProduct:true,
    sourcePlan:"F60ATP-01 あかりプラン",
    dimming:true,
    color:"#fff3b0",
    w:125,
    d:125,
    h:45,
    gl:2350,
    beamDeg:70,
    ...item,
    libraryId:item.libraryId || item.productCode || item.label,
    image:`${PLAN_LIGHT_IMG}${item.image}`
  };
}

function planControl(item){
  return {
    kind:"lightingSwitch",
    tone:"blue",
    layer:"furniture",
    category:PDF_CONTROL_CATEGORY,
    lightingProduct:true,
    sourcePlan:"F60ATP-01 あかりプラン",
    w:120,
    d:35,
    h:120,
    gl:1100,
    color:"#f3f1ea",
    lumens:0,
    kelvin:0,
    beamDeg:0,
    dimming:false,
    ...item,
    libraryId:item.libraryId || item.productCode || item.label,
    image:`${PLAN_LIGHT_IMG}${item.image}`
  };
}

const PDF_PLAN_LIGHTING_PRODUCTS = [
  planLight({ kind:"downlight", label:"XAD1100KCU1", meta:"DL φ70 / 495lm / 2700K", productCode:"XAD1100KCU1", planTag:"LDK", quantityHint:"1F LDK", lumens:495, kelvin:2700, specSummary:"ダウンライト φ70・高気密SB・拡散・本体LGD9100K + LEDランプLLD2000 CU1", image:"xad1100kcu1.jpg" }),
  planLight({ kind:"downlight", label:"XAD3422CU1", meta:"DL φ70 / 575lm / 2700-6200K", productCode:"XAD3422CU1", planTag:"LDK ×2", quantityHint:"1F LDK ×2", lumens:575, kelvin:2700, beamDeg:80, specSummary:"シンクロ調色ダウンライト φ70・高気密SB・本体LGD9400 + LEDランプLLD3020 CU1", image:"xad3422cu1.jpg" }),
  planLight({ kind:"wallLight", label:"XLGB81808CU1", meta:"ブラケット / 175lm / 2700K", productCode:"XLGB81808CU1", planTag:"LDK ×2", quantityHint:"1F LDK 壁付 ×2", w:140, d:90, h:180, gl:1700, lumens:175, kelvin:2700, beamDeg:120, specSummary:"LEDブラケット・500形・本体LGB81001 + LEDランプLLD2000 CU1", image:"xlgb81808cu1.jpg" }),
  planLight({ kind:"pendantLight", label:"SLB15133BLE1", meta:"ペンダント / 375lm / 2700K", productCode:"SLB15133BLE1", planTag:"大壁和室", quantityHint:"1F 大壁和室", w:360, d:360, h:400, gl:1700, lumens:375, kelvin:2700, beamDeg:90, specSummary:"MODIFY Mサイズ LED内蔵ペンダント・高さ調整可能", image:"slb15133ble1.jpg", color:"#22242a" }),
  planLight({ kind:"sensorLight", label:"LRDC1144LLE1", meta:"ポーチ / センサ / 310lm", productCode:"LRDC1144LLE1", planTag:"ポーチ ×2", quantityHint:"ポーチ ×2", w:160, d:160, h:55, gl:2400, lumens:310, kelvin:2700, beamDeg:90, specSummary:"FreePaセンサ付LED内蔵ダウンライト・段調光省エネ型", image:"lrdc1144lle1.jpg" }),
  planLight({ kind:"pendantLight", label:"XLGB1617CE1", meta:"ペンダント / 450lm / 3500K", productCode:"XLGB1617CE1", planTag:"LDK A ×2", quantityHint:"1F LDK ペンダント ×2", w:510, d:510, h:260, gl:1750, lumens:450, kelvin:3500, beamDeg:90, specSummary:"LEDフラットランプφ70 ペンダント・本体LGB16749 + LLD2000V CE1", image:"xlgb1617ce1.jpg", color:"#45475f" }),
  planLight({ kind:"wallLight", label:"SLB80552LB1", meta:"階段ブラケット / 271lm / 3500K", productCode:"SLB80552LB1", planTag:"階段 ×2", quantityHint:"2F 階段 ×2", w:110, d:100, h:110, gl:1700, lumens:271, kelvin:3500, beamDeg:120, specSummary:"HomeArchi LED内蔵ブラケット・ON/OFF使用", image:"slb80552lb1.jpg", color:"#33363b" }),
  planLight({ kind:"spotLight", label:"XAS1002CU1", meta:"スポット / 520lm / 2700-6200K", productCode:"XAS1002CU1", planTag:"吹抜", quantityHint:"2F 吹抜スポット", w:120, d:120, h:160, gl:2300, lumens:520, kelvin:2700, beamDeg:60, specSummary:"シンクロ調色スポットライト・本体LGS9002 + LEDランプLLD2000 CU1", image:"xas1002cu1.jpg" }),
  planLight({ kind:"spotLight", label:"XAS3022CU1", meta:"スポット / 520lm / 2700-6200K", productCode:"XAS3022CU1", planTag:"吹抜 ×4", quantityHint:"2F 吹抜スポット ×4", w:120, d:120, h:160, gl:2300, lumens:520, kelvin:2700, beamDeg:60, specSummary:"シンクロ調色スポットライト・本体LGS9002 + LEDランプLLD3020 CU1", image:"xas3022cu1.jpg" }),
  planLight({ kind:"wallLight", label:"SLB80554LB1", meta:"洋室ブラケット / 226lm / 3500K", productCode:"SLB80554LB1", planTag:"洋室・洋室2 ×2", quantityHint:"2F 洋室・洋室2 ×2", w:110, d:100, h:110, gl:1700, lumens:226, kelvin:3500, beamDeg:120, specSummary:"HomeArchi LED内蔵ブラケット・ON/OFF使用", image:"slb80554lb1.jpg" }),
  planLight({ kind:"pendantLight", label:"XLGB1009CE1", meta:"トイレペンダント / 330lm / 3500K", productCode:"XLGB1009CE1", planTag:"トイレ ×2", quantityHint:"2F トイレ ×2", w:255, d:255, h:260, gl:1750, lumens:330, kelvin:3500, beamDeg:90, specSummary:"LEDフラットランプφ70 ペンダント・本体LGB10828 + LLD2000V CE1", image:"xlgb1009ce1.jpg", color:"#3b3e4a" }),
  planLight({ kind:"downlight", label:"XSZD1000VCB1", meta:"DL φ45 / 465lm / 3500K", productCode:"XSZD1000VCB1", planTag:"D ×12", quantityHint:"玄関ホール・ホール・洋室等 ×12", w:85, d:85, h:45, lumens:465, kelvin:3500, beamDeg:75, specSummary:"コンパクトランプ φ45・本体LGD9010 + LEDランプLLD2400V CB1", image:"xszd1000vcb1.jpg" }),
  planLight({ kind:"downlight", label:"XSZD3000NCB1", meta:"DL φ45 / 685lm / 3500K", productCode:"XSZD3000NCB1", planTag:"E ×8", quantityHint:"水回り・収納系 ×8", w:85, d:85, h:45, lumens:685, kelvin:3500, beamDeg:75, specSummary:"コンパクトランプ φ45・本体LGD9010 + LEDランプLLD3400N CB1", image:"xszd3000ncb1.jpg" }),
  planLight({ kind:"wallLight", label:"XLGB82837CB1", meta:"主寝室ブラケット / 455lm / 2700K", productCode:"XLGB82837CB1", planTag:"主寝室 ×2", quantityHint:"2F 主寝室 ×2", w:350, d:110, h:110, gl:1700, lumens:455, kelvin:2700, beamDeg:110, specSummary:"LEDフラットランプφ70 ブラケット・本体LGB81011 + LLD2000ML CB1", image:"xlgb82837cb1.jpg", color:"#292b31" }),
  planLight({ kind:"downlight", label:"OLGD1116LLB1", meta:"スピーカー付DL 親器 / 410lm", productCode:"OLGD1116LLB1", planTag:"主寝室 F", quantityHint:"2F 主寝室 スピーカー親器", w:100, d:100, h:60, lumens:410, kelvin:2700, beamDeg:100, specSummary:"Bluetoothスピーカー付ダウンライト 親器・LED内蔵", image:"olgd1116llb1.jpg" }),
  planLight({ kind:"downlight", label:"OLGD1117LLB1", meta:"スピーカー付DL 子器 / 410lm", productCode:"OLGD1117LLB1", planTag:"主寝室 G", quantityHint:"2F 主寝室 スピーカー子器", w:100, d:100, h:60, lumens:410, kelvin:2700, beamDeg:100, specSummary:"Bluetoothスピーカー付ダウンライト 子器・LED内蔵", image:"olgd1117llb1.jpg" }),
  planLight({ kind:"downlight", label:"XAD3100VKCE1", meta:"DL φ70 / 700lm / 3500K", productCode:"XAD3100VKCE1", planTag:"LDK H ×2", quantityHint:"1F LDK H ×2", lumens:700, kelvin:3500, beamDeg:70, specSummary:"LEDフラットランプφ70・拡散・本体LGD9100K + LLD4000V CE1", image:"xad3100vkce1.jpg" }),
  planLight({ kind:"downlight", label:"XAD1100VKCE1", meta:"DL φ70 / 440lm / 3500K", productCode:"XAD1100VKCE1", planTag:"LDK I ×2", quantityHint:"1F LDK I ×2", lumens:440, kelvin:3500, beamDeg:70, specSummary:"LEDフラットランプφ70・拡散・本体LGD9100K + LLD2000V CE1", image:"xad1100vkce1.jpg" }),
  planLight({ kind:"downlight", label:"XAD1100VCB1", meta:"DL φ70 / 440lm / 3500K", productCode:"XAD1100VCB1", planTag:"大壁和室 J ×2", quantityHint:"1F 大壁和室 J ×2", lumens:440, kelvin:3500, beamDeg:70, specSummary:"LEDフラットランプφ70・拡散・本体LGD9100K + LLD2000V CB1", image:"xad1100vcb1.jpg" }),
  planLight({ kind:"wallLight", label:"XLGB81800CE1", meta:"階段下物入ブラケット / 400lm", productCode:"XLGB81800CE1", planTag:"階段下物入 K", quantityHint:"1F 階段下物入", w:140, d:90, h:180, gl:1700, lumens:400, kelvin:5000, beamDeg:120, specSummary:"LEDブラケット・500形・本体LGB81000 + LLD2000N CE1", image:"xlgb81800ce1.jpg" }),
  planLight({ kind:"sensorLight", label:"LBJ70076", meta:"足元灯 / センサ / 3lm", productCode:"LBJ70076", planTag:"ホール L ×3", quantityHint:"ホール ×3", w:120, d:35, h:120, gl:250, lumens:3, kelvin:2700, beamDeg:95, specSummary:"明るさセンサ付LEDフットライト・コンセント付", image:"lbj70076.jpg" }),
  planControl({ label:"NQ28771WK", meta:"リビングライコン / 5回路", productCode:"NQ28771WK", planTag:"LDK 回路①〜⑤", quantityHint:"1F LDK", specSummary:"リビングライコン 5回路逆位相タイプ・シーン記憶/切替", image:"nq28771wk.jpg", w:254, h:120, d:35 }),
  planControl({ label:"HK9397", meta:"リビングライコン送信器", productCode:"HK9397", planTag:"LDK リモコン", quantityHint:"1F LDK", specSummary:"リビングライコン送信器・6シーン記憶/切替用", image:"hk9397.jpg", w:52, h:18, d:168 }),
  planControl({ kind:"lightingPart", label:"DH0229", meta:"配線ダクト本体 / 1345mm", productCode:"DH0229", planTag:"LDK", quantityHint:"1F LDK", specSummary:"ダクトレール本体 1345mm", image:"dh0229.jpg", w:1345, d:40, h:20, gl:2350, color:"#2d3238" }),
  planControl({ kind:"lightingPart", label:"DH0241K", meta:"フィードインキャップ", productCode:"DH0241K", planTag:"LDK", quantityHint:"1F LDK", specSummary:"ダクトレール用フィードインキャップ", image:"dh0241k.jpg", w:100, d:40, h:20, gl:2350, color:"#2d3238" }),
  planControl({ kind:"lightingPart", label:"DH0242", meta:"エンドキャップ", productCode:"DH0242", planTag:"LDK", quantityHint:"1F LDK", specSummary:"ダクトレール用エンドキャップ", image:"dh0242.jpg", w:35, d:35, h:20, gl:2350, color:"#2d3238" }),
  planControl({ label:"WTF4088CWK", meta:"ハンディホーム保安灯", productCode:"WTF4088CWK", planTag:"主寝室 M", quantityHint:"2F 主寝室", specSummary:"停電時点灯・携帯電灯として使用できる保安灯", image:"wtf4088cwk.jpg", w:120, h:120, d:35 }),
  planControl({ label:"WTA56512WK", meta:"2線式調光スイッチ", productCode:"WTA56512WK", planTag:"洋室・洋室2 ×4", quantityHint:"2F 洋室・洋室2 ×4", specSummary:"LED専用 2線式調光スイッチ・逆位相調光", image:"wta56512wk.jpg" }),
  planControl({ label:"WTA56713WK", meta:"3路調光スイッチ", productCode:"WTA56713WK", planTag:"大壁和室・主寝室 ×3", quantityHint:"和室・主寝室 ×3", specSummary:"LED専用 3路調光スイッチ・逆位相調光", image:"wta56713wk.jpg" }),
  planControl({ kind:"sensorSwitch", label:"WTA18119W", meta:"熱線センサ付自動スイッチ", productCode:"WTA18119W", planTag:"玄関ホール等 ×3", quantityHint:"玄関ホール・脱衣室・洗面所 ×3", specSummary:"2線式/3路配線対応 熱線センサ付自動スイッチ", image:"wta18119w.jpg" }),
  planControl({ kind:"sensorSwitch", label:"WTA1614WK", meta:"トイレ換気扇連動スイッチ", productCode:"WTA1614WK", planTag:"トイレ ×2", quantityHint:"トイレ ×2", specSummary:"換気扇遅動・熱線センサ付自動スイッチ", image:"wta1614wk.jpg" })
];

export const FURNITURE_LIBRARY = [
  { kind:"sofa", label:"ソファ", meta:"1800x900", tone:"green", w:1800, d:900, h:760, color:"#b7c7bd", layer:"furniture", category:"家具" },
  { kind:"armchair", label:"1人掛け", meta:"750x800", tone:"green", w:750, d:800, h:760, color:"#aebfb5", layer:"furniture", category:"家具" },
  { kind:"dining", label:"ダイニング", meta:"4人", tone:"green", w:1500, d:850, h:720, color:"#d6bd91", layer:"furniture", category:"家具" },
  { kind:"coffeeTable", label:"ローテーブル", meta:"1000x500", tone:"amber", w:1000, d:500, h:380, color:"#caa875", layer:"furniture", category:"家具" },
  { kind:"desk", label:"デスク", meta:"1200", tone:"blue", w:1200, d:600, h:720, color:"#b7c4d8", layer:"furniture", category:"家具" },
  { kind:"bed", label:"ベッド", meta:"ダブル", tone:"blue", w:1400, d:2000, h:520, color:"#c9c2d9", layer:"furniture", category:"家具" },
  { kind:"tvBoard", label:"テレビ台", meta:"1800x450", tone:"amber", w:1800, d:450, h:450, color:"#b68b60", layer:"furniture", category:"家具" },
  { kind:"cabinet", label:"収納家具", meta:"900x450", tone:"amber", w:900, d:450, h:1800, color:"#c6a476", layer:"furniture", category:"家具" },
  { kind:"refrigerator", label:"冷蔵庫", meta:"685x700", tone:"blue", w:685, d:700, h:1830, color:"#c8cdd2", layer:"furniture", category:"家電" },
  { kind:"washer", label:"洗濯機", meta:"640x640", tone:"blue", w:640, d:640, h:1050, color:"#d8dde1", layer:"furniture", category:"家電" },
  { kind:"shelf", label:"可動棚", meta:"900x350", tone:"amber", w:900, d:350, h:2100, color:"#c89b64", layer:"shelves", category:"棚" },
  { kind:"counter", label:"造作カウンター", meta:"1800", tone:"amber", w:1800, d:450, h:900, color:"#bf8f58", layer:"shelves", category:"棚" },
  { kind:"furringWall", label:"ふかし壁", meta:"W1800 H2400", tone:"wall", w:1800, d:150, h:2400, color:"#e5e2dc", layer:"furniture", category:"造作" },
  { kind:"dropWall", label:"垂れ壁", meta:"天井から450", tone:"wall", w:1800, d:150, h:450, gl:1950, color:"#e5e2dc", layer:"furniture", category:"造作" },
  { kind:"underStairWall", label:"階段下収納壁", meta:"W1800 H1800", tone:"wall", w:1800, d:120, h:1800, color:"#ddd9d2", layer:"furniture", category:"造作" },
  { kind:"underStairShelf", label:"階段下棚", meta:"W900 D450", tone:"amber", w:900, d:450, h:1200, color:"#c79c69", layer:"shelves", category:"造作" },
  { kind:"hangingCabinet", label:"吊戸棚", meta:"W1200 D350", tone:"amber", w:1200, d:350, h:700, gl:1600, color:"#c7aa83", layer:"shelves", category:"造作" },
  { kind:"niche", label:"ニッチ", meta:"W900 H1200", tone:"amber", w:900, d:180, h:1200, gl:700, color:"#c9b69a", layer:"shelves", category:"造作" },
  { kind:"downlight", label:"ダウンライト", meta:"600lm / 2700K", tone:"blue", w:125, d:125, h:45, gl:2350, lumens:600, kelvin:2700, beamDeg:60, dimming:true, color:"#fff3b0", layer:"furniture", category:"照明" },
  { kind:"pendantLight", label:"ペンダント照明", meta:"800lm / 2700K", tone:"blue", w:300, d:300, h:450, gl:1750, lumens:800, kelvin:2700, beamDeg:90, dimming:true, color:"#e2c680", layer:"furniture", category:"照明" },
  { kind:"ceilingLight", label:"シーリング照明", meta:"3000lm / 4000K", tone:"blue", w:500, d:500, h:100, gl:2300, lumens:3000, kelvin:4000, beamDeg:120, dimming:true, color:"#fff7d4", layer:"furniture", category:"照明" },
  ...PDF_PLAN_LIGHTING_PRODUCTS,
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
    stairWallSegments: {},
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
    lumens: Number(preset.lumens || 0),
    kelvin: Number(preset.kelvin || 0),
    beamDeg: Number(preset.beamDeg || 0),
    dimming: !!preset.dimming,
    lightOn: preset.category === "照明" || Number(preset.lumens || 0) > 0,
    productCode: preset.productCode || "",
    productImage: preset.image || "",
    productSpec: preset.specSummary || "",
    sourcePlan: preset.sourcePlan || "",
    planTag: preset.planTag || "",
    quantityHint: preset.quantityHint || "",
    lightingProduct: !!preset.lightingProduct,
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
