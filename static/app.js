(() => {
  const $ = (selector) => document.querySelector(selector);
  const alertBox = $('#alert');
  const toastWrap = $('#toast-wrap');

  /* ---------- Toast ---------- */
  function toast(message, kind = 'info', ms = 3200) {
    if (!toastWrap) { showAlert(message, kind === 'error' ? 'danger' : 'success'); return; }
    const el = document.createElement('div');
    el.className = `toast-msg ${kind}`;
    el.textContent = message;
    toastWrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
  }

  /* ---------- Theme (dark / light) ---------- */
  const root = document.documentElement;
  const themeBtn = $('#theme-toggle');
  const themeIcon = themeBtn ? themeBtn.querySelector('.theme-icon') : null;
  const themeLabel = $('#theme-label');
  function applyTheme(mode) {
    const light = mode === 'light';
    root.setAttribute('data-theme', light ? 'light' : 'dark');
    if (editor) editor.setOption('theme', light ? 'eclipse' : 'default');
    if (themeIcon) themeIcon.textContent = light ? '☀️' : '🌙';
    if (themeLabel) themeLabel.textContent = light ? 'نهاري' : 'ليلي';
    try { localStorage.setItem('zte-theme', light ? 'light' : 'dark'); } catch (_) {}
  }
  let savedTheme = 'dark';
  try { savedTheme = localStorage.getItem('zte-theme') || 'dark'; } catch (_) {}
  if (savedTheme !== 'dark' && savedTheme !== 'light') savedTheme = 'dark';

  const editor = CodeMirror.fromTextArea($('#xml-editor'), {
    mode: 'application/xml',
    lineNumbers: true,
    lineWrapping: false,
    theme: savedTheme === 'light' ? 'eclipse' : 'default',
    indentUnit: 2,
    tabSize: 2,
    styleActiveLine: true,
    gutters: ['CodeMirror-linenumbers', 'edit-gutter'],
    extraKeys: {
      'Ctrl-F': 'findPersistent',
      'Cmd-F': 'findPersistent',
      'Ctrl-G': 'findNext',
      'Shift-Ctrl-G': 'findPrev',
      'Ctrl-S': () => { $('#encode-form-submit').click(); return false; },
    },
  });
  let metadata = {};
  let baseline = '';
  let silentSet = false; // true أثناء التعيين البرمجي لتفادي تعليم آلاف الأسطر
  const editedLines = new Set();
  function clearEditMarks() {
    editedLines.forEach((ln) => { try { editor.removeLineClass(ln, 'background', 'edited-line'); } catch (_) {} try { editor.setGutterMarker(ln, 'edit-gutter', null); } catch (_) {} });
    editedLines.clear();
  }
  function markEdited(line) {
    try {
      editor.addLineClass(line, 'background', 'edited-line');
      const dot = document.createElement('div');
      dot.className = 'edit-dot';
      dot.textContent = '●';
      dot.title = 'سطر مُعدَّل';
      editor.setGutterMarker(line, 'edit-gutter', dot);
      editedLines.add(line);
    } catch (_) {}
  }

  applyTheme(savedTheme);
  if (themeBtn) themeBtn.addEventListener('click', () => {
    applyTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
  });

  /* ---------- Steps ---------- */
  const stepsEl = $('#steps');
  function setStep(n) {
    if (!stepsEl) return;
    stepsEl.querySelectorAll('[data-step]').forEach((d) => {
      const s = Number(d.getAttribute('data-step'));
      d.classList.toggle('active', s === n);
      d.classList.toggle('done', s < n);
    });
  }
  if (stepsEl) {
    stepsEl.querySelectorAll('[data-goto]').forEach((d) => {
      d.addEventListener('click', () => goStep(Number(d.getAttribute('data-goto')), true));
      d.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goStep(Number(d.getAttribute('data-goto')), true); } });
    });
  }

  /* ---------- Wizard (تطبيق بخطوات) ---------- */
  const wizardEl = $('#wizard');
  let operation = 'decode';
  try { operation = localStorage.getItem('zte-op') || 'decode'; } catch (_) {}
  if (operation !== 'decode' && operation !== 'encode') operation = 'decode';
  let wizardStep = 1;
  function currentOp() { return operation; }
  function applyOp() {
    document.querySelectorAll('[data-opmini]').forEach((c) => {
      const on = c.getAttribute('data-opmini') === operation;
      c.classList.toggle('selected', on);
      c.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const df = $('#decode-form'), xf = $('#xml-upload-form');
    if (df) df.classList.toggle('d-none', operation !== 'decode');
    if (xf) xf.classList.toggle('d-none', operation !== 'encode');
    try { localStorage.setItem('zte-op', operation); } catch (_) {}
  }
  document.querySelectorAll('[data-opmini]').forEach((c) => {
    c.addEventListener('click', () => { operation = c.getAttribute('data-opmini'); applyOp(); });
  });
  function canEnter(n) {
    if (n === 1) return true;
    if (operation === 'encode') {
      if (n > 1 && n < 6) { toast('هذه الخطوة لمسار فك config.bin — أكمل التشفير في الخطوة 1', 'error'); return false; }
      return true;
    }
    if (!editor.getValue().trim()) { toast('ارفع وفك ملفاً أولاً في الخطوة 1', 'error'); return false; }
    if (n === 4 && !selectedIsp) { toast('اختر الشركة المطلوبة أولاً في الخطوة 3', 'error'); return false; }
    return true;
  }
  function goStep(n, fromUser) {
    n = Math.min(6, Math.max(1, n));
    if (fromUser && !canEnter(n)) return false;
    wizardStep = n;
    if (wizardEl) wizardEl.querySelectorAll('.wpanel').forEach((p) => {
      p.classList.toggle('active', Number(p.getAttribute('data-panel')) === n);
    });
    setStep(n);
    if (n === 5) renderAllThenHide(() => {});
    const w = $('#wizard');
    if (w && fromUser) w.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }
  const toStep3 = $('#to-step-3');
  if (toStep3) toStep3.addEventListener('click', () => {
    if (!selectedSource) { toast('اختر سوفت الراوتر الحالي أولاً', 'error'); return; }
    goStep(3, true);
  });
  const toStep4 = $('#to-step-4');
  if (toStep4) toStep4.addEventListener('click', () => {
    if (!selectedIsp) { toast('اختر الشركة المطلوبة أولاً', 'error'); return; }
    goStep(4, true);
  });
  const toStep6 = $('#to-step-6');
  if (toStep6) toStep6.addEventListener('click', () => { fillFinish(); goStep(6, true); });
  document.querySelectorAll('[data-back]').forEach((b) => {
    b.addEventListener('click', () => goStep(Number(b.getAttribute('data-back')), false));
  });
  const restartBtn = $('#wizard-restart');
  if (restartBtn) restartBtn.addEventListener('click', () => { goStep(1, false); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  function fillFinish() {
    const bytes = new Blob([editor.getValue()]).size;
    const s = $('#finish-summary');
    if (s) {
      s.textContent = operation === 'encode'
        ? 'تم تشفير XML — حمّل config.bin من الأسفل.'
        : `XML جاهز (${editor.lineCount().toLocaleString('ar')} سطر • ${bytes.toLocaleString('ar')} بايت) — حمّل النتيجة.`;
    }
    const fm = $('#finish-meta');
    if (fm) {
      fm.innerHTML = '';
      if (metadata && metadata.signature) {
        [['التوقيع', metadata.signature], ['الحمولة', 'Type ' + (metadata.payload_type ?? '—')], ['المفتاح', metadata.used_key_source || '—']].forEach(([k, v]) => {
          const d = document.createElement('div');
          d.className = 'meta-item';
          d.innerHTML = `<small>${k}</small><b dir="auto"></b>`;
          d.querySelector('b').textContent = String(v).slice(0, 48);
          fm.appendChild(d);
        });
      }
    }
    const dlXml = $('#finish-dl-xml'), dlBin = $('#finish-dl-bin');
    if (dlXml) dlXml.disabled = !editor.getValue().trim();
    if (dlBin) dlBin.disabled = !editor.getValue().trim();
  }
  const finishDlXml = $('#finish-dl-xml');
  if (finishDlXml) finishDlXml.addEventListener('click', () => $('#download-xml').click());
  const finishDlBin = $('#finish-dl-bin');
  if (finishDlBin) finishDlBin.addEventListener('click', () => openConfirm(doEncodeBin));
  applyOp();
  goStep(1, false);

  /* ---------- Persist settings ---------- */
  const PREFS_KEY = 'zte-prefs';
  function savePrefs() {
    try {
      const get = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        key_mode: get('key-mode'), signature: get('signature'), serial: get('serial'),
        mac: get('mac'), longpass: get('longpass'),
        upload_payload_type: get('upload-payload-type'), upload_key_mode: get('upload-key-mode'),
        upload_signature: get('upload-signature'),
      }));
    } catch (_) {}
  }
  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      Object.entries({ 'key-mode': p.key_mode, 'signature': p.signature, 'serial': p.serial, 'mac': p.mac, 'longpass': p.longpass, 'upload-payload-type': p.upload_payload_type, 'upload-key-mode': p.upload_key_mode, 'upload-signature': p.upload_signature }).forEach(([id, v]) => {
        if (v === undefined) return;
        const el = document.getElementById(id);
        if (el) el.value = v;
      });
      $('#custom-fields').classList.toggle('d-none', $('#key-mode').value !== 'custom');
      $('#upload-custom-fields').classList.toggle('d-none', $('#upload-key-mode').value !== 'custom');
    } catch (_) {}
  }
  loadPrefs();
  document.querySelectorAll('#decode-form select, #decode-form input, #xml-upload-form select, #xml-upload-form input[type=text]').forEach((el) => {
    el.addEventListener('change', savePrefs);
  });

  /* ---------- Progress ---------- */
  function progressShow(id, on) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('d-none', !on);
  }

  function showAlert(message, kind = 'danger') {
    alertBox.className = `alert alert-${kind}`;
    alertBox.textContent = message;
    alertBox.classList.remove('d-none');
    clearTimeout(showAlert._t);
    showAlert._t = setTimeout(() => alertBox.classList.add('d-none'), 6000);
  }
  function setBusy(button, busy, label) {
    if (!button) return;
    button.disabled = busy;
    const spinner = button.querySelector('.spinner-border');
    if (spinner) spinner.classList.toggle('d-none', !busy);
    const txt = button.querySelector('.btn-text');
    if (txt && label) txt.textContent = label;
  }

  /* ---------- Edit / cursor indicators ---------- */
  const dirtyBadge = $('#dirty-badge');
  const cursorPos = $('#cursor-pos');
  const editPos = $('#edit-pos');
  const emptyState = $('#editor-empty');
  function syncEditor() {
    const val = editor.getValue();
    const bytes = new Blob([val]).size;
    const sizeEl = $('#xml-size');
    if (sizeEl) sizeEl.textContent = `${bytes.toLocaleString('ar')} بايت`;
    const lc = $('#line-count');
    if (lc) lc.textContent = `${editor.lineCount().toLocaleString('ar')} سطر`;
    const dirty = val !== baseline;
    const hasContent = val.trim().length > 0;
    if (dirtyBadge) dirtyBadge.classList.toggle('d-none', !dirty);
    if (emptyState) emptyState.classList.toggle('d-none', hasContent);
    const dl = $('#download-xml');
    const enc = $('#encode-form-submit');
    if (dl) dl.disabled = !hasContent;
    if (enc) enc.disabled = !hasContent;
    if (hasContent) setStep(5);
    // إحصاء كلمات السر + تحقق حي (بتأخير)
    clearTimeout(syncEditor._t);
    syncEditor._t = setTimeout(() => {
      try {
        const m = val.match(/passw(?:or)?d|presharedkey|wpakey|wepkey/gi);
        const pc = $('#pass-count');
        if (pc) pc.textContent = `🔑 ${(m ? m.length : 0).toLocaleString('ar')}`;
        const xv = $('#xml-valid');
        if (xv) {
          if (!hasContent) { xv.textContent = '○'; xv.className = ''; }
          else {
            const doc = new DOMParser().parseFromString(val, 'text/xml');
            const ok = !doc.querySelector('parsererror');
            xv.textContent = ok ? '✔' : '✖';
            xv.className = ok ? 'valid-ok' : 'valid-bad';
            xv.title = ok ? 'XML سليم' : 'XML غير صالح';
          }
        }
      } catch (_) {}
    }, 400);
  }
  function syncCursor() {
    const c = editor.getCursor();
    if (cursorPos) cursorPos.textContent = `Ln ${c.line + 1}, Col ${c.ch + 1}`;
  }
  editor.on('change', (_cm, change) => {
    syncEditor();
    if (editPos && change) {
      const now = new Date().toLocaleTimeString('ar');
      editPos.textContent = `آخر تعديل: سطر ${change.from.line + 1} • ${now}`;
    }
    try {
      if (silentSet) return;
      const from = change ? change.from.line : editor.getCursor().line;
      const to = change ? change.to.line : from;
      for (let ln = from; ln <= to; ln++) markEdited(ln);
    } catch (_) {}
  });
  editor.on('cursorActivity', syncCursor);
  syncEditor(); syncCursor(); setStep(1);

  function renderMeta(md) {
    const grid = $('#meta-grid');
    if (!grid) return;
    if (!md || !md.signature) { grid.classList.add('d-none'); grid.innerHTML = ''; return; }
    const items = [
      ['التوقيع', md.signature || '—'],
      ['الحمولة', 'Type ' + (md.payload_type ?? '—')],
      ['المفتاح', md.used_key_source || '—'],
      ['الإصدار', String(md.version ?? '—')],
    ];
    grid.innerHTML = items.map(([k, v]) => `<div class="meta-item"><small>${k}</small><b dir="auto">${String(v).slice(0, 48)}</b></div>`).join('');
    grid.classList.remove('d-none');
  }

  /* ---------- Search inside XML ---------- */
  const searchInput = $('#editor-search');
  const searchCount = $('#search-count');
  let searchMarks = [];
  let searchIndex = -1;
  function clearSearch() {
    searchMarks.forEach((m) => { try { m.clear(); } catch (_) {} });
    searchMarks = []; searchIndex = -1;
    if (searchCount) searchCount.textContent = '0 / 0';
    if (searchInput) searchInput.classList.remove('has-results', 'no-results');
  }
  function runSearch(forward = true) {
    clearSearch();
    const q = (searchInput.value || '').trim();
    if (!q) return;
    const cursor = editor.getSearchCursor(q, { line: 0, ch: 0 }, { caseFold: true });
    let guard = 0;
    while (cursor.findNext() && guard++ < 1000) {
      searchMarks.push(editor.markText(cursor.from(), cursor.to(), { className: 'cm-search-hit' }));
    }
    if (!searchMarks.length) {
      if (searchCount) searchCount.textContent = '0 / 0';
      searchInput.classList.add('no-results');
      return;
    }
    searchInput.classList.add('has-results');
    searchIndex = 0;
    jumpToHit(searchIndex);
  }
  function jumpToHit(i) {
    if (!searchMarks.length) return;
    searchIndex = (i + searchMarks.length) % searchMarks.length;
    const ranges = searchMarks.map((m) => { try { return m.find(); } catch (_) { return null; } }).filter(Boolean);
    if (!ranges.length) return;
    const r = ranges[searchIndex];
    const cur = searchMarks[searchMarks.length - 1];
    if (cur && cur.className === 'cm-search-hit-current') { try { cur.clear(); } catch (_) {} searchMarks.pop(); }
    try { searchMarks.push(editor.markText(r.from, r.to, { className: 'cm-search-hit-current' })); } catch (_) {}
    editor.setSelection(r.from, r.to);
    editor.scrollIntoView({ from: r.from, to: r.to }, 120);
    if (searchCount) searchCount.textContent = `${searchIndex + 1} / ${ranges.length}`;
  }
  let searchDebounce = null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => runSearch(true), 250);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (!searchMarks.length) runSearch(true); else jumpToHit(searchIndex + (e.shiftKey ? -1 : 1)); }
      if (e.key === 'Escape') { clearSearch(); searchInput.value = ''; editor.focus(); }
    });
  }
  $('#search-next').addEventListener('click', () => { if (!searchMarks.length) runSearch(true); else jumpToHit(searchIndex + 1); });
  $('#search-prev').addEventListener('click', () => { if (!searchMarks.length) runSearch(true); else jumpToHit(searchIndex - 1); });
  $('#search-clear').addEventListener('click', () => { clearSearch(); searchInput.value = ''; searchInput.focus(); });
  const emptyDismiss = $('#empty-dismiss');
  if (emptyDismiss) emptyDismiss.addEventListener('click', () => { if (emptyState) emptyState.classList.add('d-none'); editor.focus(); });

  /* ---------- Toolbar ---------- */
  $('#btn-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(editor.getValue()); toast('تم نسخ XML إلى الحافظة', 'success'); }
    catch (_) { editor.execCommand('selectAll'); document.execCommand('copy'); toast('تم نسخ XML', 'success'); }
  });
  $('#btn-validate').addEventListener('click', () => {
    const v = editor.getValue().trim();
    if (!v) { toast('المحرر فارغ — ارفع ملفاً أولاً', 'error'); return; }
    try {
      new DOMParser().parseFromString(v, 'text/xml').querySelector('parsererror');
      const doc = new DOMParser().parseFromString(v, 'text/xml');
      if (doc.querySelector('parsererror')) throw new Error('parse');
      toast('XML سليم ✔', 'success');
    } catch (_) { toast('XML غير صالح — راجع العلامات', 'error'); showAlert('XML غير صالح — راجع العلامات المفتوحة والمغلقة.'); }
  });

  /* ---------- Advanced options (manual XML editing) ---------- */
  const gotoGo = $('#goto-line-go');
  if (gotoGo) gotoGo.addEventListener('click', () => {
    const n = parseInt(($('#goto-line').value || '1'), 10);
    if (!n || n < 1 || n > editor.lineCount()) { toast('رقم السطر خارج النطاق', 'error'); return; }
    editor.setCursor({ line: n - 1, ch: 0 });
    editor.scrollIntoView({ from: { line: n - 1, ch: 0 }, to: { line: n - 1, ch: 0 } }, 120);
    editor.focus();
  });
  const btnRestore = $('#btn-restore');
  if (btnRestore) btnRestore.addEventListener('click', () => {
    if (!baseline) { toast('لا توجد نسخة أصلية للاسترجاع', 'error'); return; }
    silentSet = true;
    editor.setValue(baseline);
    silentSet = false;
    clearEditMarks(); clearSearch(); syncEditor(); syncCursor();
    toast('تم استرجاع النسخة الأصلية', 'success');
  });
  const btnClear = $('#btn-clear');
  if (btnClear) btnClear.addEventListener('click', () => {
    if (!editor.getValue()) return;
    if (!window.confirm('مسح كل محتوى المحرر؟ يمكن استرجاع نسخة الفك بزر استرجاع الأصل.')) return;
    editor.setValue('');
    clearEditMarks(); clearSearch(); syncEditor(); syncCursor();
  });

  /* ---------- Editor loading (عرض البيانات مرة واحدة) ---------- */
  const editorLoading = $('#editor-loading');
  function editorBusy(on) {
    if (editorLoading) {
      editorLoading.classList.toggle('d-none', !on);
      editorLoading.setAttribute('aria-hidden', on ? 'false' : 'true');
    }
  }
  function renderAllThenHide(fn) {
    editorBusy(true);
    setTimeout(() => {
      try { fn(); } finally {
        try { editor.refresh(); } catch (_) {}
        requestAnimationFrame(() => requestAnimationFrame(() => editorBusy(false)));
      }
    }, 60);
  }

  /* ---------- Full-page drag & drop ---------- */
  const pageDrop = $('#page-drop');
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; if (pageDrop) pageDrop.classList.remove('d-none'); });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('dragleave', (e) => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; if (pageDrop) pageDrop.classList.add('d-none'); } });
  window.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0;
    if (pageDrop) pageDrop.classList.add('d-none');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    const name = (file.name || '').toLowerCase();
    const isXml = name.endsWith('.xml');
    if (isXml && operation !== 'encode') { operation = 'encode'; applyOp(); }
    if (!isXml && operation !== 'decode') { operation = 'decode'; applyOp(); }
    const target = (isXml ? $('#xml-file-input') : $('#file-input'));
    if (!target) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    target.files = dt.files;
    target.dispatchEvent(new Event('change'));
    toast('تم استلام الملف: ' + file.name, 'info');
    goStep(1, false);
  });

  /* ---------- ISP auto-patch (WE / Vodafone / Orange / Etisalat) ---------- */
  const ISP_PRESETS = {
    we: { name: 'WE', domain: 'tedata.net.eg', landlineOnly: false },
    vodafone: { name: 'فودافون', domain: 'vodafone.com.eg', landlineOnly: true },
    orange: { name: 'أورانج', domain: 'orange.net.eg', landlineOnly: true },
    etisalat: { name: 'اتصالات', domain: 'etisalat.com.eg', landlineOnly: true },
  };
  // رقم أرضي بكود المحافظة: أرقام فقط (عربية أو لاتينية)، مع تجاهل بادئة 20/0020
  function normalizeLandline(raw) {
    const ar = '٠١٢٣٤٥٦٧٨٩';
    let s = String(raw || '').replace(/[٠-٩]/g, (d) => String(ar.indexOf(d))).replace(/\D/g, '');
    s = s.replace(/^0020/, '');
    if (/^20\d{8,11}$/.test(s)) s = s.slice(2);
    return s;
  }
  function ispFieldHint() {
    const label = $('#isp-username-label');
    const u = $('#isp-username');
    if (!label || !u) return;
    if (selectedIsp && ISP_PRESETS[selectedIsp] && ISP_PRESETS[selectedIsp].landlineOnly) {
      label.innerHTML = 'رقم التليفون الأرضي بكود المحافظة <small>(مثال: 0401234567)</small>';
      u.placeholder = '0401234567';
      u.setAttribute('inputmode', 'numeric');
    } else {
      label.innerHTML = 'اسم مستخدم الإنترنت <small>(اختياري — من رسالة الشركة)</small>';
      u.placeholder = selectedIsp && ISP_PRESETS[selectedIsp] ? 'مثال: 0401234567@' + ISP_PRESETS[selectedIsp].domain : '';
      u.setAttribute('inputmode', 'text');
    }
  }
  let selectedIsp = null; // الشركة المطلوبة (الهدف)
  let selectedSource = null; // سوفت الراوتر الحالي (المصدر)
  document.querySelectorAll('#isp-source-cards .isp-card').forEach((c) => {
    c.addEventListener('click', () => {
      selectedSource = c.getAttribute('data-ispsrc');
      document.querySelectorAll('#isp-source-cards .isp-card').forEach((x) => {
        const on = x === c;
        x.classList.toggle('selected', on);
        x.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    });
  });
  document.querySelectorAll('#isp-target-cards .isp-card').forEach((c) => {
    c.addEventListener('click', () => {
      selectedIsp = c.getAttribute('data-isp');
      document.querySelectorAll('#isp-target-cards .isp-card').forEach((x) => {
        const on = x === c;
        x.classList.toggle('selected', on);
        x.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      ispFieldHint();
    });
  });
  const passToggle = $('#pass-toggle');
  if (passToggle) passToggle.addEventListener('click', () => {
    const p = $('#isp-password');
    if (!p) return;
    const show = p.type === 'password';
    p.type = show ? 'text' : 'password';
    passToggle.textContent = show ? '🙈' : '👁';
    passToggle.setAttribute('aria-label', show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
  });
  // غير WE: حقل الرقم لا يقبل إلا أرقاماً فقط
  const ispUserInput = $('#isp-username');
  if (ispUserInput) ispUserInput.addEventListener('input', () => {
    if (selectedIsp && ISP_PRESETS[selectedIsp] && ISP_PRESETS[selectedIsp].landlineOnly) {
      const ar = '٠١٢٣٤٥٦٧٨٩';
      ispUserInput.value = ispUserInput.value.replace(/[٠-٩]/g, (d) => String(ar.indexOf(d))).replace(/\D/g, '').slice(0, 11);
    }
  });
  const FULL_USER_RE = /^[^@\s<>"]+@[A-Za-z0-9.-]+\.(?:net\.eg|com\.eg|org\.eg|edu\.eg|net|com|org)$/i;
  // نطاق التعديل: اشتراك الإنترنت (PPPoE/WAN) فقط — الواي فاي ودخول الراوتر مستثنيان دائماً
  const WAN_CTX = /wan|ppp|pppoe|broadband|internet|connection|dial/i;
  const SAFE_SKIP = /wlan|wifi|wireless|ssid|preshared|wep\b|wpa|lan\b|ethernet|dhcp|dns|admin|useraccount|deviceinfo|login|voip|voice|iptv|tr069|managementserver|cwmp/i;
  function ctxPath(el) {
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && parts.length < 6) { parts.unshift(n.tagName); n = n.parentElement; }
    return parts.join(' > ');
  }
  function ispPatchDom(doc, newUser, newPass, domain, changes, stats, strict) {
    const els = doc.getElementsByTagName('*');
    const seen = new Set();
    const consider = (el, get, set, kind) => {
      const val = get().trim();
      if (!FULL_USER_RE.test(val) || seen.has(el.tagName + '|' + val)) return;
      const path = ctxPath(el);
      if (SAFE_SKIP.test(path)) { stats.skipped++; return; }
      if (strict && !WAN_CTX.test(path)) return;
      seen.add(el.tagName + '|' + val);
      const local = val.split('@')[0];
      const nu = newUser || (local + '@' + domain);
      if (nu !== val) {
        changes.push([val, nu, (kind === 'attr' ? '@' : '') + el.tagName + ' ← ' + path.split(' > ').slice(-2).join(' > ')]);
        set(nu);
        stats.wan++;
        if (newPass) ispPatchPassword(el.parentElement || el, newPass, changes, stats);
      }
    };
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      for (let a = 0; a < el.attributes.length; a++) {
        const at = el.attributes[a];
        consider(el, () => at.value, (v) => { at.value = v; }, 'attr');
      }
      if (el.children.length === 0 && el.textContent) {
        consider(el, () => el.textContent, (v) => { el.textContent = v; }, 'text');
      }
    }
  }
  function ispPatchPassword(scopeEl, newPass, changes, stats) {
    stats = stats || { wan: 0, skipped: 0 };
    let n = 0;
    const setIf = (el, get, set) => {
      const path = ctxPath(el);
      if (SAFE_SKIP.test(path)) { stats.skipped++; return; }
      if (get().trim()) { set(newPass); n++; }
    };
    const els = scopeEl.getElementsByTagName('*');
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (/passw|passwd/i.test(el.tagName) && el.children.length === 0) setIf(el, () => el.textContent, (v) => { el.textContent = v; });
      for (let a = 0; a < el.attributes.length; a++) {
        const at = el.attributes[a];
        if (/passw|passwd/i.test(at.name)) setIf(el, () => at.value, (v) => { at.value = v; });
      }
    }
    for (let a = 0; a < scopeEl.attributes.length; a++) {
      const at = scopeEl.attributes[a];
      if (/passw|passwd/i.test(at.name)) setIf(scopeEl, () => at.value, (v) => { at.value = v; });
    }
    if (n > 0) changes.push(['كلمة سر الاشتراك', 'محدّثة (×' + n + ') — مخفية للخصوصية', 'PPPoE']);
  }
  const ispApply = $('#isp-apply');
  if (ispApply) ispApply.addEventListener('click', () => {
    const xml = editor.getValue();
    if (!xml.trim()) { toast('لا يوجد ملف — ارفع وفك config.bin أولاً', 'error'); return; }
    if (!selectedIsp || !ISP_PRESETS[selectedIsp]) { toast('اختر الشركة المطلوبة أولاً', 'error'); return; }
    if (!selectedSource || !ISP_PRESETS[selectedSource]) { toast('ارجع للخطوة 2 واختر سوفت الراوتر الحالي أولاً', 'error'); return; }
    if (selectedSource === selectedIsp) { toast('المصدر والهدف نفس الشركة — لا يوجد ما يُعدَّل', 'error'); return; }
    const preset = ISP_PRESETS[selectedIsp];
    const srcPreset = ISP_PRESETS[selectedSource];
    const rawUser = ($('#isp-username').value || '').trim();
    const manualPass = $('#isp-password').value || '';
    if (!manualPass) { toast('أدخل كلمة سر الإنترنت — الحقل إجباري', 'error'); return; }
    let manualUser = null;
    if (rawUser) {
      if (preset.landlineOnly) {
        // غير WE: رقم أرضي بكود المحافظة فقط (نتسامح مع لصق اسم كامل بأخذ ما قبل @)
        const digits = normalizeLandline(rawUser.split('@')[0]);
        if (!/^\d{8,11}$/.test(digits)) { toast('أدخل رقم التليفون الأرضي بكود المحافظة (أرقام فقط، مثال: 0401234567)', 'error'); return; }
        manualUser = digits + '@' + preset.domain;
      } else if (rawUser.includes('@')) {
        if (!FULL_USER_RE.test(rawUser)) { toast('صيغة اسم المستخدم غير صحيحة (مثال: user@tedata.net.eg)', 'error'); return; }
        manualUser = rawUser;
      } else {
        const digits = normalizeLandline(rawUser);
        if (!/^\d{8,11}$/.test(digits)) { toast('أدخل اسم المستخدم كاملاً أو رقم الأرضي بكود المحافظة', 'error'); return; }
        manualUser = digits + '@' + preset.domain;
      }
    }
    const changes = [];
    const stats = { wan: 0, skipped: 0 };
    let out = null;
    let broadMode = false;
    try {
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      if (doc.querySelector('parsererror')) throw new Error('parse');
      ispPatchDom(doc, manualUser || null, manualPass || null, preset.domain, changes, stats, true);
      if (!changes.length) { broadMode = true; ispPatchDom(doc, manualUser || null, manualPass || null, preset.domain, changes, stats, false); }
      out = new XMLSerializer().serializeToString(doc);
      new DOMParser().parseFromString(out, 'text/xml').querySelector('parsererror') && (() => { throw new Error('parse'); })();
    } catch (_) {
      // احتياطي: استبدال القيم الكاملة فقط خارج سياقات الواي فاي/الدخول
      const re = /((?:val="|>))([^<>\s"]+?@(?:[\w.-]+\.(?:net\.eg|com\.eg|org\.eg|net|com)))/gi;
      let m;
      const parts = [];
      let last = 0;
      while ((m = re.exec(xml)) && parts.length < 2000) {
        const lookback = xml.slice(Math.max(0, m.index - 400), m.index);
        const tag = (lookback.match(/<([A-Za-z0-9_.:-]+)[^<>]*$/) || [])[1] || '';
        if (SAFE_SKIP.test(lookback.slice(-120) + ' ' + tag)) { stats.skipped++; continue; }
        const user = m[2];
        const nu = manualUser || (user.split('@')[0] + '@' + preset.domain);
        if (nu !== user) { changes.push([user, nu, tag]); stats.wan++; parts.push([m.index, m[0], m[1] + nu]); }
      }
      out = xml;
      for (let i = parts.length - 1; i >= 0; i--) {
        const [idx, oldM, rep] = parts[i];
        out = out.slice(0, idx) + rep + out.slice(idx + oldM.length);
      }
    }
    if (!changes.length) {
      toast('لم أعثر على اسم مستخدم PPPoE في الملف — راجع المحرر يدوياً', 'error', 4500);
      showAlert('لم يتم العثور على بيانات PPPoE قابلة للتعديل التلقائي. يمكنك التعديل يدوياً في الخطوة 4.');
      return;
    }
    silentSet = true;
    renderAllThenHide(() => {
      editor.setValue(out);
      editor.setCursor({ line: 0, ch: 0 });
      silentSet = false;
    });
    clearEditMarks();
    syncEditor(); syncCursor();
    const ep = $('#edit-pos');
    if (ep) ep.textContent = `تعديل تلقائي: من ${srcPreset.name} إلى ${preset.name} • ${new Date().toLocaleTimeString('ar')}`;
    const box = $('#isp-result');
    if (box) box.classList.remove('d-none');
    const cnt = $('#isp-count');
    if (cnt) cnt.textContent = String(changes.length);
    ispChangeCount = changes.length;
    const ul = $('#isp-changes');
    if (ul) {
      ul.innerHTML = '';
      changes.slice(0, 20).forEach(([o, v, where]) => {
        const li = document.createElement('li');
        li.innerHTML = '<span class="old" dir="ltr"></span> ← <span class="new" dir="ltr"></span><br><span class="where" dir="ltr"></span>';
        li.querySelector('.old').textContent = o;
        li.querySelector('.new').textContent = v;
        if (where) li.querySelector('.where').textContent = 'المكان: ' + where;
        ul.appendChild(li);
      });
      if (changes.length > 20) {
        const li = document.createElement('li');
        li.textContent = `… و${changes.length - 20} تغيير آخر`;
        ul.appendChild(li);
      }
      const safe = document.createElement('li');
      safe.className = 'safety-line';
      safe.textContent = `🛡 لم يتم المساس بالواي فاي أو دخول الراوتر — تم تخطي ${stats.skipped} قيمة خارج اشتراك الإنترنت${broadMode ? ' (وضع موسّع)' : ''}`;
      ul.appendChild(safe);
    }
    toast(`تم تعديل الملف من ${srcPreset.name} إلى ${preset.name} بنجاح`, 'success');
  });
  const ispSkip = $('#isp-skip');
  if (ispSkip) ispSkip.addEventListener('click', () => goStep(5, true));
  const ispReview = $('#isp-review');
  if (ispReview) ispReview.addEventListener('click', () => goStep(5, true));
  const ispDownload = $('#isp-download');
  if (ispDownload) ispDownload.addEventListener('click', () => {
    const sp = ispDownload.querySelector('.spinner-border');
    if (sp) sp.classList.remove('d-none');
    openConfirm(() => { setTimeout(() => { if (sp) sp.classList.add('d-none'); }, 4000); doEncodeBin(); });
  });

  /* فحص تلقائي للملف المختار بلغة بسيطة قبل أي زر */
  function validatePickedFile(input, kind) {
    const box = $(kind === 'xml' ? '#xml-file-check' : '#file-check');
    const file = input.files && input.files[0];
    if (!box) return;
    if (!file) { box.textContent = ''; box.className = 'file-check'; return; }
    const fail = (msg) => { box.textContent = '⚠ ' + msg; box.className = 'file-check bad'; toast(msg, 'error', 4500); };
    const name = (file.name || '').toLowerCase();
    if (!file.size) { fail('الملف فاضي — اتأكد إنك حملته كامل من صفحة الراوتر'); return; }
    if (file.size > 16 * 1024 * 1024) { fail('الملف أكبر من 16 ميجا — ارفع نسخة الإعدادات فقط'); return; }
    if (kind === 'bin' && !name.endsWith('.bin')) { fail('اختار ملف بامتداد .bin اللي نزلته من الراوتر'); return; }
    if (kind === 'xml' && !name.endsWith('.xml')) { fail('اختار ملف بامتداد .xml'); return; }
    box.textContent = '… بنفحص أول الملف';
    box.className = 'file-check';
    try {
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const head = String.fromCharCode.apply(null, new Uint8Array(rd.result));
          if (head.indexOf('BAMC') === 0) {
            box.textContent = '⚠ الملف ده محفوظ كنص (يبدأ بـ BAMC) — ارفع config.bin الأصلي من الراوتر';
            box.className = 'file-check bad';
          } else {
            box.textContent = kind === 'bin' ? '✔ شكل الملف سليم — دوس فك التشفير' : '✔ شكل الملف سليم — دوس تشفير';
            box.className = 'file-check ok';
          }
        } catch (_) {}
      };
      rd.onerror = () => { box.textContent = ''; box.className = 'file-check'; };
      rd.readAsArrayBuffer(file.slice(0, 4));
    } catch (_) { box.textContent = ''; box.className = 'file-check'; }
  }

  const waCopy = $('#wa-copy');
  if (waCopy) waCopy.addEventListener('click', async () => {
    const h = ($('#wa-handle').textContent || '').trim();
    try { await navigator.clipboard.writeText(h); toast('تم نسخ معرف واتساب', 'success'); }
    catch (_) { toast(h, 'info', 4500); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && confirmModal && !confirmModal.classList.contains('d-none')) closeConfirm(); });

  /* ---------- File inputs ---------- */
  function bindFile(inputSel, nameSel, zoneSel, kind) {
    const input = $(inputSel);
    if (!input) return;
    input.addEventListener('change', (event) => {
      const file = event.target.files[0];
      $(nameSel).textContent = file ? `${file.name} — ${(file.size / 1024).toFixed(1)} KB` : 'لم يتم اختيار ملف';
      $(zoneSel).classList.toggle('has-file', Boolean(file));
      if (file) { setStep(1); validatePickedFile(input, kind); }
    });
    const zone = $(zoneSel);
    if (zone) {
      zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
      ['dragenter', 'dragover'].forEach((n) => zone.addEventListener(n, (e) => { e.preventDefault(); zone.classList.add('dragging'); }));
      ['dragleave', 'drop'].forEach((n) => zone.addEventListener(n, (e) => { e.preventDefault(); zone.classList.remove('dragging'); }));
      zone.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) { const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; input.dispatchEvent(new Event('change')); toast('تم استلام الملف: ' + file.name, 'info'); }
      });
    }
  }
  bindFile('#file-input', '#file-name', '#dropzone', 'bin');
  bindFile('#xml-file-input', '#xml-file-name', '#xml-dropzone', 'xml');
  $('#key-mode').addEventListener('change', (e) => $('#custom-fields').classList.toggle('d-none', e.target.value !== 'custom'));
  $('#upload-key-mode').addEventListener('change', (e) => $('#upload-custom-fields').classList.toggle('d-none', e.target.value !== 'custom'));

  $('#decode-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!$('#file-input').files.length) { toast('اختر ملف config.bin أولاً', 'error'); return; }
    const button = event.target.querySelector('button[type=submit]');
    setBusy(button, true); progressShow('decode-progress', true); editorBusy(true); alertBox.classList.add('d-none'); setStep(2);
    try {
      const response = await fetch('/api/decode', { method: 'POST', body: new FormData(event.target) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'تعذر فك الملف');
      metadata = data.metadata;
      silentSet = true;
      renderAllThenHide(() => {
        editor.setValue(data.xml); editor.setCursor({ line: 0, ch: 0 });
        silentSet = false;
      });
      baseline = data.xml; clearSearch(); clearEditMarks();
      $('#editor-status').textContent = `تم الفك — ${metadata.used_key_source || 'بدون تشفير'}`;
      $('#payload-badge').textContent = `Payload ${metadata.payload_type}`; $('#payload-badge').classList.remove('d-none');
      renderMeta(metadata);
      if (editPos) editPos.textContent = 'آخر تعديل: —';
      $('#download-xml').disabled = false; $('#encode-form-submit').disabled = false; syncEditor(); syncCursor();
      setStep(2);
      toast('تم فك الملف بنجاح', 'success');
      goStep(2, false);
    } catch (error) { editorBusy(false); showAlert(error.message); toast(error.message, 'error', 4500); } finally { setBusy(button, false); progressShow('decode-progress', false); }
  });

  function metadataForm() {
    const form = new FormData($('#decode-form'));
    form.set('xml', editor.getValue());
    Object.entries(metadata).forEach(([key, value]) => { if (value !== undefined && value !== null) form.set(key, String(value)); });
    return form;
  }
  async function download(endpoint, filename, form) {
    const response = await fetch(endpoint, { method: 'POST', body: form });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'تعذر إنشاء الملف'); }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
  }
  $('#download-xml').addEventListener('click', async () => {
    try { await download('/api/download-xml', 'config.xml', metadataForm()); baseline = editor.getValue(); clearEditMarks(); syncEditor(); setStep(5); toast('تم تنزيل config.xml', 'success'); }
    catch (e) { showAlert(e.message); toast(e.message, 'error'); }
  });
  /* معاينة 3 سطور قبل التحميل */
  let pendingDownload = null;
  let ispChangeCount = 0;
  const confirmModal = $('#confirm-modal');
  function fillConfirm() {
    const l1 = $('#confirm-line1'), l2 = $('#confirm-line2'), l3 = $('#confirm-line3');
    const hasIsp = selectedSource && selectedIsp && ISP_PRESETS[selectedSource] && ISP_PRESETS[selectedIsp];
    if (l1) l1.textContent = hasIsp
      ? `1️⃣ التحويل: من ${ISP_PRESETS[selectedSource].name} إلى ${ISP_PRESETS[selectedIsp].name}`
      : '1️⃣ تعديل يدوي بدون تحويل تلقائي';
    if (l2) l2.textContent = `2️⃣ التعديلات: ${ispChangeCount} تلقائي + ${editedLines.size} يدوي`;
    if (l3) l3.textContent = '3️⃣ سيتم تشفير وتحميل ملف config.bin المعدّل';
  }
  function openConfirm(action) {
    if (!editor.getValue().trim()) { toast('محرر XML فارغ.', 'error'); return; }
    pendingDownload = action;
    fillConfirm();
    if (confirmModal) confirmModal.classList.remove('d-none');
  }
  function closeConfirm() { if (confirmModal) confirmModal.classList.add('d-none'); pendingDownload = null; }
  const confirmYes = $('#confirm-yes');
  if (confirmYes) confirmYes.addEventListener('click', () => { const a = pendingDownload; closeConfirm(); if (a) a(); });
  const confirmNo = $('#confirm-no');
  if (confirmNo) confirmNo.addEventListener('click', () => { closeConfirm(); goStep(5, false); });
  const confirmClose = $('#confirm-close');
  if (confirmClose) confirmClose.addEventListener('click', closeConfirm);
  if (confirmModal) confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) closeConfirm(); });
  async function doEncodeBin() {
    const button = $('#encode-form-submit'); setBusy(button, true); alertBox.classList.add('d-none');
    try {
      if (!editor.getValue().trim()) throw new Error('محرر XML فارغ.');
      await download('/api/encode', 'config.bin', metadataForm());
      baseline = editor.getValue(); clearEditMarks(); syncEditor(); setStep(6);
      toast('تمت إعادة التشفير وتنزيل config.bin', 'success');
      fillFinish(); goStep(6, false);
    } catch (e) { showAlert(e.message); toast(e.message, 'error'); } finally { setBusy(button, false); }
  }
  $('#encode-form-submit').addEventListener('click', () => openConfirm(doEncodeBin));
  $('#xml-upload-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button[type=submit]');
    setBusy(button, true); progressShow('encode-progress', true); alertBox.classList.add('d-none');
    try {
      await download('/api/encode-upload', 'config.bin', new FormData(event.target));
      toast('تم تشفير XML وتنزيل config.bin', 'success');
      fillFinish(); goStep(6, false);
    } catch (error) { showAlert(error.message); toast(error.message, 'error'); } finally { setBusy(button, false); progressShow('encode-progress', false); }
  });
})();
