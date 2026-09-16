// 소득조사 근거 카드 — 「같은 조건 농가는 실제로」 (2026-09-12, money 세션 시안)
// 붙는 자리: 판매경로 진단 탭 결과 패널(#port-result) 맨 아래. 기존 함수는 감싸기만 한다(원본 로직 불변).
// 데이터: data/CONTEST-ONLY_agr_channel_evidence.json (농촌진흥청 소득조사 반출자료 2016~2024 집계값, 농가 단위 없음, n<10 제외)
(function () {
  let EV = null;
  const CH = ['도매시장', '농협계통출하', '직거래', '포전거래', '마트', '기타'];
  const COL = { '도매시장': '#2a78d6', '농협계통출하': '#eb6834', '직거래': '#1baf7a', '포전거래': '#eda100', '마트': '#e87ba4', '기타': '#898781' };
  const SIDO = { '충남': '충청남도', '충북': '충청북도', '경남': '경상남도', '경북': '경상북도', '전남': '전라남도', '전북': '전북특별자치도', '강원': '강원특별자치도', '경기': '경기도', '제주': '제주특별자치도', '광주': '광주광역시', '대구': '대구광역시', '대전': '대전광역시', '부산': '부산광역시', '울산': '울산광역시', '인천': '인천광역시', '서울': '서울특별시', '세종': '세종특별자치시' };

  fetch('data/CONTEST-ONLY_agr_channel_evidence.json?t=' + Date.now()).then(r => r.ok ? r.json() : null).then(j => { EV = j; }).catch(() => { EV = null; });

  function findCrop(name) {
    if (!EV || !name) return null;
    const crops = EV.crops;
    // 같은 이름 + 재배유형 변형(예: 시설딸기 · 시설딸기(촉성) · 시설딸기(수경)) 가운데 표본이 가장 큰 것
    const cands = Object.keys(crops).filter(k => k === name || k.startsWith(name + '(') || k === '노지' + name || k === '시설' + name);
    if (!cands.length) return null;
    cands.sort((a, b) => crops[b].n - crops[a].n);
    return { key: cands[0], d: crops[cands[0]], variants: cands };
  }
  function sidoOf(region) {
    if (!region) return null;
    const head = region.trim().slice(0, 2);
    return SIDO[head] || Object.values(SIDO).find(v => region.startsWith(v)) || null;
  }
  function sizeOf(d, area) {
    if (!area || !d.by_size) return null;
    let best = null, gap = Infinity;
    Object.entries(d.by_size).forEach(([k, v]) => { const g = Math.abs(v.area_m2_med - area); if (g < gap) { gap = g; best = k; } });
    return best;
  }
  function bar(share) {
    const segs = CH.map(c => { const v = share[c] || 0; return v > 0 ? `<div title="${c} ${v}%" style="width:${v}%;background:${COL[c]};height:100%;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;overflow:hidden;white-space:nowrap">${v >= 9 ? c + ' ' + Math.round(v) + '%' : ''}</div>` : ''; }).join('');
    return `<div style="display:flex;height:26px;border-radius:6px;overflow:hidden;gap:2px;background:rgba(255,255,255,.06)">${segs}</div>`;
  }
  function fmtSigned(x, unit) { return (x > 0 ? '+' : '') + x + unit; }

  function card(crop, region, area) {
    const f = findCrop(crop);
    if (!f) return '';
    const d = f.d;
    const sido = sidoOf(region);
    const size = sizeOf(d, area);
    // 우선순위: 도×작목(n≥10) → 규모×작목 → 작목 전체
    let scope = '전국', share = d.channel_share, n = d.n, inc = d.income_rate_med;
    if (sido && d.by_sido && d.by_sido[sido]) { scope = sido; share = d.by_sido[sido].channel_share; n = d.by_sido[sido].n; inc = d.by_sido[sido].income_rate_med; }
    let sizeLine = '';
    if (size && d.by_size[size]) { const s = d.by_size[size]; sizeLine = `<div style="margin-top:8px;font-size:12px;opacity:.85">재배면적 구간 <b>${size}</b>(중앙 ${s.area_m2_med.toLocaleString()}㎡, n=${s.n}) 농가의 채널: ${CH.map(c => s.channel_share[c] > 0 ? c + ' ' + Math.round(s.channel_share[c]) + '%' : '').filter(Boolean).join(' · ')} · 소득률 중앙 ${s.income_rate_med}%</div>`; }
    const rows = Object.entries(d.by_main_channel || {}).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `<tr><td style="padding:4px 8px"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${COL[k] || '#888'};margin-right:6px"></span>${k}</td><td style="text-align:right;padding:4px 8px">${v.n.toLocaleString()}</td><td style="text-align:right;padding:4px 8px">${v.income_rate_med}%</td><td style="text-align:right;padding:4px 8px">${v.price_index_med}</td></tr>`).join('');
    const md = (d.matched_diff || []).filter(m => m.a === '도매시장' || m.b === '도매시장').map(m => {
      const other = m.a === '도매시장' ? m.b : m.a; const sign = m.a === '도매시장' ? -1 : 1;
      return `<li><b>${other}</b> 주력 농가는 같은 조건의 도매시장 주력 농가보다 수취단가 지수 <b>${fmtSigned(Math.round(m.price_idx * sign), '')}</b>, 소득률 <b>${fmtSigned(+(m.income_pp * sign).toFixed(1), '%p')}</b> (n=${m.n})</li>`;
    }).join('');
    return `
    <div class="chart-section" id="evidence-card" style="border:1px solid rgba(27,175,122,.45);border-radius:12px;padding:16px 18px;margin-top:16px">
      <h3 style="margin:0 0 4px">같은 조건 농가는 실제로 <span style="font-weight:400;font-size:13px;opacity:.8">— 농촌진흥청 농산물 소득조사 ${d.years[0]}~${d.years[1]} 집계</span></h3>
      <div style="font-size:13px;opacity:.85;margin-bottom:10px"><b>${f.key}</b> · ${scope} · 농가 ${n.toLocaleString()}호 · 소득률 중앙 ${inc}%${f.variants.length > 1 ? ` <span style="opacity:.7">(「${crop}」 재배유형 ${f.variants.length}종 중 표본이 가장 큰 것)</span>` : ''}</div>
      ${bar(share)}
      ${sizeLine}
      <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px">
        <thead><tr style="opacity:.7"><th style="text-align:left;padding:4px 8px">주채널(비율 최대)</th><th style="text-align:right;padding:4px 8px">농가</th><th style="text-align:right;padding:4px 8px">소득률 중앙</th><th style="text-align:right;padding:4px 8px">수취단가 지수</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${md ? `<div style="margin-top:10px;font-size:13px"><div style="opacity:.7;margin-bottom:4px">조건(작목·연도·면적·경력·인증·도)을 맞춘 뒤 남는 차이</div><ul style="margin:0;padding-left:18px">${md}</ul></div>` : ''}
      <div style="margin-top:10px;font-size:11px;opacity:.6">추천이 아니라 근거입니다. 단가지수 = 농가수취단가 ÷ 같은 작목·연도 중앙값 × 100. 농가 단위 자료 없음(집계값), 표본 10호 미만 칸 제외. 수취단가는 출하비용 제외 값.</div>
    </div>`;
  }

  function append(crop, region, area) {
    const panel = document.getElementById('port-result');
    if (!panel || !EV) return;
    const old = document.getElementById('evidence-card'); if (old) old.remove();
    const html = card(crop, region, area);
    if (html) panel.insertAdjacentHTML('beforeend', html);
  }
  function inputsFromForm() {
    const g = id => (document.getElementById(id) || {}).value || '';
    return { crop: g('f-crop'), region: g('f-region'), area: parseFloat(g('f-area')) || null };
  }

  // 원본 함수를 감싼다 — 원본이 그린 뒤 카드만 덧붙인다
  function wrap(name, argsToInputs) {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () {
      const r = orig.apply(this, arguments);
      try { const inp = argsToInputs ? argsToInputs.apply(null, arguments) : inputsFromForm(); append(inp.crop, inp.region, inp.area); } catch (e) { console.log('evidence card skip:', e.message); }
      return r;
    };
  }
  window.addEventListener('load', () => {
    wrap('renderPortfolioResult', (caseObj) => { const b = (caseObj && caseObj.input && caseObj.input.basic) || {}; return { crop: b.crop, region: b.region, area: b.area_m2 }; });
    wrap('renderDirectInputGuide', null);
    wrap('renderRealData', null);
  });
})();
