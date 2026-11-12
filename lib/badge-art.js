/* Original vector badges in the PACE summit style. Not a trace of the reference rasters. */
;(function (root) {
  var NAVY = '#0c2a52'
  var PINK = '#E62B8A'
  var OUTER = '60,5 111,33 111,99 60,127 9,99 9,33'
  var INNER = '60,13 103,37 103,95 60,119 17,95 17,37'
  var TAIWAN = 'M68.6,15 L66.2,17 L62.8,18.8 L59.2,22.7 L55.4,27.8 L51.5,32.4 L48.9,37.2 L47.1,42.3 L46.5,47.8 L45.8,53.9 L47.7,59.7 L50.5,63.6 L53.1,67.5 L55.7,71 L57.7,73 L58.5,70.4 L60.3,64.5 L62.3,58.5 L65.4,52.5 L68,46 L69.4,37.7 L71.4,31.7 L73.1,26.9 L74.8,22.2 L73.8,19.3 L71.5,17.6 L69.8,16.4 Z'
  var WEST = 'M66.2,17.4 L61.5,21.8 L56.9,27.8 L52.3,33.8 L48.9,39.7 L46.9,46.6 L46.2,53.4 L48,60.7'
  var n = 0
  function id() { n += 1; return 'pb' + n }
  function frame(tier) {
    if (tier === 'sub2') return 'plat'
    if (tier === 'sub3') return '#e0b34a'
    if (tier === 'sub4') return '#d5dbe3'
    if (tier === 'finisher') return '#c4844a'
    return '#d5dbe3'
  }
  function defs(token, tier) {
    var grad = tier === 'sub2'
      ? '<linearGradient id="' + token + 'plat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7fbff"/><stop offset=".34" stop-color="#c9d6ff"/><stop offset=".62" stop-color="#f4c4e2"/><stop offset="1" stop-color="#d7fff1"/></linearGradient>'
      : ''
    return '<defs>' + grad + '<clipPath id="' + token + 'c"><polygon points="' + INNER + '"/></clipPath></defs>'
  }
  function paint(token, tier) {
    return tier === 'sub2' ? 'url(#' + token + 'plat)' : frame(tier)
  }
  function waves() {
    var d = ''
    for (var i = 0; i < 4; i++) {
      var y = 20 + i * 6
      d += 'M18 ' + y + 'c10-3 16 3 26 0s16-3 26 0 16 3 26 0 '
    }
    return '<path d="' + d + '" fill="none" stroke="#05070d" stroke-width="2.6" stroke-linecap="round"/>'
  }
  function text(kicker, title, sub, foot) {
    var size = title.length >= 5 ? 11 : title.length === 4 ? 13 : 16
    return '<text x="60" y="80" text-anchor="middle" fill="#c5d0dc" font-size="6.5" font-family="inherit" letter-spacing="1.4">' + kicker + '</text>' +
      '<text x="60" y="95" text-anchor="middle" fill="#fff" font-size="' + size + '" font-weight="700" font-family="inherit">' + title + '</text>' +
      '<text x="60" y="106" text-anchor="middle" fill="#fff" font-size="' + (sub.length > 12 ? 7 : 8) + '" font-family="inherit" letter-spacing=".4">' + sub + '</text>' +
      '<text x="60" y="116" text-anchor="middle" fill="' + PINK + '" font-size="7" font-weight="700" font-family="inherit" letter-spacing="1.6">' + (foot || 'PACE') + '</text>'
  }
  function shell(token, tier, scene, lines) {
    var stroke = paint(token, tier)
    return '<svg class="badge-card" viewBox="0 0 120 132" role="img" aria-label="' + lines[1] + '">' +
      defs(token, tier) +
      '<polygon points="' + OUTER + '" fill="none" stroke="' + stroke + '" stroke-width="3.4"/>' +
      '<polygon points="' + INNER + '" fill="' + NAVY + '" stroke="' + stroke + '" stroke-width="1.15"/>' +
      '<g clip-path="url(#' + token + 'c)">' + scene + '</g>' +
      text(lines[0], lines[1], lines[2], lines[3]) +
      '</svg>'
  }
  function pine(x, y, h, color) {
    return '<path d="M' + x + ' ' + (y + h) + ' L' + (x + 3.2) + ' ' + y + ' L' + (x + 6.4) + ' ' + (y + h) + ' Z" fill="' + color + '"/>'
  }
  function laurel(color) {
    return '<g fill="' + color + '" stroke="' + color + '" stroke-width=".6">' +
      '<path d="M24 36c7-1 12-6 15-13" fill="none" stroke-width="1"/>' +
      '<path d="M96 36c-7-1-12-6-15-13" fill="none" stroke-width="1"/>' +
      '<ellipse cx="28" cy="33" rx="2.1" ry="1" transform="rotate(-30 28 33)"/>' +
      '<ellipse cx="33" cy="28" rx="2.1" ry="1" transform="rotate(-50 33 28)"/>' +
      '<ellipse cx="37" cy="24" rx="2" ry=".9" transform="rotate(-70 37 24)"/>' +
      '<ellipse cx="92" cy="33" rx="2.1" ry="1" transform="rotate(30 92 33)"/>' +
      '<ellipse cx="87" cy="28" rx="2.1" ry="1" transform="rotate(50 87 28)"/>' +
      '<ellipse cx="83" cy="24" rx="2" ry=".9" transform="rotate(70 83 24)"/>' +
      '</g>'
  }
  function gate() {
    return '<g fill="none" stroke="#fff" stroke-width="1.15"><path d="M53 42v-8h14v8"/><path d="M51 34h18"/><path d="M55 34v-3h10v3"/><path d="M60 31v-2"/></g>'
  }
  function road(d, color, width) {
    return '<path d="' + d + '" fill="none" stroke="' + (color || '#fff') + '" stroke-width="' + (width || 2.2) + '" stroke-linecap="round" stroke-linejoin="round"/>'
  }
  function island(stroke, route) {
    var ring = stroke === PINK
      ? '<path d="' + TAIWAN + '" fill="#d5e4f4" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/><path d="' + TAIWAN + '" fill="none" stroke="' + PINK + '" stroke-width="1.5" stroke-linejoin="round"/>'
      : '<path d="' + TAIWAN + '" fill="#d5e4f4" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/>'
    return waves() +
      '<g transform="translate(60,30) scale(0.8) translate(-60,-15)">' +
      ring + (route || '') +
      '</g>'
  }
  function scenes(tier) {
    var west = {
      sub2: { rock: '#8ea0b8', snow: '#eef3f8', road: '#fff', leaf: '#d5e4ff' },
      sub3: { rock: '#b08a3e', snow: '#f6e4b4', road: '#fff8df', leaf: '#e0b34a' },
      sub4: { rock: '#8d97a3', snow: '#e7edf2', road: '#fff', leaf: '#d5dbe3' },
      finisher: { rock: '#8d5a3c', snow: '#e8c4a6', road: '#f8e6d8', leaf: '#c4844a' }
    }[tier] || { rock: '#31527a', snow: '#d5e2f0', road: '#fff', leaf: '#d5dbe3' }
    return {
      wuling: waves() + '<path d="M20 68 L40 38 L50 48 L60 26 L74 46 L96 34 L106 68 Z" fill="#1d4e89"/><path d="M50 48 L60 26 L72 44 L60 40 Z" fill="#e7eef6"/>' + road('M28 68c10-8 14-4 20-14s10-6 16 2 12 10 24 4') + gate(),
      alishan: waves() + '<path d="M16 64 L36 42 L52 52 L70 36 L104 64 Z" fill="#24344a"/><ellipse cx="40" cy="50" rx="16" ry="5" fill="#d5deea" opacity=".8"/><ellipse cx="70" cy="46" rx="14" ry="4" fill="#eef3f8" opacity=".7"/>' + pine(74, 28, 34, '#7a2048') + pine(84, 24, 40, '#9a2858') + '<rect x="30" y="56" width="16" height="6" rx="1" fill="#d21f2a"/><rect x="32" y="53" width="7" height="4" fill="#f4f4f4"/><circle cx="34" cy="63" r="1.5" fill="#111"/><circle cx="43" cy="63" r="1.5" fill="#111"/><path d="M24 64h28" stroke="#cfd6df" stroke-width="1"/>',
      tatajia: waves() + '<path d="M18 70 L36 42 L50 54 L64 22 L90 56 L108 70 Z" fill="#8d97a3"/><path d="M64 22 L90 56 L72 50 Z" fill="#e62b8a"/><path d="M64 22 L50 40 L58 34 Z" fill="#f4f7fb"/>' + road('M26 70c8-6 12-2 16-10s8-8 14-4 10 8 18 2 12-2 22 6', '#d7dde4', 3) + pine(30, 58, 12, '#1c2836') + pine(96, 56, 14, '#1c2836'),
      dasyueshan: waves() + '<path d="M14 66 L40 40 L70 52 L108 36 L112 66 Z" fill="#1a2740"/>' + [24, 34, 44, 78, 88, 98].map(function (x, i) { return pine(x, 30 + (i % 3) * 4, 28, i % 2 ? '#7a2048' : '#142033') }).join('') + road('M22 66c12-2 16-10 24-12s14 6 22 2 16-12 28-8 14 8 20 10', '#e8edf2', 2.4),
      yakou: '<path d="M14 72 L46 24 L68 46 L100 18 L112 72 Z" fill="#3e4854"/>' + road('M24 72c8-10 10-8 14-18s6-8 12-6 8 10 14 6 8-16 16-18', PINK, 3.2) + '<path d="M62 40a11 13 0 1 0 .1 0" fill="#1a0c0a"/><ellipse cx="67" cy="42" rx="5" ry="6" fill="#ff8a3d"/>',
      taipingshan: waves() + '<path d="M28 58 L48 36 L62 48 L78 34 L100 58 Z" fill="#5c6774" opacity=".85"/><ellipse cx="60" cy="52" rx="28" ry="7" fill="#d5dbe3" opacity=".35"/>' + pine(24, 28, 36, '#6e243c') + pine(86, 26, 38, '#8a3050') + pine(40, 34, 22, '#1b2430') + pine(72, 32, 24, '#1b2430') + '<path d="M50 62 L58 52 L66 62 Z" fill="#6a2438"/><rect x="52" y="62" width="12" height="7" fill="#141b26"/>',
      shanlinxi: '<path d="M16 66 L40 40 L62 52 L86 34 L110 66 Z" fill="#1d4a38"/>' + [22, 30, 90, 98].map(function (x) {
        return '<path d="M' + x + ' 68 V30" stroke="#1c6b42" stroke-width="2.4"/><path d="M' + x + ' 40 h8 M' + (x) + ' 50 h-7" stroke="#8dcea8" stroke-width="1.2"/>'
      }).join('') + road('M34 66c8-2 12-8 20-8s14 6 24 2 16-6 22-2', '#dfe8df', 2),
      north_south: island('#f4f7fb', road(WEST, PINK, 2.4)),
      twin_towers: island('#f4f7fb', road(WEST + ' L57.7,73', PINK, 2.2) + '<g fill="' + PINK + '"><path d="M65 14 v6"/><circle cx="65" cy="13" r="1.5"/><path d="M57 70 v5"/><circle cx="57" cy="69" r="1.4"/></g>'),
      round_island: island(PINK, ''),
      west_wuling: waves() + (tier === 'sub2' || tier === 'sub3' ? laurel(west.leaf) : '') + '<path d="M18 68 L38 36 L50 48 L60 22 L76 46 L98 32 L108 68 Z" fill="' + west.rock + '"/><path d="M50 48 L60 22 L74 44 L62 40 Z" fill="' + west.snow + '"/>' + road('M26 68c8-8 14-4 20-14s12-8 18 0 14 12 28 6', west.road, 2.3)
    }
  }
  function linesFor(key, tier) {
    var sub = {
      sub2: 'SUB 2',
      sub3: 'SUB 3',
      sub4: 'SUB 4',
      finisher: 'FINISHER'
    }[tier] || ''
    var table = {
      wuling: ['完攀', '武嶺', '3275m'],
      alishan: ['完攀', '阿里山', '神木'],
      tatajia: ['完攀', '塔塔加', '玉山'],
      dasyueshan: ['完攀', '大雪山', '杉林'],
      yakou: ['完攀', '南橫埡口', '隧道'],
      taipingshan: ['完攀', '太平山', '山莊'],
      shanlinxi: ['完攀', '杉林溪', '竹海'],
      north_south: ['耐力', '一日北高', '360 km'],
      twin_towers: ['耐力', '一日雙塔', '520 km'],
      round_island: ['耐力', '環島', '900+ km'],
      west_wuling: ['西進', '武嶺', sub ? '3275m  ' + sub : '3275m']
    }
    return table[key] || ['完攀', key, '']
  }
  function card(key, tier) {
    var token = id()
    var useTier = key === 'west_wuling' ? tier : ''
    return shell(token, useTier, scenes(useTier)[key] || scenes('')[ 'wuling' ], linesFor(key, useTier))
  }
  function iconScene(key, tier) {
    if (key === 'north_south' || key === 'twin_towers' || key === 'round_island') {
      var coast = key === 'round_island' ? PINK : '#fff'
      var route = key === 'round_island' ? '' : '<path d="' + WEST + (key === 'twin_towers' ? ' L57.7,73' : '') + '" fill="none" stroke="' + PINK + '" stroke-width="3.5" vector-effect="non-scaling-stroke"/>'
      var lights = key === 'twin_towers' ? '<circle cx="68.6" cy="13.5" r="2.4" fill="' + PINK + '"/><circle cx="57.7" cy="73" r="2.4" fill="' + PINK + '"/>' : ''
      return '<g transform="translate(16,16) scale(0.42) translate(-60,-44)"><path d="' + TAIWAN + '" fill="#d5e4f4" stroke="' + coast + '" stroke-width="1.7" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>' + route + lights + '</g>'
    }
    if (key === 'alishan') return pine(11, 8, 14, '#9a2858') + '<rect x="6" y="18" width="8" height="3" fill="#d21f2a"/>'
    if (key === 'tatajia') return '<path d="M6 22 L12 10 L16 14 L20 7 L27 22 Z" fill="#8d97a3"/><path d="M20 7 L27 22 L22 16 Z" fill="#e62b8a"/>'
    if (key === 'dasyueshan') return pine(7, 10, 12, '#9a2858') + pine(13, 8, 14, '#142033') + pine(19, 11, 11, '#9a2858')
    if (key === 'yakou') return '<path d="M5 23 L12 8 L18 14 L26 6 L28 23 Z" fill="#3e4854"/><circle cx="16" cy="15" r="3" fill="#ff8a3d"/>'
    if (key === 'taipingshan') return pine(8, 9, 12, '#8a3050') + '<path d="M16 20 L20 15 L24 20 Z" fill="#6a2438"/>' + pine(22, 8, 12, '#8a3050')
    if (key === 'shanlinxi') return '<path d="M9 23 V8 M15 23 V7 M21 23 V9" stroke="#1c6b42" stroke-width="1.6"/><path d="M9 12h4 M15 14h-4 M21 13h4" stroke="#8dcea8" stroke-width="1"/>'
    if (key === 'west_wuling') {
      var leaf = tier === 'sub2' || tier === 'sub3'
      return (leaf ? '<path d="M6 12c3-1 5-3 6-6M26 12c-3-1-5-3-6-6" fill="none" stroke="' + (tier === 'sub3' ? '#e0b34a' : '#d5e4ff') + '" stroke-width="1"/>' : '') +
        '<path d="M5 23 L12 12 L16 16 L20 8 L26 16 L28 23 Z" fill="' + (tier === 'sub3' ? '#b08a3e' : tier === 'finisher' ? '#8d5a3c' : '#8ea0b8') + '"/>' +
        '<path d="M8 22c3-3 5-2 7-5" fill="none" stroke="#fff" stroke-width="1.2"/>'
    }
    return '<path d="M5 22 L11 12 L15 16 L20 8 L25 15 L28 22 Z" fill="#1d4e89"/><path d="M15 16 L20 8 L23 14 Z" fill="#e7eef6"/><path d="M8 21c3-3 5-2 8-5" fill="none" stroke="#fff" stroke-width="1.2"/>'
  }
  function icon(key, tier) {
    var token = id()
    var useTier = key === 'west_wuling' ? tier : ''
    var stroke = paint(token, useTier)
    return '<svg class="badge-icon" viewBox="0 0 32 32" width="20" height="20" aria-hidden="true">' +
      defs(token, useTier).replace(INNER, '16,2 29,9 29,23 16,30 3,23 3,9') +
      '<polygon points="16,1.4 29.2,8.8 29.2,23.2 16,30.6 2.8,23.2 2.8,8.8" fill="' + NAVY + '" stroke="' + stroke + '" stroke-width="1.5"/>' +
      iconScene(key, useTier) + '</svg>'
  }
  root.PaceBadgeArt = { icon: icon, card: card }
})(typeof globalThis !== 'undefined' ? globalThis : this)
