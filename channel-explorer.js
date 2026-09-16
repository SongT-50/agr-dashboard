// ─────────────────────────────────────────────────────────────────────────────
// 같은 조건 농가는 — 판매경로 실측 탐색기  (2026-09-14, money 세션)
//
// 왜 만들었나
//   기존 「판매경로 진단」 탭은 ① 가상 농가 10건이거나 ② API 키를 넣어야 움직인다.
//   ⇒ 처음 열어 본 농가는 «아무것도 못 보고» 나간다.
//   이 탭은 키도 호출도 없이, 고르는 즉시 «실측 농가 분포»를 보여준다.
//
// 데이터  data/CONTEST-ONLY_agr_channel_evidence.json
//   농촌진흥청 농산물 소득조사 반출자료(2016~2024) 집계값. 55작목 · 농가-연 32,992.
//   ⚠️ 농가 단위 원자료 없음(집계값만) · n<10 칸 제외 · 2015년 제외(출하방법 문항 없음)
//   🔴 이 파일은 .gitignore 의 CONTEST-ONLY_ 규칙으로 «공개 배포가 막혀 있다».
//      반출 조건이 「참여 목적 외 사용 금지」라 GitHub Pages 공개는 그보다 무거운 위반이다.
//      ⇒ 데이터가 없으면 이 탭은 스스로 숨는다(아래 boot()). 공개본에서는 탭이 안 생긴다.
//
// index.html 변경  <script src="channel-explorer.js"></script> 한 줄뿐.
//   탭 버튼·내용·switchTab 처리는 전부 이 파일이 스스로 붙인다(원본 로직 불변).
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  const TAB = 'evidence';
  const CH = ['도매시장', '농협계통출하', '직거래', '포전거래', '마트', '기타'];
  const COL = {
    '도매시장': '#2a78d6', '농협계통출하': '#eb6834', '직거래': '#1baf7a',
    '포전거래': '#eda100', '마트': '#e87ba4', '기타': '#898781'
  };
  // 소득조사 출하방법 → 대시보드 5경로 (meta.route_map 과 같은 뜻을 화면 문구로)
  const ROUTE_NOTE = {
    '도매시장': '도매시장',
    '농협계통출하': '생산자단체(조직출하)',
    '직거래': '직거래 — 온라인·로컬푸드를 소득조사가 나누지 않는다',
    '포전거래': '산지유통인(밭떼기)',
    '마트': '대시보드 5경로 밖',
    '기타': '수출·학교급식·생협 등 자유기재'
  };
  const SMALL_N = 30;   // 이보다 적으면 화면에서 «표본 적음»을 명시한다

  let EV = null;
  let state = { crop: null, sido: '', size: '', mix: null };
  let baseMixRef = null;   // 지금 조건의 «원래» 분포 — 슬라이더 델타의 기준

  // ── 유틸 ───────────────────────────────────────────────────────────────────
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = x => (x == null || isNaN(x)) ? '—' : (Math.round(x * 10) / 10).toLocaleString('ko-KR');
  const signed = x => (x == null || isNaN(x)) ? '—' : (x > 0 ? '+' : '') + (Math.round(x * 10) / 10);

  function nBadge(n) {
    const weak = n < SMALL_N;
    return `<span title="표본 농가-연 수" style="font-size:11px;padding:1px 6px;border-radius:4px;margin-left:6px;
      background:${weak ? 'rgba(245,158,11,.15)' : 'rgba(148,163,184,.12)'};
      color:${weak ? 'var(--accent-amber)' : 'var(--text-secondary)'}">n=${n.toLocaleString('ko-KR')}${weak ? ' · 표본 적음' : ''}</span>`;
  }

  function bar(share, h) {
    h = h || 28;
    const segs = CH.map(c => {
      const v = +(share[c] || 0);
      if (v <= 0) return '';
      return `<div title="${esc(c)} ${v}%  ·  ${esc(ROUTE_NOTE[c])}" style="width:${v}%;background:${COL[c]};height:100%;
        display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;overflow:hidden;white-space:nowrap">${v >= 9 ? esc(c) + ' ' + Math.round(v) + '%' : ''}</div>`;
    }).join('');
    return `<div style="display:flex;height:${h}px;border-radius:6px;overflow:hidden;gap:2px;background:rgba(255,255,255,.06)">${segs}</div>`;
  }

  function legend() {
    return `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">` + CH.map(c =>
      `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--text-secondary)">
        <i style="width:10px;height:10px;border-radius:2px;background:${COL[c]};display:inline-block"></i>${esc(c)}</span>`).join('') + `</div>`;
  }


  // 인라인 스타일은 @media 를 못 탄다. 좁은 화면 규칙은 여기 한 곳에 모은다.
  // 기존 대시보드 분기점(900px / 600px)과 같은 값을 쓴다.
  function injectCSS() {
    if (document.getElementById('ce-style')) return;
    const st = document.createElement('style');
    st.id = 'ce-style';
    st.textContent = `
#tab-evidence, #tab-evidence * { box-sizing:border-box; }
/* 그리드 항목은 기본 min-width:auto 라 내용보다 작아지지 못한다 → 좁은 화면에서 가로로 삐져나온다 */
#tab-evidence .ce-grid > *, #tab-evidence .ce-sim > * { min-width:0; }
#tab-evidence .ce-grid { display:grid; grid-template-columns:320px minmax(0,1fr); gap:24px; align-items:start; }
#tab-evidence .ce-sim  { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:20px; }
#tab-evidence .ce-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; }
#tab-evidence .ce-scroll table { min-width:440px; }
#tab-evidence .ce-slider { width:100%; }
#tab-evidence button#ce-reset { width:100%; white-space:nowrap; }
@media (max-width: 900px) {
  #tab-evidence .ce-grid { grid-template-columns:1fr; }
  #tab-evidence .ce-sim  { grid-template-columns:1fr; }
}
@media (max-width: 600px) {
  #tab-evidence .ce-scroll table { min-width:380px; font-size:12px; }
}`;
    document.head.appendChild(st);
  }

  // ── 화면 붙이기 ────────────────────────────────────────────────────────────
  function injectTab() {
    const bar_ = document.querySelector('.tab-nav');
    if (!bar_ || document.getElementById('tab-' + TAB)) return false;
    injectCSS();

    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.setAttribute('data-tab', TAB);
    btn.onclick = () => window.switchTab(TAB);
    btn.innerHTML = '같은 조건 농가는';
    const guideBtn = Array.from(bar_.querySelectorAll('.tab-btn')).find(b => b.textContent.includes('가이드'));
    if (guideBtn) bar_.insertBefore(btn, guideBtn); else bar_.appendChild(btn);

    const host = document.getElementById('tab-portfolio') || document.querySelector('.tab-content');
    const div = document.createElement('div');
    div.id = 'tab-' + TAB;
    div.className = 'tab-content';
    div.innerHTML = shell();
    host.parentNode.insertBefore(div, host.nextSibling);

    // switchTab 감싸기 — 원본 배열에 손대지 않는다
    const orig = window.switchTab;
    window.switchTab = function (t) {
      try { orig.apply(this, arguments); } catch (e) { /* 원본 오류가 이 탭을 막지 않게 */ }
      document.querySelectorAll('.tab-btn').forEach(b => {
        if (b.getAttribute('data-tab') === TAB) b.classList.toggle('active', t === TAB);
      });
      const el = document.getElementById('tab-' + TAB);
      if (el) el.classList.toggle('active', t === TAB);
      if (t === TAB) render();
    };
    return true;
  }

  function shell() {
    return `
<div class="ce-grid">
  <div class="input-panel" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;padding:20px">
    <h2 style="margin:0 0 4px;font-size:17px">같은 조건 농가는 실제로</h2>
    <p style="margin:0 0 16px;font-size:12px;color:var(--text-secondary);line-height:1.5">
      작목·지역·면적을 고르면 <b>API 키 없이 바로</b> 실측 분포가 나옵니다.
      전국 소득조사 <b id="ce-total">—</b>개 농가-연 표본입니다.</p>

    <div class="form-group"><label>작목</label>
      <select id="ce-crop"></select>
      <div class="unit" id="ce-crop-note"></div></div>

    <div class="form-group"><label>지역 (시도)</label>
      <select id="ce-sido"></select>
      <div class="unit">해당 작목에 표본이 있는 시도만 나옵니다</div></div>

    <div class="form-group"><label>재배 규모</label>
      <select id="ce-size"></select>
      <div class="unit" id="ce-size-note"></div></div>

    <div style="margin-top:18px;padding:12px;border-radius:8px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2)">
      <div style="font-size:11px;color:var(--accent-amber);font-weight:600;margin-bottom:4px">이 숫자가 말하지 않는 것</div>
      <div style="font-size:11px;color:var(--text-secondary);line-height:1.6">
        경로를 <b>바꾸면</b> 소득이 그렇게 된다는 뜻이 아닙니다. 좋은 물건을 내는 농가가 그 경로를 고르기도 합니다.
        인과에 가장 가까운 값은 아래 <b>「같은 조건끼리 맞대보면」</b> 칸입니다.</div>
    </div>
  </div>

  <div class="result-panel" id="ce-result"><div style="color:var(--text-secondary);padding:40px 0;text-align:center">불러오는 중…</div></div>
</div>`;
  }

  // ── 선택칸 채우기 ──────────────────────────────────────────────────────────
  function fillCrops() {
    const sel = document.getElementById('ce-crop');
    const groups = {};
    Object.entries(EV.crops).forEach(([k, v]) => { (groups[v.group] = groups[v.group] || []).push(k); });
    sel.innerHTML = Object.keys(groups).sort().map(g =>
      `<optgroup label="${esc(g)}">` +
      groups[g].sort((a, b) => EV.crops[b].n - EV.crops[a].n)
        .map(k => `<option value="${esc(k)}">${esc(k)} (n=${EV.crops[k].n.toLocaleString('ko-KR')})</option>`).join('') +
      `</optgroup>`).join('');
    if (!state.crop || !EV.crops[state.crop]) {
      // 표본이 가장 큰 작목을 기본값으로
      state.crop = Object.keys(EV.crops).sort((a, b) => EV.crops[b].n - EV.crops[a].n)[0];
    }
    sel.value = state.crop;
  }

  function fillSido() {
    const d = EV.crops[state.crop];
    const sel = document.getElementById('ce-sido');
    const list = Object.entries(d.by_sido || {}).sort((a, b) => b[1].n - a[1].n);
    sel.innerHTML = `<option value="">전국 (${d.n.toLocaleString('ko-KR')})</option>` +
      list.map(([k, v]) => `<option value="${esc(k)}">${esc(k)} (n=${v.n.toLocaleString('ko-KR')})</option>`).join('');
    if (state.sido && !d.by_sido[state.sido]) state.sido = '';
    sel.value = state.sido;
  }

  function fillSize() {
    const d = EV.crops[state.crop];
    const sel = document.getElementById('ce-size');
    const order = ['소(하위1/3)', '중', '대(상위1/3)'];
    const list = Object.entries(d.by_size || {}).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
    sel.innerHTML = `<option value="">전체 규모</option>` + list.map(([k, v]) =>
      `<option value="${esc(k)}">${esc(k)} · 중앙 ${Math.round(v.area_m2_med / 3.3058).toLocaleString('ko-KR')}평 (n=${v.n.toLocaleString('ko-KR')})</option>`).join('');
    if (state.size && !d.by_size[state.size]) state.size = '';
    sel.value = state.size;
    const note = document.getElementById('ce-size-note');
    const cur = state.size && d.by_size[state.size];
    note.textContent = cur ? `면적 중앙값 ${cur.area_m2_med.toLocaleString('ko-KR')}㎡ (${Math.round(cur.area_m2_med / 3.3058).toLocaleString('ko-KR')}평)`
      : '같은 작목 안에서 면적 3분위로 나눈 구간입니다';
  }

  // ── 본문 ───────────────────────────────────────────────────────────────────
  function currentShare() {
    const d = EV.crops[state.crop];
    if (state.size && d.by_size && d.by_size[state.size]) return { share: d.by_size[state.size].channel_share, n: d.by_size[state.size].n, label: state.size };
    if (state.sido && d.by_sido && d.by_sido[state.sido]) return { share: d.by_sido[state.sido].channel_share, n: d.by_sido[state.sido].n, label: state.sido };
    return { share: d.channel_share, n: d.n, label: '전국' };
  }

  function blockCompare(d) {
    const rows = [{ label: '전국', share: d.channel_share, n: d.n }];
    if (state.sido && d.by_sido[state.sido]) rows.push({ label: state.sido, share: d.by_sido[state.sido].channel_share, n: d.by_sido[state.sido].n });
    // ⚠️ by_size 는 «전국» 기준이다. 시도×규모 교차 집계는 원자료에 없다.
    //    시도를 고른 상태에서 그냥 '대 규모'라고 쓰면 «그 시도의 대 규모»로 읽힌다. 라벨에 못박는다.
    if (state.size && d.by_size[state.size]) rows.push({ label: state.size + ' 규모 · 전국 기준', share: d.by_size[state.size].channel_share, n: d.by_size[state.size].n });

    return card('판매경로 분포 — 실제로 어디로 내보내나',
      rows.map(r => `
        <div style="margin-bottom:14px">
          <div style="display:flex;align-items:center;margin-bottom:5px">
            <span style="font-size:13px;font-weight:600">${esc(r.label)}</span>${nBadge(r.n)}
          </div>${bar(r.share)}
        </div>`).join('') + legend() +
      `<div style="margin-top:12px;font-size:11px;color:var(--text-secondary);line-height:1.6">
         비중 = 농가별 출하방법 비율(%)의 단순평균입니다. 금액이 아니라 <b>농가 수 기준</b>입니다.
         규모 구간은 <b>전국 기준</b>입니다 — 시도와 규모를 교차한 집계는 원자료에 없습니다.</div>`);
  }

  function blockByChannel(d) {
    const entries = Object.entries(d.by_main_channel || {})
      .sort((a, b) => (b[1].income_rate_med || 0) - (a[1].income_rate_med || 0));
    if (!entries.length) return '';
    const maxN = Math.max.apply(null, entries.map(e => e[1].n));
    const rows = entries.map(([k, v]) => {
      const w = Math.round(v.n / maxN * 100);
      return `<tr>
        <td style="padding:8px 10px"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${COL[k] || '#898781'};margin-right:7px"></span>${esc(k)}</td>
        <td style="padding:8px 10px;text-align:right;font-variant-numeric:tabular-nums">${num(v.income_rate_med)}%</td>
        <td style="padding:8px 10px;text-align:right;font-variant-numeric:tabular-nums">${num(v.price_index_med)}</td>
        <td style="padding:8px 10px;width:130px">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="flex:1;height:6px;border-radius:3px;background:rgba(148,163,184,.12)">
              <div style="width:${w}%;height:100%;border-radius:3px;background:${COL[k] || '#898781'};opacity:.7"></div></div>
            <span style="font-size:11px;color:${v.n < SMALL_N ? 'var(--accent-amber)' : 'var(--text-secondary)'};font-variant-numeric:tabular-nums">${v.n.toLocaleString('ko-KR')}</span>
          </div></td></tr>`;
    }).join('');

    return card('그 경로를 «주로» 쓰는 농가의 성적',
      `<div class="ce-scroll"><table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="color:var(--text-secondary);font-size:11px;text-align:left;border-bottom:1px solid var(--border)">
          <th style="padding:6px 10px;font-weight:500">주 판매경로</th>
          <th style="padding:6px 10px;font-weight:500;text-align:right">소득률 중앙값</th>
          <th style="padding:6px 10px;font-weight:500;text-align:right">단가지수</th>
          <th style="padding:6px 10px;font-weight:500">표본 농가-연</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
       <div style="margin-top:10px;font-size:11px;color:var(--text-secondary);line-height:1.6">
         소득률 = 총수입 중 소득이 차지하는 비율. 단가지수 = 농가수취단가 ÷ 같은 작목·연도 중앙값 × 100.
         농가수취단가는 <b>운송료·상장수수료·상하차비·택배비를 뺀</b> 값입니다.<br>
         ⚠️ 이 표는 «그 경로를 주로 쓰는 농가»를 그냥 모아 본 것입니다. 조건이 서로 다릅니다.</div>`);
  }

  function blockMatched(d) {
    const md = (d.matched_diff || []).slice().sort((a, b) => b.n - a.n);
    if (!md.length) {
      return card('같은 조건끼리 맞대보면',
        `<div style="color:var(--text-secondary);font-size:13px;line-height:1.7">
           이 작목은 층(작목·연도·면적4분위·경력·인증·도)을 맞췄을 때 <b>비교 가능한 짝이 모자랐습니다.</b>
           위 표는 조건을 맞추지 않은 값이니 그대로 인과로 읽지 마십시오.</div>`);
    }
    const rows = md.map(m => {
      const good = m.income_pp > 0;
      return `<tr>
        <td style="padding:9px 10px;font-size:13px">
          <span style="color:${COL[m.a] || '#898781'}">${esc(m.a)}</span>
          <span style="color:var(--text-secondary);margin:0 7px;font-size:11px">대비</span>
          <span style="color:${COL[m.b] || '#898781'}">${esc(m.b)}</span></td>
        <td style="padding:9px 10px;text-align:right;font-variant-numeric:tabular-nums;color:${good ? 'var(--accent-green)' : 'var(--accent-red)'}">${signed(m.income_pp)}%p</td>
        <td style="padding:9px 10px;text-align:right;font-variant-numeric:tabular-nums;color:${m.price_idx > 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">${signed(m.price_idx)}</td>
        <td style="padding:9px 10px;text-align:right">${nBadge(m.n)}</td></tr>`;
    }).join('');

    return card('같은 조건끼리 맞대보면 — 인과에 가장 가까운 값',
      `<div style="font-size:12px;color:var(--text-secondary);line-height:1.7;margin-bottom:10px">
         <b>작목 · 연도 · 면적4분위 · 영농경력 · 인증 여부 · 도</b>를 모두 맞춘 «층» 안에서만 주채널끼리 견줬습니다.
         층마다 표본 수로 가중했습니다. <b>왼쪽 경로를 주로 쓰는 «농가»가 오른쪽 경로 농가보다 얼마나 높은지</b>이며,
         <b style="color:var(--accent-amber)">경로를 바꿨을 때의 변화가 아닙니다.</b> 같은 농가를 따라간 값이 아니라 조건을 맞춘 두 무리를 견준 값입니다.</div>
       <div class="ce-scroll"><table style="width:100%;border-collapse:collapse">
        <thead><tr style="color:var(--text-secondary);font-size:11px;text-align:left;border-bottom:1px solid var(--border)">
          <th style="padding:6px 10px;font-weight:500">비교 (왼쪽 − 오른쪽)</th>
          <th style="padding:6px 10px;font-weight:500;text-align:right">소득률 차</th>
          <th style="padding:6px 10px;font-weight:500;text-align:right">단가지수 차</th>
          <th style="padding:6px 10px;font-weight:500;text-align:right">맞댄 층 표본</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`);
  }

  // ── 「옮기면」 시뮬레이터 ───────────────────────────────────────────────────
  function simInit(d) {
    const base = currentShare().share;
    state.mix = {};
    CH.forEach(c => { state.mix[c] = +(base[c] || 0); });
  }

  function simEstimate(d) {
    // 주채널별 중앙값을 «지금 비중»으로 가중한 참고값. 인과 아님 — 화면에 그렇게 적는다.
    const bc = d.by_main_channel || {};
    let wi = 0, wp = 0, tot = 0;
    CH.forEach(c => {
      const w = state.mix[c] || 0;
      const v = bc[c];
      if (!w || !v) return;
      tot += w;
      wi += w * (v.income_rate_med || 0);
      wp += w * (v.price_index_med || 0);
    });
    if (!tot) return null;
    return { income: wi / tot, price: wp / tot, covered: tot };
  }

  function blockSim(d) {
    const base = currentShare();
    const cur = simEstimate(d);
    const baseMix = {};
    CH.forEach(c => { baseMix[c] = +(base.share[c] || 0); });
    baseMixRef = baseMix;

    const sum = CH.reduce((a, c) => a + (state.mix[c] || 0), 0);
    const sliders = CH.map((c, i) => `<div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-bottom:3px">
          <span><i style="width:9px;height:9px;border-radius:2px;background:${COL[c]};display:inline-block;margin-right:6px"></i>${esc(c)}</span>
          <span id="ce-lab-${i}" style="font-variant-numeric:tabular-nums"></span></div>
        <input type="range" min="0" max="100" step="1" value="${Math.round((state.mix[c] || 0))}" data-ch="${esc(c)}" data-i="${i}" class="ce-slider"
               style="width:100%;accent-color:${COL[c]}"></div>`).join('');

    const warn = `<div id="ce-sum-warn" style="margin-top:8px;font-size:12px;color:var(--accent-amber)"></div>`;

    return card('옮겨 보면 — 참고값 계산기',
      `<div class="ce-sim">
        <div>${sliders}${warn}
          <button id="ce-reset" class="btn-diagnose" style="margin-top:8px;padding:9px 14px;font-size:13px">원래 분포로 되돌리기</button></div>
        <div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">
            지금 고른 조건(<b>${esc(base.label)}</b>${nBadge(base.n)})의 실제 분포를 기준으로,
            비중만 바꿨을 때의 <b>참고값</b>입니다.</div>
          ${cur ? `
          <div style="display:flex;gap:12px;margin-bottom:12px">
            <div style="flex:1;padding:14px;border-radius:10px;background:var(--bg-tertiary)">
              <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">소득률 참고값</div>
              <div id="ce-val-income" style="font-size:24px;font-weight:700;font-variant-numeric:tabular-nums">${num(cur.income)}<span style="font-size:14px">%</span></div>
              <div id="ce-dl-income" style="font-size:12px;margin-top:2px"></div>
            </div>
            <div style="flex:1;padding:14px;border-radius:10px;background:var(--bg-tertiary)">
              <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">단가지수 참고값</div>
              <div id="ce-val-price" style="font-size:24px;font-weight:700;font-variant-numeric:tabular-nums">${num(cur.price)}</div>
              <div id="ce-dl-price" style="font-size:12px;margin-top:2px"></div>
            </div></div>` : `<div style="color:var(--text-secondary);font-size:13px">이 작목은 주채널별 표본이 모자라 참고값을 못 냅니다.</div>`}
          <div style="padding:12px;border-radius:8px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.18);font-size:11px;color:var(--text-secondary);line-height:1.7">
            <b style="color:var(--accent-red)">이 값은 예측이 아닙니다.</b>
            «그 경로를 주로 쓰는 농가»의 중앙값을 비중으로 가중해 더한 것입니다.
            경로를 옮긴다고 그 농가가 그 값이 되지는 않습니다. 물량·품질·거래처가 함께 바뀌어야 합니다.
            방향을 가늠하는 데까지만 쓰고, 크기는 위 <b>「같은 조건끼리 맞대보면」</b>을 보십시오.
          </div></div></div>`);
  }

  function card(title, html) {
    return `<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px">
      <h3 style="margin:0 0 14px;font-size:15px">${esc(title)}</h3>${html}</div>`;
  }

  function header(d) {
    const yrs = d.years || [];
    return `<div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin-bottom:18px">
      <div style="font-size:20px;font-weight:700">${esc(state.crop)}</div>
      <div style="font-size:12px;color:var(--text-secondary)">${esc(d.group)} · ${yrs[0]}~${yrs[1]}년 · 농가-연 ${d.n.toLocaleString('ko-KR')}</div>
    </div>`;
  }

  function render() {
    const box = document.getElementById('ce-result');
    if (!box) return;
    if (!EV) { box.innerHTML = `<div style="color:var(--text-secondary);padding:40px 0;text-align:center">데이터를 불러오지 못했습니다.</div>`; return; }
    const d = EV.crops[state.crop];
    if (!d) { box.innerHTML = ''; return; }
    if (!state.mix) simInit(d);
    box.innerHTML = header(d) + blockCompare(d) + blockByChannel(d) + blockMatched(d) + blockSim(d) + source();
    bindSliders(d);
  }

  function source() {
    const m = EV.meta || {};
    return `<div style="font-size:11px;color:var(--text-secondary);line-height:1.7;padding:14px;border-top:1px solid var(--border)">
      <b>출처</b> ${esc(m.source || '')}<br>
      <b>집계</b> ${esc(m.generated || '')} · ${esc(m.unit || '')}<br>
      ${(m.notes || []).map(x => '· ' + esc(x)).join('<br>')}</div>`;
  }

  // 슬라이더를 끌 때 결과를 통째로 다시 그리면 ① 화면이 깜빡이고 ② 끌던 손잡이의 초점을 잃는다.
  // ⇒ 끌 때는 «숫자만» 제자리에서 갱신한다. 다시 그리는 것은 작목·시도·규모가 바뀔 때뿐이다.
  //
  // ⚠️ 2026-09-14 오진 기록 — 「왼쪽 패널이 아래로 밀린다」고 읽었으나 **버그가 아니었다.**
  //    index.html 의 `.input-panel { position: sticky; top: 24px }` 라 스크롤을 따라오는 것이고,
  //    full-page 스크린샷이 그 위치를 그대로 그려서 밀린 것처럼 보였다.
  //    getBoundingClientRect().top + scrollY 로 쟀는데, sticky 요소에는 그 셈이 안 맞는다.
  //    ⇒ sticky 요소의 위치로 레이아웃 버그를 판정하지 않는다.
  function simRefresh(d) {
    const cur = simEstimate(d);
    let sum = 0;
    CH.forEach((c, i) => {
      const v = Math.round((state.mix[c] || 0) * 10) / 10;
      sum += v;
      const b = Math.round(((baseMixRef && baseMixRef[c]) || 0) * 10) / 10;
      const moved = Math.abs(v - b) >= 0.5;
      const lab = document.getElementById('ce-lab-' + i);
      if (lab) {
        lab.style.color = moved ? 'var(--accent-green)' : 'var(--text-secondary)';
        lab.innerHTML = v + '%' + (moved ? ` <span style="font-size:11px">(원래 ${b}%)</span>` : '');
      }
    });

    const w = document.getElementById('ce-sum-warn');
    if (w) w.textContent = Math.abs(sum - 100) > 0.6
      ? `합계가 ${Math.round(sum)}% 입니다. 100%로 맞춰야 아래 값이 뜻을 가집니다.` : '';

    if (!cur) return;
    const saved = state.mix;
    state.mix = baseMixRef || saved;
    const ref = simEstimate(d);
    state.mix = saved;

    const vi = document.getElementById('ce-val-income');
    const vp = document.getElementById('ce-val-price');
    if (vi) vi.innerHTML = num(cur.income) + '<span style="font-size:14px">%</span>';
    if (vp) vp.textContent = num(cur.price);

    function delta(el, x, unit) {
      if (!el) return;
      if (!ref || Math.abs(x) < 0.05) { el.style.color = 'var(--text-secondary)'; el.textContent = '지금 분포 그대로'; return; }
      el.style.color = x > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
      el.textContent = signed(x) + unit;
    }
    delta(document.getElementById('ce-dl-income'), ref ? cur.income - ref.income : 0, '%p');
    delta(document.getElementById('ce-dl-price'), ref ? cur.price - ref.price : 0, '');
  }

  function bindSliders(d) {
    document.querySelectorAll('.ce-slider').forEach(el => {
      el.addEventListener('input', () => {
        state.mix[el.getAttribute('data-ch')] = +el.value;
        simRefresh(d);          // 제자리 갱신 — 다시 그리지 않는다
      });
    });
    const rb = document.getElementById('ce-reset');
    if (rb) rb.onclick = () => {
      simInit(d);
      document.querySelectorAll('.ce-slider').forEach(el => { el.value = Math.round(state.mix[el.getAttribute('data-ch')] || 0); });
      simRefresh(d);
    };
    simRefresh(d);              // 첫 그림에서도 라벨·값을 채운다
  }

  function bindInputs() {
    document.getElementById('ce-crop').addEventListener('change', e => {
      state.crop = e.target.value; state.sido = ''; state.size = ''; state.mix = null;
      fillSido(); fillSize(); render();
    });
    document.getElementById('ce-sido').addEventListener('change', e => {
      state.sido = e.target.value; state.mix = null; render();
    });
    document.getElementById('ce-size').addEventListener('change', e => {
      state.size = e.target.value; state.mix = null; fillSize(); render();
    });
  }

  // ── 시작 ───────────────────────────────────────────────────────────────────
  function boot() {
    fetch('data/CONTEST-ONLY_agr_channel_evidence.json?t=' + Date.now())
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        // 🔴 데이터가 없으면(= 공개 배포본) 탭을 만들지 않는다. 빈 탭을 남기지 않는다.
        if (!j || !j.crops) { console.log('[channel-explorer] 반출 데이터 없음 — 탭을 만들지 않는다'); return; }
        EV = j;
        if (!injectTab()) return;
        document.getElementById('ce-total').textContent =
          Object.values(EV.crops).reduce((a, c) => a + c.n, 0).toLocaleString('ko-KR');
        fillCrops(); fillSido(); fillSize(); bindInputs(); render();
        console.log('[channel-explorer] 작목', Object.keys(EV.crops).length, '· 표본', Object.values(EV.crops).reduce((a, c) => a + c.n, 0));
      })
      .catch(e => console.log('[channel-explorer] 로드 실패:', e.message));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
