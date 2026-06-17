/* 실시간 AI 교차검증 진단 엔진 (BYOK — Bring Your Own Key)
 * 보안: API 키는 사용자 브라우저 localStorage에만 저장. 서버/GitHub 전송 없음. 코드에 키 하드코딩 절대 없음.
 * 호출: 사용자 브라우저에서 각 제공사 API로 직접 요청 (우리 서버 경유 X). 비용은 입력한 키로 과금.
 */
(function () {
  'use strict';

  const PROVIDERS = ['anthropic', 'openai', 'gemini'];
  const DEFAULT_MODELS = { anthropic: 'claude-sonnet-4-6', openai: 'gpt-5.4', gemini: 'gemini-3.5-flash' };
  const LABELS = { anthropic: 'Claude', openai: 'ChatGPT', gemini: 'Gemini' };
  const AI_KEYS = { anthropic: '', openai: '', gemini: '' };
  const AI_MODELS = Object.assign({}, DEFAULT_MODELS);

  // ── 키 저장/로드/삭제 (localStorage) ──────────────────────────
  function loadApiKeys() {
    PROVIDERS.forEach((p) => {
      AI_KEYS[p] = localStorage.getItem('agr_ai_key_' + p) || '';
      AI_MODELS[p] = localStorage.getItem('agr_ai_model_' + p) || DEFAULT_MODELS[p];
      const ki = document.getElementById('ak-' + p);
      const mi = document.getElementById('am-' + p);
      if (ki) ki.placeholder = AI_KEYS[p] ? '●●●● 저장됨 (교체하려면 새로 입력)' : ki.getAttribute('data-ph') || '';
      if (mi) mi.value = AI_MODELS[p];
    });
    updateKeyStatus();
  }
  function saveApiKeys() {
    PROVIDERS.forEach((p) => {
      const ki = document.getElementById('ak-' + p);
      const mi = document.getElementById('am-' + p);
      if (ki && ki.value.trim()) {
        AI_KEYS[p] = ki.value.trim();
        localStorage.setItem('agr_ai_key_' + p, AI_KEYS[p]);
        ki.value = '';
        ki.placeholder = '●●●● 저장됨 (교체하려면 새로 입력)';
      }
      if (mi && mi.value.trim()) {
        AI_MODELS[p] = mi.value.trim();
        localStorage.setItem('agr_ai_model_' + p, AI_MODELS[p]);
      }
    });
    updateKeyStatus();
    alert('저장됐습니다. 키는 이 브라우저에만 보관됩니다(서버 전송 없음).');
  }
  function clearApiKeys() {
    if (!confirm('저장된 API 키를 모두 삭제할까요?')) return;
    PROVIDERS.forEach((p) => {
      AI_KEYS[p] = '';
      localStorage.removeItem('agr_ai_key_' + p);
      const ki = document.getElementById('ak-' + p);
      if (ki) { ki.value = ''; ki.placeholder = ki.getAttribute('data-ph') || ''; }
    });
    updateKeyStatus();
  }
  function updateKeyStatus() {
    const have = PROVIDERS.filter((p) => AI_KEYS[p]).map((p) => LABELS[p]);
    const el = document.getElementById('ai-key-status');
    if (el) el.textContent = have.length
      ? '✅ ' + have.join(', ') + ' 키 저장됨 — 직접 입력 후 진단 실행 시 실시간 교차검증'
      : '키 없음 — 저장된 사례만 표시됩니다';
  }
  function hasAnyKey() { return PROVIDERS.some((p) => AI_KEYS[p]); }

  // ── 입력 폼 → 농가 객체 ───────────────────────────────────────
  function buildFarmInput() {
    const g = (id) => (document.getElementById(id) ? document.getElementById(id).value : '').trim();
    return {
      '품목': g('f-crop'), '품종': g('f-variety'), '재배면적_㎡': g('f-area'), '연간출하량_kg': g('f-volume'),
      '출하기간': g('f-period'), '저장성': g('f-storage'), '지역': g('f-region'), '로컬푸드접근성': g('f-local'),
      '등급비율': { '상': g('f-sang'), '중': g('f-jung'), '하': g('f-ha') },
      '농가주연령': g('f-age'), '가족노동력': g('f-family'), '포장구성원': g('f-pack-member'),
      '직접판매경험': g('f-direct'), '온라인판매경험': g('f-online'), '클레임대응경험': g('f-claim'),
      '추가시간투입': g('f-time'), '협상부담': g('f-negotiate'), '포장대응': g('f-packing'), '현재판매경로': g('f-current'),
      '행동5문항': { 'Q1_가격급락대응': g('f-q1'), 'Q2_신경로시도': g('f-q2'), 'Q3_최대불만': g('f-q3'), 'Q4_클레임처리': g('f-q4'), 'Q5_출하결정': g('f-q5') }
    };
  }

  // ── 프롬프트 빌더 (농진청 TOPSIS reference 기반) ──────────────
  function buildPrompt(farm) {
    const ref = (window.RDA_CASES && window.RDA_CASES.reference) || {};
    return [
      '당신은 농촌진흥청 농가 판매경로 포트폴리오 진단 전문가입니다. 아래 TOPSIS 방법론(5농가유형 × 5평가기준)으로 진단하세요.',
      '',
      '[농가유형 5종] ' + JSON.stringify(ref.types),
      '[평가기준 C1~C5] ' + JSON.stringify(ref.criteria),
      '[유형별 가중치(C1~C5 순)] ' + JSON.stringify(ref.weights),
      '[판매경로 5종] ' + JSON.stringify(ref.routes),
      '[점수구간] ' + JSON.stringify(ref.score_bands),
      '[포트폴리오 규칙] ' + JSON.stringify(ref.portfolio_rules) + ' (경로점수 = dMinus/(dPlus+dMinus)×100)',
      '',
      '[진단 대상 농가]',
      JSON.stringify(farm, null, 1),
      '',
      '행동 5문항 신호로 농가유형(A~E)을 판정하고, 5경로 각각 C1~C5 점수(0~100)와 가중합 경로점수(0~100)를 매기고, 최대 3경로 포트폴리오(합 100%)를 제시하세요.',
      '반드시 아래 JSON "하나만" 출력하세요. 마크다운/설명/코드펜스 금지:',
      '{',
      '  "type_classification": {"type":"A|B|C|D|E","signals":{"profit":1,"stable":1,"challenge":1,"org":1},"reasoning":"판정 근거"},',
      '  "step4_route_evaluation": {"routes": {"도매시장":{"score":0,"verdict":"진입가능|제한적|비추천","criteria_scores":{"C1":0,"C2":0,"C3":0,"C4":0,"C5":0},"reasoning":"근거"},"생산자단체(조직출하)":{...},"직거래(온라인)":{...},"직거래(로컬푸드)":{...},"산지유통인":{...}}},',
      '  "step5_portfolio": {"immediate":[{"route":"경로명","ratio":50,"role":"주력|보완|완충","reason":"근거"}]},',
      '  "step9_one_line_conclusion": "한 줄 결론"',
      '}'
    ].join('\n');
  }

  // ── 제공사별 호출 (브라우저 직접) ─────────────────────────────
  async function callAnthropic(key, model, prompt) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({ model: model, max_tokens: 8192, messages: [{ role: 'user', content: prompt }] })
    });
    if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + (await r.text()).slice(0, 160));
    const d = await r.json();
    return (d.content && d.content[0] && d.content[0].text) || '';
  }
  async function callOpenAI(key, model, prompt) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + key },
      body: JSON.stringify({ model: model, temperature: 0.3, messages: [{ role: 'user', content: prompt }] })
    });
    if (!r.ok) throw new Error('OpenAI ' + r.status + ': ' + (await r.text()).slice(0, 160));
    const d = await r.json();
    return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
  }
  async function callGemini(key, model, prompt) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } })
    });
    if (!r.ok) throw new Error('Gemini ' + r.status + ': ' + (await r.text()).slice(0, 160));
    const d = await r.json();
    const c = d.candidates && d.candidates[0];
    return (c && c.content && c.content.parts && c.content.parts[0] && c.content.parts[0].text) || '';
  }
  const CALLERS = { anthropic: callAnthropic, openai: callOpenAI, gemini: callGemini };

  function extractJSON(text) {
    let t = (text || '').trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) t = fence[1].trim();
    const s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s >= 0 && e > s) t = t.slice(s, e + 1);
    return JSON.parse(t);
  }

  // ── 실시간 진단 실행 ─────────────────────────────────────────
  async function runRealtimeDiagnosis() {
    const panel = document.getElementById('port-result');
    const farm = buildFarmInput();
    if (!farm.품목) { if (window.renderDirectInputGuide) window.renderDirectInputGuide(); return; }
    const active = PROVIDERS.filter((p) => AI_KEYS[p]);
    if (active.length === 0) { if (window.renderDirectInputGuide) window.renderDirectInputGuide(); return; }

    panel.innerHTML = '<div class="empty-state"><div class="icon">⏳</div><div>' +
      active.map((p) => LABELS[p]).join(' · ') + ' 실시간 진단 중...<br>' +
      '<span style="font-size:12px;opacity:0.6">농가 정보를 모델에 보내 교차검증하는 중입니다 (수십 초 소요)</span></div></div>';

    const prompt = buildPrompt(farm);
    const results = await Promise.all(active.map(async (p) => {
      try { const txt = await CALLERS[p](AI_KEYS[p], AI_MODELS[p], prompt); return { name: LABELS[p], ok: true, data: extractJSON(txt) }; }
      catch (e) { return { name: LABELS[p], ok: false, error: String((e && e.message) || e) }; }
    }));
    renderRealtimeResult(farm, results);
  }

  function renderRealtimeResult(farm, results) {
    const panel = document.getElementById('port-result');
    const ok = results.filter((r) => r.ok);
    const fail = results.filter((r) => !r.ok);
    if (ok.length === 0) {
      panel.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><div>진단을 받지 못했습니다.<br>' +
        fail.map((f) => '<div style="font-size:12px;margin-top:6px">' + f.name + ': ' + esc(f.error) + '</div>').join('') +
        '<div style="font-size:11px;margin-top:10px;opacity:0.6">키/모델명/잔액을 확인하거나, 일부 제공사는 브라우저 직접 호출이 막혀 있을 수 있습니다.</div></div></div>';
      return;
    }
    const types = ok.map((r) => ({ name: r.name, type: (r.data.type_classification || {}).type || '?' }));
    const agree = types.every((t) => t.type === types[0].type);
    const banner = '<div style="background:' + (agree ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)') +
      ';border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:13px;line-height:1.6">' +
      '<b>🔀 교차검증</b> (' + farm.품목 + '): ' + types.map((t) => t.name + '=' + t.type + '형').join(' · ') +
      ' → ' + (agree ? '✅ 유형 일치' : '⚠️ 유형 불일치 — 사람 판단 필요(단일 AI 맹점 경고)') + '</div>';

    const cards = ok.map((r) => {
      const d = r.data;
      const tc = d.type_classification || {};
      const routes = (d.step4_route_evaluation || {}).routes || {};
      // 경로별 상세: 점수순 정렬 + verdict + 평가항목(C1~C5) + 근거(reasoning)
      const order = Object.keys(routes).sort((a, b) => ((routes[b] || {}).score || 0) - ((routes[a] || {}).score || 0));
      const routeBlocks = order.map((k) => {
        const v = routes[k] || {};
        const vc = v.verdict || '';
        const vColor = /가능|추천/.test(vc) ? '#22c55e' : /제한/.test(vc) ? '#f59e0b' : (vc ? '#ef4444' : 'var(--border)');
        const cs = v.criteria_scores || {};
        const csStr = Object.keys(cs).map((c) => c + ' ' + cs[c]).join(' · ');
        return '<div style="margin:0 0 9px;padding:9px 11px;background:var(--bg-secondary);border-radius:8px;border-left:3px solid ' + vColor + '">' +
          '<div style="font-size:13px"><b>' + esc(k) + '</b> <span style="font-weight:700">' + (v.score != null ? v.score + '점' : '-') + '</span>' +
          (vc ? ' <span style="color:' + vColor + ';font-size:11.5px">[' + esc(vc) + ']</span>' : '') + '</div>' +
          (csStr ? '<div style="font-size:11px;color:var(--text-secondary);margin-top:3px">평가항목 ' + esc(csStr) + '</div>' : '') +
          (v.reasoning ? '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;line-height:1.55">↳ ' + esc(v.reasoning) + '</div>' : '') +
          '</div>';
      }).join('');
      const port = ((d.step5_portfolio || {}).immediate || []).map((p) =>
        '<div style="font-size:12.5px;margin-bottom:5px">• ' + esc(p.route) + ' <b>' + p.ratio + '%</b> (' + esc(p.role) + ')' +
        (p.reason ? ' <span style="color:var(--text-secondary)">— ' + esc(p.reason) + '</span>' : '') + '</div>').join('');
      return '<div class="chart-section" style="margin-bottom:14px">' +
        '<h3>' + r.name + ' — ' + esc(tc.type || '?') + '형</h3>' +
        '<div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:12px;line-height:1.6"><b>유형 판정 근거</b><br>' + esc(tc.reasoning || '') + '</div>' +
        '<div style="font-size:12.5px;font-weight:700;margin-bottom:7px">경로별 평가 (점수순 · 근거)</div>' + routeBlocks +
        '<div style="font-size:12.5px;font-weight:700;margin:11px 0 6px">추천 포트폴리오</div>' + (port || '-') +
        (d.step9_one_line_conclusion ? '<div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7;margin-top:9px;padding-top:9px;border-top:1px solid var(--border)"><b>한 줄 결론</b> · ' + esc(d.step9_one_line_conclusion) + '</div>' : '') +
        '</div>';
    }).join('');

    // 🤝 겹치는 부분(합의) 추천 — 2개 이상 모델일 때 공통 상위 경로 도출
    let consensus = '';
    if (ok.length >= 2) {
      const agg = {};
      ok.forEach((r) => {
        const rt = (r.data.step4_route_evaluation || {}).routes || {};
        Object.keys(rt).forEach((k) => {
          if (!agg[k]) agg[k] = { sum: 0, cnt: 0, pass: 0 };
          const v = rt[k] || {};
          if (v.score != null) { agg[k].sum += v.score; agg[k].cnt++; }
          if (/가능|추천/.test(v.verdict || '')) agg[k].pass++;
        });
      });
      const ranked = Object.keys(agg).map((k) => ({
        route: k,
        avg: agg[k].cnt ? Math.round(agg[k].sum / agg[k].cnt * 10) / 10 : 0,
        allPass: agg[k].pass === ok.length
      })).sort((a, b) => b.avg - a.avg);
      const rows = ranked.slice(0, 3).map((t, i) =>
        '<div style="font-size:12.5px;margin-bottom:4px">' + (i + 1) + '순위 <b>' + esc(t.route) + '</b> — 평균 ' + t.avg + '점' +
        (t.allPass ? ' <span style="color:#22c55e">✅ 모든 모델 진입가능</span>' : ' <span style="color:var(--text-secondary)">(일부 모델만 추천)</span>') + '</div>').join('');
      consensus = '<div style="background:rgba(34,197,94,0.08);border:1px solid #22c55e;border-radius:10px;padding:12px 14px;margin-bottom:14px">' +
        '<div style="font-weight:700;margin-bottom:6px">🤝 ' + ok.length + '개 모델 종합 추천 (겹치는 부분)</div>' +
        '<div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:8px">각 모델 경로 점수의 평균. 여러 모델이 공통으로 높게 본 경로일수록 신뢰도가 높습니다.</div>' + rows + '</div>';
    }
    const failNote = fail.length ? '<div style="font-size:11.5px;color:var(--text-secondary);margin-top:6px">실패: ' +
      fail.map((f) => f.name + ' (' + esc(f.error) + ')').join(', ') + '</div>' : '';
    const note = '<div style="font-size:11.5px;color:var(--text-secondary);margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">' +
      '⚡ 실시간 AI 진단 (입력하신 키로 호출 — 비용 발생). 점수는 AI 판단이며 농가 데이터 기반 참고 자료입니다.</div>';
    panel.innerHTML = banner + consensus + cards + failNote + note;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ── 실측 컨설팅 (소득조사 132농가 + 출하전략 자료) ──────────
  let REAL_DATA = null;
  async function loadRealData() {
    try { const r = await fetch('data/tomato-realdata.json?t=' + Date.now()); if (r.ok) REAL_DATA = await r.json(); } catch (e) {}
  }
  function renderRealData() {
    const panel = document.getElementById('port-result');
    if (!panel) return;
    if (!REAL_DATA) { panel.innerHTML = '<div class="empty-state"><div>실측 데이터를 불러오는 중입니다. 잠시 후 다시 눌러주세요.</div></div>'; loadRealData(); return; }
    const d = REAL_DATA, ir = d.income_rate;
    const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#a855f7'];
    // 추천 포트폴리오 도넛
    const port = d.recommended_portfolio || [];
    let acc = 0;
    const slices = port.map((p, i) => {
      const st = acc, en = acc + p.ratio; acc = en;
      const a1 = (st / 100) * 2 * Math.PI - Math.PI / 2, a2 = (en / 100) * 2 * Math.PI - Math.PI / 2;
      const lg = (en - st) > 50 ? 1 : 0;
      const x1 = 80 + 62 * Math.cos(a1), y1 = 80 + 62 * Math.sin(a1), x2 = 80 + 62 * Math.cos(a2), y2 = 80 + 62 * Math.sin(a2);
      return '<path d="M 80 80 L ' + x1 + ' ' + y1 + ' A 62 62 0 ' + lg + ' 1 ' + x2 + ' ' + y2 + ' Z" fill="' + colors[i % 5] + '" opacity="0.85"/>';
    }).join('');
    const legend = port.map((p, i) =>
      '<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:9px;font-size:12.5px">' +
      '<span style="width:11px;height:11px;border-radius:3px;background:' + colors[i % 5] + ';margin-top:3px;flex-shrink:0"></span>' +
      '<span><b>' + esc(p.route) + ' ' + p.ratio + '%</b> <span style="color:var(--text-secondary)">(' + esc(p.role) + ')</span><br>' +
      '<span style="color:var(--text-secondary);font-size:11.5px;line-height:1.5">' + esc(p.reason) + '</span></span></div>'
    ).join('');
    // 경로 점수 막대
    const rs = d.route_scores || [];
    const scoreBars = rs.map((r) =>
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12.5px">' +
      '<span style="width:120px">' + esc(r.route) + '</span>' +
      '<span style="flex:1;background:rgba(34,197,94,0.12);border-radius:4px;height:20px;position:relative;overflow:hidden">' +
      '<span style="position:absolute;left:0;top:0;height:100%;width:' + r.score + '%;background:#22c55e"></span>' +
      '<span style="position:absolute;left:8px;top:3px;font-size:11px;font-weight:700;color:#0a0f1e">' + r.score + '점</span></span>' +
      '<span style="width:140px;text-align:right;color:var(--text-secondary)">' + r.price.toLocaleString() + '원·소득' + r.income_rate + '%·' + r.farms + '호</span></div>'
    ).join('');
    // 실측 분포 (접기)
    const maxRatio = Math.max.apply(null, d.routes_distribution.map((x) => x.avg_ratio));
    const distRows = d.routes_distribution.map((x) =>
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;font-size:12px"><span style="width:130px">' + esc(x.route) + '</span>' +
      '<span style="flex:1;background:rgba(59,130,246,0.12);border-radius:4px;height:16px;position:relative;overflow:hidden"><span style="position:absolute;left:0;top:0;height:100%;width:' + (x.avg_ratio / maxRatio * 100) + '%;background:#3b82f6"></span></span>' +
      '<span style="width:110px;text-align:right;color:var(--text-secondary)">' + x.avg_ratio + '% · ' + x.farms + '호</span></div>'
    ).join('');
    const strat = d.strategy.map((s) => '<li style="margin-bottom:6px"><b>' + esc(s.title) + '</b> — ' + esc(s.point) + '</li>').join('');
    panel.innerHTML =
      '<div class="chart-section">' +
      '<h3>시설방울토마토 판매경로 컨설팅 <span style="font-size:11.5px;font-weight:400;color:#22c55e">실측 ' + d.n_farms + '농가 기반</span></h3>' +
      '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:16px;line-height:1.5">' + esc(d.source) + '</div>' +
      '<div style="font-weight:600;margin-bottom:10px">💡 추천 판매경로 포트폴리오</div>' +
      '<div style="display:flex;gap:22px;align-items:center;flex-wrap:wrap;margin-bottom:20px">' +
      '<svg width="160" height="160" viewBox="0 0 160 160" style="flex-shrink:0">' + slices + '<circle cx="80" cy="80" r="34" fill="var(--bg-primary)"/></svg>' +
      '<div style="flex:1;min-width:250px">' + legend + '</div></div>' +
      '<div style="font-weight:600;margin-bottom:8px">📊 판매경로 점수 <span style="font-size:11px;font-weight:400;color:var(--text-secondary)">(실측 수취단가 기준 상대점수)</span></div>' + scoreBars +
      '<div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:10px;padding:14px;margin:18px 0 14px;font-size:13px;line-height:1.85"><b>📝 종합 컨설팅</b><br>' + esc(d.consulting) + '</div>' +
      '<div style="font-weight:600;margin:0 0 8px">출하전략 (농진청 거래특성·출하전략 자료)</div><ul style="font-size:12.5px;color:var(--text-secondary);line-height:1.6;padding-left:18px;margin:0 0 14px">' + strat + '</ul>' +
      '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:12px;line-height:1.5">⚠️ ' + esc(d.portfolio_caveat || d.caveat) + '</div>' +
      '<details style="border-top:1px solid var(--border);padding-top:10px"><summary style="cursor:pointer;font-size:12.5px;color:var(--text-secondary)">실측 데이터 자세히 — 소득률·실제 경로 분포</summary>' +
      '<div style="margin-top:10px;font-size:12px;color:var(--text-secondary)">소득률 평균 ' + ir.mean + '% · 중앙 ' + ir.median + '% (범위 ' + ir.min + '~' + ir.max + '%) · 상품화율 ' + d.quality_rate_mean + '% · 표본 ' + d.n_farms + '농가</div>' +
      '<div style="margin-top:12px;font-weight:600;font-size:12.5px;color:var(--text-primary)">실제 판매경로 분포 (132농가가 실제 쓰는 비율)</div><div style="margin-top:6px">' + distRows + '</div></details>' +
      '</div>';
  }

  // 전역 노출 (index.html에서 호출)
  window.loadRealData = loadRealData;
  window.renderRealData = renderRealData;
  window.hasRealData = function (crop) { return !!(REAL_DATA && crop && (crop === REAL_DATA.crop || crop.indexOf('방울토마토') >= 0)); };
  window.loadApiKeys = loadApiKeys;
  window.saveApiKeys = saveApiKeys;
  window.clearApiKeys = clearApiKeys;
  window.hasAnyApiKey = hasAnyKey;
  window.runRealtimeDiagnosis = runRealtimeDiagnosis;
})();
