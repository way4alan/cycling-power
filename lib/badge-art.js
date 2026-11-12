/* Small vector badges. Personal summits are hexagons; team year badges are not drawn here. */
;(function (root) {
  var NAVY = '#0c2340'
  var PINK = '#E62B8A'
  function icon(key, tier) {
    var stroke = key === 'west_wuling' ? (tier === 'sub2' ? '#d7e4ff' : tier === 'sub3' ? '#e0b34a' : tier === 'sub4' ? '#c5cdd6' : '#c4844a') : '#d5dbe3'
    var mark = key === 'twin_towers'
      ? '<path d="M12 6v12" stroke="' + PINK + '" stroke-width="2"/><circle cx="12" cy="6" r="2" fill="' + PINK + '"/>'
      : key === 'round_island' || key === 'north_south'
        ? '<path d="M14 5c2 2 3 4 2 7s-2 6-4 8-5 1-6-1 0-5 2-7 4-6 6-7z" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M13 7c1 2 1 4 0 6" fill="none" stroke="' + PINK + '" stroke-width="1.4"/>'
        : '<path d="M4 16 L9 7 L12 11 L16 6 L20 16 Z" fill="' + (key === 'alishan' || key === 'shanlinxi' ? '#24344a' : '#1d4e89') + '"/><path d="M8 16c2-3 3-4 4-4s2 1 4 4" fill="none" stroke="#fff" stroke-width="1.2"/>'
    return '<svg class="badge-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><polygon points="12,1.5 21,6.5 21,17.5 12,22.5 3,17.5 3,6.5" fill="' + NAVY + '" stroke="' + stroke + '" stroke-width="1.4"/>' + mark + '</svg>'
  }
  function card(key, tier) {
    var stroke = key === 'west_wuling' ? (tier === 'sub2' ? '#d7e4ff' : tier === 'sub3' ? '#e0b34a' : tier === 'sub4' ? '#c5cdd6' : '#c4844a') : '#d5dbe3'
    return '<svg class="badge-card" viewBox="0 0 120 132" role="img"><polygon points="60,4 112,32 112,100 60,128 8,100 8,32" fill="' + NAVY + '" stroke="' + stroke + '" stroke-width="3"/><path d="M16 78c14-6 18-6 28 0s16 6 28 0 18-6 28 0" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="3"/><path d="M22 86 L46 48 L60 64 L78 40 L100 86 Z" fill="#163e78"/><path d="M40 86c8-10 12-14 20-14s10 4 18 14" fill="none" stroke="#fff" stroke-width="2"/></svg>'
  }
  root.PaceBadgeArt = { icon: icon, card: card }
})(typeof globalThis !== 'undefined' ? globalThis : this)
