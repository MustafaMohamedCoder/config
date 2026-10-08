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
  let wrapOn = false;
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
    // السماح بالعمل اليدوي: تفعيل الأزرار عند وجود محتوى حتى بدون فك ملف
    const dl = $('#download-xml');
    const enc = $('#encode-form-submit');
    if (dl) dl.disabled = !hasContent;
    if (enc) enc.disabled = !hasContent;
    if (hasContent) setStep(dirty ? 3 : 3);
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
  $('#btn-beautify').addEventListener('click', () => {
    try {
      const raw = editor.getValue().trim();
      if (!raw) { toast('المحرر فارغ', 'error'); return; }
      let indent = 0;
      const formatted = raw.replace(/>\s*</g, '><').replace(/(<\/?[^>]+>)/g, (m) => {
        let pad = '';
        if (/^<\//.test(m)) indent = Math.max(0, indent - 1);
        pad = '  '.repeat(indent);
        if (/^<[^!?/][^>]*[^/]>$/.test(m)) indent += 1;
        return '\n' + pad + m;
      }).trim();
      const cur = editor.getCursor();
      editor.setValue(formatted);
      editor.setCursor(cur);
      toast('تم تنسيق XML', 'success');
    } catch (e) { toast('تعذر التنسيق — تحقق من XML', 'error'); }
  });
  $('#btn-wrap').addEventListener('click', (e) => {
    wrapOn = !wrapOn;
    editor.setOption('lineWrapping', wrapOn);
    e.currentTarget.classList.toggle('on', wrapOn);
  });
  $('#btn-full').addEventListener('click', () => {
    const panel = $('#editor-panel');
    const on = panel.classList.toggle('fullscreen');
    $('#btn-full').textContent = on ? '✕ خروج' : '⛶ ملء';
    editor.refresh();
    editor.focus();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#editor-panel').classList.remove('fullscreen'); $('#btn-full').textContent = '⛶ ملء'; } });
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

  /* ---------- File inputs ---------- */
  function bindFile(inputSel, nameSel, zoneSel) {
    const input = $(inputSel);
    if (!input) return;
    input.addEventListener('change', (event) => {
      const file = event.target.files[0];
      $(nameSel).textContent = file ? `${file.name} — ${(file.size / 1024).toFixed(1)} KB` : 'لم يتم اختيار ملف';
      $(zoneSel).classList.toggle('has-file', Boolean(file));
      if (file) { setStep(1); }
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
  bindFile('#file-input', '#file-name', '#dropzone');
  bindFile('#xml-file-input', '#xml-file-name', '#xml-dropzone');
  $('#key-mode').addEventListener('change', (e) => $('#custom-fields').classList.toggle('d-none', e.target.value !== 'custom'));
  $('#upload-key-mode').addEventListener('change', (e) => $('#upload-custom-fields').classList.toggle('d-none', e.target.value !== 'custom'));

  $('#decode-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!$('#file-input').files.length) { toast('اختر ملف config.bin أولاً', 'error'); return; }
    const button = event.target.querySelector('button[type=submit]');
    setBusy(button, true); alertBox.classList.add('d-none'); setStep(2);
    try {
      const response = await fetch('/api/decode', { method: 'POST', body: new FormData(event.target) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'تعذر فك الملف');
      metadata = data.metadata;
      editor.setValue(data.xml); editor.setCursor({ line: 0, ch: 0 });
      baseline = data.xml; clearSearch(); clearEditMarks();
      $('#editor-status').textContent = `تم الفك — ${metadata.used_key_source || 'بدون تشفير'}`;
      $('#payload-badge').textContent = `Payload ${metadata.payload_type}`; $('#payload-badge').classList.remove('d-none');
      renderMeta(metadata);
      if (editPos) editPos.textContent = 'آخر تعديل: —';
      $('#download-xml').disabled = false; $('#encode-form-submit').disabled = false; syncEditor(); syncCursor();
      setStep(3);
      toast('تم فك الملف بنجاح', 'success');
      document.getElementById('editor-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) { showAlert(error.message); toast(error.message, 'error', 4500); } finally { setBusy(button, false); }
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
    try { await download('/api/download-xml', 'config.xml', metadataForm()); baseline = editor.getValue(); clearEditMarks(); syncEditor(); setStep(4); toast('تم تنزيل config.xml', 'success'); }
    catch (e) { showAlert(e.message); toast(e.message, 'error'); }
  });
  $('#encode-form-submit').addEventListener('click', async () => {
    const button = $('#encode-form-submit'); setBusy(button, true); alertBox.classList.add('d-none');
    try {
      if (!editor.getValue().trim()) throw new Error('محرر XML فارغ.');
      await download('/api/encode', 'config.bin', metadataForm());
      baseline = editor.getValue(); clearEditMarks(); syncEditor(); setStep(4);
      toast('تمت إعادة التشفير وتنزيل config.bin', 'success');
    } catch (e) { showAlert(e.message); toast(e.message, 'error'); } finally { setBusy(button, false); }
  });
  $('#xml-upload-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button[type=submit]');
    setBusy(button, true); alertBox.classList.add('d-none');
    try {
      await download('/api/encode-upload', 'config.bin', new FormData(event.target));
      toast('تم تشفير XML وتنزيل config.bin', 'success');
    } catch (error) { showAlert(error.message); toast(error.message, 'error'); } finally { setBusy(button, false); }
  });
})();
