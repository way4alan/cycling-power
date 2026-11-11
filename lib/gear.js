/* Gear garage rules. Classic script: sets globalThis.PaceGear. No network. */
;(function (root) {
  var MONTH_DAYS = 365.2425 / 12
  var KINDS = {
    chain_wax: { parent: 'bike', label: '鍊條上蠟', intervalKm: 250, intervalMonths: null, reminderKind: 'replace', basis: 'team' },
    chain_replace: { parent: 'bike', label: '鍊條更換', intervalKm: null, intervalMonths: null, reminderKind: 'replace', basis: 'official' },
    brake_fluid: { parent: 'bike', label: '煞車油', intervalKm: null, intervalMonths: 12, reminderKind: 'check', basis: 'mixed' },
    brake_pads: { parent: 'bike', label: '來令片', intervalKm: null, intervalMonths: 1, reminderKind: 'check', basis: 'mixed' },
    cassette_chainrings: { parent: 'bike', label: '飛輪／齒盤', intervalKm: null, intervalMonths: null, reminderKind: 'check', basis: 'official' },
    shift_cables: { parent: 'bike', label: '變速線', intervalKm: null, intervalMonths: 12, reminderKind: 'check', basis: 'rule_of_thumb' },
    bar_tape: { parent: 'bike', label: '把帶', intervalKm: null, intervalMonths: 12, reminderKind: 'replace', basis: 'rule_of_thumb' },
    sealant: { parent: 'wheelset', label: '補胎液', intervalKm: null, intervalMonths: 3, reminderKind: 'replace', basis: 'official' },
    tires: { parent: 'wheelset', label: '外胎', intervalKm: null, intervalMonths: 36, reminderKind: 'check', basis: 'official' }
  }
  var NOTES = {
    chain_wax: {
      title: '鍊條上蠟（車隊規定）',
      body: '這是車隊自己的規定，不是鏈條廠的更換標準。預設每 250 公里上一次蠟，可以自己改。沒有月份間隔。',
      sources: []
    },
    chain_replace: {
      title: '鍊條更換看磨耗，不看固定里程',
      body: '沒有預設的公里或月份。是否更換看伸長：SRAM 0.8%；Campagnolo 卡鉗量測超過 132.60 mm；KMC 量具超過 0.8% 或 1%。Shimano 沒有公布百分比，請用 Shimano 原廠量具（例如 TL-CN42）。',
      sources: [
        'https://www.kmcchain.eu/service/technical-maintenance',
        'https://www.kmcchain.com/en/teach/chain-checker',
        'https://support.sram.com/hc/en-us/articles/5928711817755-When-should-I-replace-my-SRAM-Eagle-chain',
        'https://www.campagnolo.com/on/demandware.static/-/Library-Sites-campagnoloLibrary/default/dw773ec913/pdf/Technical%20manual_11s_12s_chain_Campagnolo_Rev08_10_2023_ENG.pdf'
      ]
    },
    sealant: {
      title: '補胎液',
      body: '預設每 3 個月補充。Stan’s 為每季；Peaty’s 約 3 個月；Trek／Bontrager 在炎熱乾燥時也是約 3 個月。Orange Seal Regular 約 30–45 天。Schwalbe Doc Blue 約 2000 公里，或 2–7 個月。請依瓶身，熱天與經常補氣會更快乾掉。',
      sources: [
        'https://stans.com/pages/sealant-support',
        'https://www.trekbikes.com/us/en_US/how-to-set-your-tires-up-tubeless/',
        'https://orangeseal.com/cdn/shop/files/OS_product_info_sheet2.pdf',
        'https://www.schwalbe.com/en/technology-faq/tubeless/'
      ]
    },
    brake_fluid: {
      title: '煞車油',
      body: '預設 12 個月提醒檢查。SRAM DOT 建議至少一年更換一次。Shimano 礦物油沒有固定週期，變色再換，所以 12 個月對 Shimano 是「檢查」不是強制更換。DOT 與礦物油絕對不可混用。',
      sources: [
        'https://support.sram.com/hc/en-us/articles/5927419450651-How-often-should-I-bleed-my-SRAM-DOT-brakes',
        'https://si.shimano.com/en/dm/MBDBR01/replace_genuine_mineral_oil'
      ]
    },
    brake_pads: {
      title: '來令片',
      body: '預設每個月檢查。Shimano：摩擦材剩 0.5 mm 就換。SRAM：含背板總厚度到 3 mm 就換。SRAM 碟盤最薄 1.55 mm。',
      sources: [
        'https://support.sram.com/hc/en-us/articles/5927458875931-When-should-my-SRAM-brake-pads-be-replaced',
        'https://si.shimano.com/en/pdfs/dm/MBDBR01/DM-MBDBR01-00-ENG.pdf'
      ]
    },
    tires: {
      title: '外胎',
      body: '預設 36 個月做一次檢查，不設里程上限。Continental：不論里程，三年後應更換。Pirelli 約 5–6 年。磨耗指示消失、簾布或防刺層外露、龜裂，就提早換。3000–5000 公里只是常見壽命，不是規則。',
      sources: [
        'https://www.continental-tires.com/tire-knowledge/tire-knowledge-bc/',
        'https://www.schwalbe.com/en/technology-faq/tire-wear/',
        'https://www.pirelli.com/global/en-ww/road/bicycles/tips/cycling-tyre-checks-173121/'
      ]
    },
    cassette_chainrings: {
      title: '飛輪／齒盤',
      body: '沒有固定週期。SRAM 的經驗是大約每三條鏈條檢查一次飛輪。新鏈條在出力時跳齒，就要換飛輪或齒盤。',
      sources: ['https://www.sram.com/en/learn/force-axs-welcome-guide/easy-maintenance']
    },
    shift_cables: {
      title: '變速線（經驗值）',
      body: '這是經驗值，不是 Shimano 或 SRAM 公布的週期。預設 12 個月檢查。Trek 手冊要看有沒有扭結、生鏽、斷股。',
      sources: ['https://media.trekbikes.com/image/upload/v1777060271/TrekBicycleOwnersManual_EN-US_Rev6_Apr2026.pdf']
    },
    bar_tape: {
      title: '把帶（經驗值）',
      body: '這是經驗值。預設 12 個月，或鬆了、磨破就換。依據 Trek 手冊與 Performance Road 保養表（6／12 個月）。',
      sources: ['https://media.trekbikes.com/image/upload/v1777060271/TrekBicycleOwnersManual_EN-US_Rev6_Apr2026.pdf']
    }
  }
  var STRAVA_OUTDOOR = { Ride: 1, GravelRide: 1, MountainBikeRide: 1, EBikeRide: 1 }

  function parseISODate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '').trim())
    if (!m) return null
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
  }
  function daysBetween(later, earlier) {
    var a = parseISODate(later)
    var b = parseISODate(earlier)
    if (!a || !b) return null
    var ms = Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)
    return Math.round(ms / 86400000)
  }
  function kindsFor(parent) {
    return Object.keys(KINDS).filter(function (key) { return KINDS[key].parent === parent })
  }
  function blankComponent(partial) {
    var spec = KINDS[partial.kind]
    return {
      id: partial.id,
      line_user_id: partial.line_user_id,
      bike_id: partial.bike_id || null,
      wheelset_id: partial.wheelset_id || null,
      kind: partial.kind,
      last_service_date: partial.last_service_date || null,
      km_at_last_service: 0,
      accumulated_km: 0,
      interval_km: spec.intervalKm,
      interval_months: spec.intervalMonths,
      reminder_kind: spec.reminderKind,
      basis: spec.basis,
      brand_note: ''
    }
  }
  function seedWheelsetComponents(wheelset, ids) {
    return kindsFor('wheelset').map(function (kind, i) {
      return blankComponent({
        id: ids ? ids[i] : undefined,
        kind: kind,
        line_user_id: wheelset.line_user_id,
        wheelset_id: wheelset.id,
        last_service_date: wheelset.created_on || null
      })
    })
  }
  function seedBike(bike, ids) {
    var wheel = {
      id: (ids && ids.wheelId) || 'wheel-new',
      line_user_id: bike.line_user_id,
      bike_id: bike.id,
      name: '原廠輪組',
      brand: '',
      odometer_km: 0,
      mounted: true
    }
    var components = kindsFor('bike').map(function (kind, i) {
      return blankComponent({
        id: ids && ids.componentIds ? ids.componentIds[i] : undefined,
        kind: kind,
        line_user_id: bike.line_user_id,
        bike_id: bike.id,
        last_service_date: bike.created_on || null
      })
    }).concat(seedWheelsetComponents(wheel))
    return { wheelset: wheel, components: components }
  }
  function gearStatus(item, today) {
    var level = 0
    var winner = ''
    function consider(ratio, name) {
      var next = ratio >= 1 ? 2 : ratio >= 0.8 ? 1 : 0
      if (next > level) { level = next; winner = name }
    }
    if (item.interval_km != null && Number(item.interval_km) > 0) {
      var used = Number(item.accumulated_km || 0) - Number(item.km_at_last_service || 0)
      consider(used / Number(item.interval_km), 'km')
    }
    if (item.interval_months != null && Number(item.interval_months) > 0 && item.last_service_date) {
      var days = daysBetween(today, String(item.last_service_date).slice(0, 10))
      if (days != null && days >= 0) consider((days / MONTH_DAYS) / Number(item.interval_months), 'months')
    }
    var status = level === 2 ? 'due' : level === 1 ? 'soon' : 'ok'
    return {
      status: status,
      label: status === 'due' ? '到期檢查' : status === 'soon' ? '快到了' : '正常',
      limiter: winner
    }
  }
  function cloneList(list) {
    return (list || []).map(function (row) { return Object.assign({}, row) })
  }
  function applyMileage(state, entry) {
    var bikes = cloneList(state.bikes)
    var wheelsets = cloneList(state.wheelsets)
    var components = cloneList(state.components)
    var km = Number(entry.km)
    if (!(km > 0)) return { ok: false, reason: 'km' }
    var bike = bikes.filter(function (row) { return row.id === entry.bike_id && row.archived !== true })[0]
    if (!bike) return { ok: false, reason: 'bike' }
    var indoor = entry.is_indoor === true
    var countDrive = entry.count_indoor_drivetrain === true
    if (indoor && !countDrive) {
      return { ok: true, applied: 'none', bikes: bikes, wheelsets: wheelsets, components: components, wheelsetId: null }
    }
    bike.odometer_km = Number(bike.odometer_km || 0) + km
    var wheelsetId = null
    if (!indoor) {
      wheelsetId = entry.wheelset_id || (wheelsets.filter(function (row) {
        return row.bike_id === bike.id && row.mounted === true
      })[0] || {}).id
      var wheel = wheelsets.filter(function (row) { return row.id === wheelsetId && row.bike_id === bike.id })[0]
      if (!wheel) return { ok: false, reason: 'wheelset' }
      wheel.odometer_km = Number(wheel.odometer_km || 0) + km
      components.forEach(function (row) {
        if (row.bike_id === bike.id || row.wheelset_id === wheel.id) row.accumulated_km = Number(row.accumulated_km || 0) + km
      })
    } else {
      components.forEach(function (row) {
        if (row.bike_id === bike.id && row.kind === 'chain_wax') row.accumulated_km = Number(row.accumulated_km || 0) + km
      })
    }
    return { ok: true, applied: indoor ? 'drivetrain' : 'outdoor', bikes: bikes, wheelsets: wheelsets, components: components, wheelsetId: wheelsetId }
  }
  function classifyStravaSport(sport) {
    if (STRAVA_OUTDOOR[sport]) return { action: 'import', indoor: false, askChain: false }
    if (sport === 'VirtualRide') return { action: 'import', indoor: true, askChain: true }
    return { action: 'ignore', indoor: false, askChain: false }
  }
  function assignImportedRide(bikes, wheelsets) {
    var active = (bikes || []).filter(function (bike) { return bike.archived !== true })
    if (active.length === 1) {
      var sets = (wheelsets || []).filter(function (row) { return row.bike_id === active[0].id })
      if (sets.length === 1) {
        return { status: 'auto', bikeId: active[0].id, wheelsetId: sets[0].id, notice: '' }
      }
    }
    return { status: 'pending', bikeId: null, wheelsetId: null, notice: '這次騎乘是用哪台車、哪組輪組？' }
  }
  function formatChainDate(iso) {
    var p = parseISODate(iso)
    if (!p) return ''
    var mo = String(p.m).padStart(2, '0')
    var d = String(p.d).padStart(2, '0')
    return p.y + '/' + mo + '/' + d
  }
  function chainHistory(history, bikeId) {
    return (history || []).filter(function (row) { return row.bike_id === bikeId }).sort(function (a, b) {
      var byDate = String(b.replaced_on || '').localeCompare(String(a.replaced_on || ''))
      if (byDate) return byDate
      return String(b.created_at || '').localeCompare(String(a.created_at || ''))
    })
  }
  function chainSummary(bike, history) {
    var rows = chainHistory(history, bike && bike.id)
    var last = rows[0]
    var ridden = last ? Math.max(0, Number(bike.odometer_km || 0) - Number(last.bike_km || 0)) : Number(bike && bike.odometer_km || 0)
    return {
      date: last ? formatChainDate(last.replaced_on) : '',
      km: ridden,
      last: last || null,
      history: rows
    }
  }
  function recordChainReplacement(history, entry) {
    return (history || []).concat([{
      id: entry.id,
      bike_id: entry.bike_id,
      line_user_id: entry.line_user_id || '',
      replaced_on: entry.replaced_on,
      bike_km: Number(entry.bike_km),
      note: entry.note || '',
      brand: entry.brand || '',
      created_at: entry.created_at || entry.replaced_on
    }])
  }
  function dueItems(components, today) {
    return (components || []).map(function (item) {
      return Object.assign({ item: item }, gearStatus(item, today))
    }).filter(function (row) { return row.status === 'due' })
  }
  function formatRemain(value, unit) {
    var rounded = Math.round(value)
    if (rounded > 0) return '剩 ' + rounded + ' ' + unit
    if (rounded === 0) return '到期'
    return '已超過 ' + Math.abs(rounded) + ' ' + unit
  }
  function remainText(item, today) {
    if (!item || item.kind === 'chain_replace') return '依磨耗判斷'
    var status = gearStatus(item, today)
    var kmLeft = null
    var dayLeft = null
    if (item.interval_km != null && Number(item.interval_km) > 0) {
      var used = Number(item.accumulated_km || 0) - Number(item.km_at_last_service || 0)
      kmLeft = Number(item.interval_km) - used
    }
    if (item.interval_months != null && Number(item.interval_months) > 0 && item.last_service_date) {
      var days = daysBetween(today, String(item.last_service_date).slice(0, 10))
      if (days != null && days >= 0) dayLeft = Number(item.interval_months) * MONTH_DAYS - days
    }
    var useKm = false
    if (status.limiter === 'km') useKm = true
    else if (status.limiter === 'months') useKm = false
    else if (kmLeft != null && dayLeft == null) useKm = true
    else if (kmLeft == null && dayLeft != null) useKm = false
    else if (kmLeft != null && dayLeft != null) {
      var kmRatio = (Number(item.interval_km) - kmLeft) / Number(item.interval_km)
      var dayRatio = (Number(item.interval_months) * MONTH_DAYS - dayLeft) / (Number(item.interval_months) * MONTH_DAYS)
      useKm = kmRatio >= dayRatio
    } else return status.label
    return useKm ? formatRemain(kmLeft, 'km') : formatRemain(dayLeft, '天')
  }
  function sortConsumables(parts, today) {
    var rank = { due: 0, soon: 1, ok: 2, wear: 3 }
    return (parts || []).slice().sort(function (a, b) {
      function statusOf(part) {
        if (part.kind === 'chain_replace') return 'wear'
        return gearStatus(part, today).status
      }
      return rank[statusOf(a)] - rank[statusOf(b)]
    })
  }
  function actionLabel(part) {
    if (part && part.kind === 'chain_wax') return '已上蠟'
    var spec = KINDS[(part && part.kind) || ''] || {}
    return spec.reminderKind === 'replace' ? '已更換' : '已檢查'
  }
  function chainSinceText(bike, history) {
    var summary = chainSummary(bike, history)
    if (!summary.date) return ''
    return '上次換鍊 ' + summary.date + '・已騎 ' + summary.km + ' km'
  }
  function mileagePrompt(bikes, wheelsets, bikeId) {
    var active = (bikes || []).filter(function (row) { return row.archived !== true })
    var chosen = active.filter(function (row) { return row.id === bikeId })[0] || active[0] || null
    var sets = chosen ? (wheelsets || []).filter(function (row) { return row.bike_id === chosen.id }) : []
    var mounted = sets.filter(function (row) { return row.mounted === true })[0] || sets[0] || null
    return {
      showBikes: active.length > 1,
      showWheelsets: sets.length > 1,
      bikeId: chosen ? chosen.id : '',
      wheelsetId: mounted ? mounted.id : ''
    }
  }
  function normName(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
  }
  function suggestStravaBikes(paceBikes, stravaBikes) {
    return (paceBikes || []).filter(function (bike) { return bike.archived !== true }).map(function (bike) {
      var names = [normName(bike.name), normName((bike.brand ? bike.brand + ' ' : '') + bike.name)]
      var hit = (stravaBikes || []).filter(function (row) {
        return names.indexOf(normName(row.name)) >= 0
      })[0]
      return {
        bikeId: bike.id,
        stravaGearId: bike.strava_gear_id || (hit ? String(hit.id) : ''),
        suggested: !bike.strava_gear_id && !!hit
      }
    })
  }
  function planStravaActivity(input) {
    var kind = classifyStravaSport(input && input.sport)
    if (kind.action !== 'import') {
      return { action: 'ignore', indoor: false, askChain: false, bikeId: null, wheelsetId: null, notice: '' }
    }
    var active = (input.bikes || []).filter(function (bike) { return bike.archived !== true })
    var gearId = input.gearId == null ? '' : String(input.gearId)
    var matched = gearId ? active.filter(function (bike) { return bike.strava_gear_id && String(bike.strava_gear_id) === gearId })[0] : null
    var lastBike = active.filter(function (bike) { return bike.id === input.lastBikeId })[0] || null
    var bike = matched || (active.length === 1 ? active[0] : lastBike)
    var sets = bike ? (input.wheelsets || []).filter(function (row) { return row.bike_id === bike.id }) : []
    var mounted = sets.filter(function (row) { return row.mounted === true })[0] || sets[0] || null
    var lastWheel = sets.filter(function (row) { return row.id === input.lastWheelId })[0] || null
    var wheel = sets.length === 1 ? sets[0] : (lastWheel || mounted)
    var canAuto = bike && wheel && sets.length === 1 && !kind.askChain && (active.length === 1 || !!matched)
    if (canAuto) {
      return { action: 'assign', indoor: kind.indoor, askChain: false, bikeId: bike.id, wheelsetId: wheel.id, notice: '' }
    }
    return {
      action: 'pending',
      indoor: kind.indoor,
      askChain: kind.askChain,
      bikeId: bike ? bike.id : null,
      wheelsetId: wheel ? wheel.id : null,
      notice: '這次騎哪台？'
    }
  }
  var STRAVA_DESKTOP_AUTHORIZE = 'https://www.strava.com/oauth/authorize'
  var STRAVA_MOBILE_AUTHORIZE = 'https://www.strava.com/oauth/mobile/authorize'
  var STRAVA_CALLBACK_KEY = 'pace-strava-oauth'
  function isMobileStravaClient(userAgent) {
    return /iPhone|iPad|iPod|Android/i.test(String(userAgent || ''))
  }
  function stravaAuthorizeUrl(url, userAgent) {
    var value = String(url || '')
    if (isMobileStravaClient(userAgent)) {
      if (value.indexOf(STRAVA_MOBILE_AUTHORIZE) === 0) return value
      return value.replace(STRAVA_DESKTOP_AUTHORIZE, STRAVA_MOBILE_AUTHORIZE)
    }
    if (value.indexOf(STRAVA_MOBILE_AUTHORIZE) === 0) return value.replace(STRAVA_MOBILE_AUTHORIZE, STRAVA_DESKTOP_AUTHORIZE)
    return value
  }
  function stravaConnectPlan(url, userAgent, inClient) {
    return {
      url: stravaAuthorizeUrl(url, userAgent),
      open: inClient ? 'liff-external' : 'assign'
    }
  }
  function parseStravaCallback(search) {
    var params = new URLSearchParams(String(search || '').replace(/^\?/, ''))
    if (params.get('strava') !== 'callback') return null
    var code = params.get('code') || ''
    var state = params.get('state') || ''
    var error = params.get('error') || ''
    if (!(code && state) && !error) return null
    return { code: code, state: state, error: error }
  }
  function persistStravaCallback(payload, stores) {
    if (!payload) return
    var text = JSON.stringify({ code: payload.code || '', state: payload.state || '', error: payload.error || '' })
    ;(stores || []).forEach(function (store) {
      try { store.setItem(STRAVA_CALLBACK_KEY, text) } catch (e) { /* private mode */ }
    })
  }
  function readStravaCallback(stores) {
    var found = null
    ;(stores || []).forEach(function (store) {
      if (found) return
      try {
        var raw = store.getItem(STRAVA_CALLBACK_KEY)
        if (raw) found = JSON.parse(raw)
      } catch (e) { /* ignore broken storage */ }
    })
    if (!found || (!(found.code && found.state) && !found.error)) return null
    return { code: found.code || '', state: found.state || '', error: found.error || '' }
  }
  function forgetStravaCallback(stores) {
    ;(stores || []).forEach(function (store) {
      try { store.removeItem(STRAVA_CALLBACK_KEY) } catch (e) { /* ignore */ }
    })
  }
  function stravaLoginRedirect(saved) {
    if (!saved || (!(saved.code && saved.state) && !saved.error)) return ''
    var url = new URL('https://cycling-power.vercel.app/?strava=callback')
    if (saved.code) url.searchParams.set('code', saved.code)
    if (saved.state) url.searchParams.set('state', saved.state)
    if (saved.error) url.searchParams.set('error', saved.error)
    return url.toString()
  }
  function stravaCallbackScreen(input) {
    var error = input && input.error
    if (input && input.ok) {
      return { kind: 'success', title: '已連結 Strava', body: '回到 LINE 後，車庫會顯示已連結。' }
    }
    if (error === 'invalid_state') {
      return { kind: 'retry', title: '請回 App 再按一次連結', body: '這次授權已經用過或過期了。' }
    }
    if (error === 'access_denied') {
      return { kind: 'denied', title: '沒有完成授權', body: '你取消了 Strava 授權。回到 LINE 後可以再按一次連結。' }
    }
    return { kind: 'denied', title: '沒有完成連結', body: '這次沒有連上。回到 LINE 後可以再試一次。' }
  }

  root.PaceGear = {
    KINDS: KINDS,
    NOTES: NOTES,
    kindsFor: kindsFor,
    seedBike: seedBike,
    seedWheelsetComponents: seedWheelsetComponents,
    gearStatus: gearStatus,
    applyMileage: applyMileage,
    classifyStravaSport: classifyStravaSport,
    assignImportedRide: assignImportedRide,
    dueItems: dueItems,
    formatChainDate: formatChainDate,
    chainSummary: chainSummary,
    recordChainReplacement: recordChainReplacement,
    daysBetween: daysBetween,
    remainText: remainText,
    sortConsumables: sortConsumables,
    actionLabel: actionLabel,
    chainSinceText: chainSinceText,
    mileagePrompt: mileagePrompt,
    suggestStravaBikes: suggestStravaBikes,
    planStravaActivity: planStravaActivity,
    isMobileStravaClient: isMobileStravaClient,
    stravaAuthorizeUrl: stravaAuthorizeUrl,
    stravaConnectPlan: stravaConnectPlan,
    parseStravaCallback: parseStravaCallback,
    persistStravaCallback: persistStravaCallback,
    readStravaCallback: readStravaCallback,
    forgetStravaCallback: forgetStravaCallback,
    stravaLoginRedirect: stravaLoginRedirect,
    stravaCallbackScreen: stravaCallbackScreen
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
