(() => {
  const $ = (selector) => document.querySelector(selector);
  const alertBox = $('#alert');

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
    extraKeys: {
      'Ctrl-F': 'findPersistent',
      'Cmd-F': 'findPersistent',
      'Ctrl-G': 'findNext',
      'Shift-Ctrl-G': 'findPrev',
    },
  });
  let metadata = {};
  let baseline = '';
  let lastEditMark = null;

  applyTheme(savedTheme);
  if (themeBtn) themeBtn.addEventListener('click', () => {
    applyTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
  });

  function showAlert(message, kind = 'danger') {
    alertBox.className = `alert alert-${kind}`;
    alertBox.textContent = message;
    alertBox.classList.remove('d-none');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function setBusy(button, busy) {
    button.disabled = busy;
    const spinner = button.querySelector('.spinner-border');
    if (spinner) spinner.classList.toggle('d-none', !busy);
  }

  /* ---------- Edit / cursor indicators ---------- */
  const dirtyBadge = $('#dirty-badge');
  const cursorPos = $('#cursor-pos');
  const editPos = $('#edit-pos');
  function syncEditor() {
    $('#xml-size').textContent = `${new Blob([editor.getValue()]).size.toLocaleString('ar')} بايت`;
    const dirty = editor.getValue() !== baseline;
    if (dirtyBadge) dirtyBadge.classList.toggle('d-none', !dirty);
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
    // مؤشر بصري على السطر المعدّل
    if (lastEditMark) { try { lastEditMark.clear(); } catch (_) {} lastEditMark = null; }
    try {
      const line = change ? change.from.line : editor.getCursor().line;
      lastEditMark = editor.addLineClass(line, 'background', 'edited-line');
      editor.addLineWidget(line, (() => { const s = document.createElement('span'); return s; })(), {});
    } catch (_) {}
  });
  editor.on('cursorActivity', syncCursor);
  syncEditor(); syncCursor();

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
    const cursor = editor.getSearchCursor(q, forward ? editor.getCursor() : { line: 0, ch: 0 }, { caseFold: true });
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
    searchIndex = forward ? 0 : searchMarks.length - 1;
    jumpToHit(searchIndex);
  }
  function jumpToHit(i) {
    if (!searchMarks.length) return;
    searchIndex = (i + searchMarks.length) % searchMarks.length;
    const ranges = searchMarks.map((m) => { try { return m.find(); } catch (_) { return null; } }).filter(Boolean);
    if (!ranges.length) return;
    const r = ranges[searchIndex];
    searchMarks.forEach((m) => { try { m.className = 'cm-search-hit'; } catch (_) {} });
    // إبراز النتيجة الحالية بشكل مختلف
    try {
      const cur = editor.markText(r.from, r.to, { className: 'cm-search-hit-current' });
      searchMarks.push(cur);
    } catch (_) {}
    editor.setSelection(r.from, r.to);
    editor.scrollIntoView({ from: r.from, to: r.to }, 120);
    editor.focus();
    if (searchCount) searchCount.textContent = `${searchIndex + 1} / ${ranges.length}`;
  }
  let searchDebounce = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => runSearch(true), 250);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (!searchMarks.length) runSearch(!e.shiftKey); else jumpToHit(searchIndex + (e.shiftKey ? -1 : 1)); }
    if (e.key === 'Escape') { clearSearch(); searchInput.value = ''; editor.focus(); }
  });
  $('#search-next').addEventListener('click', () => { if (!searchMarks.length) runSearch(true); else jumpToHit(searchIndex + 1); });
  $('#search-prev').addEventListener('click', () => { if (!searchMarks.length) runSearch(false); else jumpToHit(searchIndex - 1); });
  $('#search-clear').addEventListener('click', () => { clearSearch(); searchInput.value = ''; searchInput.focus(); });

  $('#file-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    $('#file-name').textContent = file ? `${file.name} — ${(file.size / 1024).toFixed(1)} KB` : 'لم يتم اختيار ملف';
    $('#dropzone').classList.toggle('has-file', Boolean(file));
  });
  const dropzone = $('#dropzone');
  ['dragenter', 'dragover'].forEach((eventName) => dropzone.addEventListener(eventName, (e) => { e.preventDefault(); dropzone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((eventName) => dropzone.addEventListener(eventName, (e) => { e.preventDefault(); dropzone.classList.remove('dragging'); }));
  dropzone.addEventListener('drop', (e) => { const file = e.dataTransfer.files[0]; if (file) { const input = $('#file-input'); const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; input.dispatchEvent(new Event('change')); } });
  $('#key-mode').addEventListener('change', (e) => $('#custom-fields').classList.toggle('d-none', e.target.value !== 'custom'));
  $('#upload-key-mode').addEventListener('change', (e) => $('#upload-custom-fields').classList.toggle('d-none', e.target.value !== 'custom'));
  $('#xml-file-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    $('#xml-file-name').textContent = file ? `${file.name} — ${(file.size / 1024).toFixed(1)} KB` : 'لم يتم اختيار ملف';
    $('#xml-dropzone').classList.toggle('has-file', Boolean(file));
  });

  $('#decode-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button[type=submit]');
    setBusy(button, true); alertBox.classList.add('d-none');
    try {
      const response = await fetch('/api/decode', { method: 'POST', body: new FormData(event.target) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'تعذر فك الملف');
      metadata = data.metadata;
      editor.setValue(data.xml); editor.setCursor({ line: 0, ch: 0 });
      baseline = data.xml; clearSearch();
      $('#editor-status').textContent = `تم الفك — ${metadata.used_key_source || 'بدون تشفير'}`;
      $('#payload-badge').textContent = `Payload ${metadata.payload_type}`; $('#payload-badge').classList.remove('d-none');
      if (editPos) editPos.textContent = 'آخر تعديل: —';
      $('#download-xml').disabled = false; $('#encode-form-submit').disabled = false; syncEditor(); syncCursor();
      showAlert('تم فك الملف بنجاح. يمكنك تعديل XML الآن.', 'success');
    } catch (error) { showAlert(error.message); } finally { setBusy(button, false); }
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
  $('#download-xml').addEventListener('click', async () => { try { await download('/api/download-xml', 'config.xml', metadataForm()); baseline = editor.getValue(); syncEditor(); showAlert('تم تنزيل ملف XML.', 'success'); } catch (e) { showAlert(e.message); } });
  $('#encode-form-submit').addEventListener('click', async () => {
    const button = $('#encode-form-submit'); setBusy(button, true); alertBox.classList.add('d-none');
    try { await download('/api/encode', 'config.bin', metadataForm()); baseline = editor.getValue(); syncEditor(); showAlert('تمت إعادة التشفير وتنزيل config.bin.', 'success'); } catch (e) { showAlert(e.message); } finally { setBusy(button, false); }
  });
  $('#xml-upload-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button[type=submit]');
    setBusy(button, true); alertBox.classList.add('d-none');
    try {
      await download('/api/encode-upload', 'config.bin', new FormData(event.target));
      showAlert('تم تشفير ملف XML وتنزيل config.bin بنجاح.', 'success');
    } catch (error) { showAlert(error.message); } finally { setBusy(button, false); }
  });
})();
