// Zepp の天気の地名（cityName）を "NISHIKU KUJO" のような大文字ローマ字にする。
// 漢字は辞書にある地名だけ変換できる。変換できない文字が残ったら null を返す。

const PLACES = {
  // 都道府県
  北海道: 'HOKKAIDO', 青森県: 'AOMORI', 岩手県: 'IWATE', 宮城県: 'MIYAGI', 秋田県: 'AKITA',
  山形県: 'YAMAGATA', 福島県: 'FUKUSHIMA', 茨城県: 'IBARAKI', 栃木県: 'TOCHIGI', 群馬県: 'GUNMA',
  埼玉県: 'SAITAMA', 千葉県: 'CHIBA', 東京都: 'TOKYO', 神奈川県: 'KANAGAWA', 新潟県: 'NIIGATA',
  富山県: 'TOYAMA', 石川県: 'ISHIKAWA', 福井県: 'FUKUI', 山梨県: 'YAMANASHI', 長野県: 'NAGANO',
  岐阜県: 'GIFU', 静岡県: 'SHIZUOKA', 愛知県: 'AICHI', 三重県: 'MIE', 滋賀県: 'SHIGA',
  京都府: 'KYOTO', 大阪府: 'OSAKA', 兵庫県: 'HYOGO', 奈良県: 'NARA', 和歌山県: 'WAKAYAMA',
  鳥取県: 'TOTTORI', 島根県: 'SHIMANE', 岡山県: 'OKAYAMA', 広島県: 'HIROSHIMA', 山口県: 'YAMAGUCHI',
  徳島県: 'TOKUSHIMA', 香川県: 'KAGAWA', 愛媛県: 'EHIME', 高知県: 'KOCHI', 福岡県: 'FUKUOKA',
  佐賀県: 'SAGA', 長崎県: 'NAGASAKI', 熊本県: 'KUMAMOTO', 大分県: 'OITA', 宮崎県: 'MIYAZAKI',
  鹿児島県: 'KAGOSHIMA', 沖縄県: 'OKINAWA',

  // 主な市
  大阪市: 'OSAKA', 大阪: 'OSAKA', 堺市: 'SAKAI', 豊中市: 'TOYONAKA', 吹田市: 'SUITA',
  高槻市: 'TAKATSUKI', 枚方市: 'HIRAKATA', 茨木市: 'IBARAKI', 東大阪市: 'HIGASHIOSAKA',
  八尾市: 'YAO', 寝屋川市: 'NEYAGAWA', 岸和田市: 'KISHIWADA', 守口市: 'MORIGUCHI', 門真市: 'KADOMA',
  池田市: 'IKEDA', 箕面市: 'MINOH', 摂津市: 'SETTSU', 尼崎市: 'AMAGASAKI', 西宮市: 'NISHINOMIYA',
  芦屋市: 'ASHIYA', 伊丹市: 'ITAMI', 宝塚市: 'TAKARAZUKA', 神戸市: 'KOBE', 姫路市: 'HIMEJI',
  京都市: 'KYOTO', 奈良市: 'NARA', 和歌山市: 'WAKAYAMA', 東京: 'TOKYO', 横浜市: 'YOKOHAMA',
  川崎市: 'KAWASAKI', 名古屋市: 'NAGOYA', 札幌市: 'SAPPORO', 仙台市: 'SENDAI', 福岡市: 'FUKUOKA',
  広島市: 'HIROSHIMA', 那覇市: 'NAHA', 千葉市: 'CHIBA', さいたま市: 'SAITAMA', 新宿区: 'SHINJUKUKU',
  渋谷区: 'SHIBUYAKU', 港区: 'MINATOKU', 千代田区: 'CHIYODAKU', 品川区: 'SHINAGAWAKU',

  // 大阪市 24 区
  北区: 'KITAKU', 都島区: 'MIYAKOJIMAKU', 福島区: 'FUKUSHIMAKU', 此花区: 'KONOHANAKU',
  中央区: 'CHUOKU', 西区: 'NISHIKU', 大正区: 'TAISHOKU', 天王寺区: 'TENNOJIKU',
  浪速区: 'NANIWAKU', 西淀川区: 'NISHIYODOGAWAKU', 淀川区: 'YODOGAWAKU',
  東淀川区: 'HIGASHIYODOGAWAKU', 東成区: 'HIGASHINARIKU', 生野区: 'IKUNOKU', 旭区: 'ASAHIKU',
  城東区: 'JOTOKU', 鶴見区: 'TSURUMIKU', 阿倍野区: 'ABENOKU', 住之江区: 'SUMINOEKU',
  住吉区: 'SUMIYOSHIKU', 東住吉区: 'HIGASHISUMIYOSHIKU', 平野区: 'HIRANOKU', 西成区: 'NISHINARIKU',

  // 大阪市西区の町名
  九条南: 'KUJOMINAMI', 九条: 'KUJO', 本田: 'HONDEN', 千代崎: 'CHIYOZAKI', 境川: 'SAKAIGAWA',
  川口: 'KAWAGUCHI', 江之子島: 'ENOKOJIMA', 立売堀: 'ITACHIBORI', 靱本町: 'UTSUBOHONMACHI',
  江戸堀: 'EDOBORI', 京町堀: 'KYOMACHIBORI', 新町: 'SHINMACHI', 北堀江: 'KITAHORIE',
  南堀江: 'MINAMIHORIE', 阿波座: 'AWAZA', 西本町: 'NISHIHONMACHI', 土佐堀: 'TOSABORI',
  本町: 'HONMACHI', 安治川: 'AJIKAWA',
}

const KEYS = Object.keys(PLACES).sort((a, b) => b.length - a.length)

// ひらがな・カタカナ（ヘボン式・長音は省略）
const KANA = {
  あ: 'A', い: 'I', う: 'U', え: 'E', お: 'O', か: 'KA', き: 'KI', く: 'KU', け: 'KE', こ: 'KO',
  さ: 'SA', し: 'SHI', す: 'SU', せ: 'SE', そ: 'SO', た: 'TA', ち: 'CHI', つ: 'TSU', て: 'TE', と: 'TO',
  な: 'NA', に: 'NI', ぬ: 'NU', ね: 'NE', の: 'NO', は: 'HA', ひ: 'HI', ふ: 'FU', へ: 'HE', ほ: 'HO',
  ま: 'MA', み: 'MI', む: 'MU', め: 'ME', も: 'MO', や: 'YA', ゆ: 'YU', よ: 'YO',
  ら: 'RA', り: 'RI', る: 'RU', れ: 'RE', ろ: 'RO', わ: 'WA', を: 'O', ん: 'N',
  が: 'GA', ぎ: 'GI', ぐ: 'GU', げ: 'GE', ご: 'GO', ざ: 'ZA', じ: 'JI', ず: 'ZU', ぜ: 'ZE', ぞ: 'ZO',
  だ: 'DA', ぢ: 'JI', づ: 'ZU', で: 'DE', ど: 'DO', ば: 'BA', び: 'BI', ぶ: 'BU', べ: 'BE', ぼ: 'BO',
  ぱ: 'PA', ぴ: 'PI', ぷ: 'PU', ぺ: 'PE', ぽ: 'PO',
}
const YOON = { ゃ: 'YA', ゅ: 'YU', ょ: 'YO' }

function kanaToRomaji(s) {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    let c = s[i]
    const code = c.charCodeAt(0)
    if (code >= 0x30a1 && code <= 0x30f6) c = String.fromCharCode(code - 0x60) // カタカナ→ひらがな
    if (c === 'ー') continue
    if (c === 'っ') {
      const next = kanaToRomaji(s.slice(i + 1, i + 2))
      if (next) out += next[0]
      continue
    }
    let n = s[i + 1]
    if (n) {
      const nc = n.charCodeAt(0)
      if (nc >= 0x30a1 && nc <= 0x30f6) n = String.fromCharCode(nc - 0x60)
    }
    if (KANA[c] && YOON[n]) {
      const base = KANA[c]
      const palatal = base === 'SHI' || base === 'CHI' || base === 'JI'
      out += base.slice(0, -1) + (palatal ? YOON[n].slice(1) : YOON[n])
      i++
      continue
    }
    if (!KANA[c]) return null
    out += KANA[c]
  }
  return out
}

function fromEnglish(s) {
  const parts = s
    .toUpperCase()
    .split(',')
    .map((p) =>
      p
        .replace(/\s+WARD$/, 'KU')
        .replace(/-KU$/, 'KU')
        .replace(/\s+(CITY|PREFECTURE)$/, '')
        .replace(/[^A-Z0-9 ]/g, '')
        .trim(),
    )
    .filter((p) => p)
  // 英語表記は「小さい地名, 大きい地名」の順なので逆にする
  return parts.reverse().slice(-2).join(' ') || null
}

function fromJapanese(s) {
  const words = []
  let rest = s.replace(/[0-9０-９]+丁目|[0-9０-９-]+/g, ' ')
  while (rest.length) {
    const c = rest[0]
    if (c === ' ' || c === '　') {
      rest = rest.slice(1)
      continue
    }
    const key = KEYS.find((k) => rest.indexOf(k) === 0)
    if (key) {
      words.push(PLACES[key])
      rest = rest.slice(key.length)
      continue
    }
    // かなの連続
    let j = 0
    while (j < rest.length && /[ぁ-ゖァ-ー]/.test(rest[j])) j++
    if (j > 0) {
      const r = kanaToRomaji(rest.slice(0, j))
      if (!r) return null
      words.push(r)
      rest = rest.slice(j)
      continue
    }
    return null
  }
  // 「大阪市 西区 九条」のように長いときは小さい方の 2 つだけ
  return words.slice(-2).join(' ') || null
}

export function placeLabel(cityName) {
  if (!cityName) return null
  const s = String(cityName).trim()
  if (!s) return null
  if (/^[\x20-\x7e]+$/.test(s)) return fromEnglish(s)
  return fromJapanese(s)
}
