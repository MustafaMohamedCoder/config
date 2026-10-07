(() => {
  const $ = (selector) => document.querySelector(selector);
  const alertBox = $('#alert');
  const editor = CodeMirror.fromTextArea($('#xml-editor'), { mode: 'application/xml', lineNumbers: true, lineWrapping: false, theme: 'default', indentUnit: 2, tabSize: 2 });
  let metadata = {};

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
  function syncEditor() { $('#xml-size').textContent = `${new Blob([editor.getValue()]).size.toLocaleString('ar')} بايت`; }
  editor.on('change', syncEditor);

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
      $('#editor-status').textContent = `تم الفك — ${metadata.used_key_source || 'بدون تشفير'}`;
      $('#payload-badge').textContent = `Payload ${metadata.payload_type}`; $('#payload-badge').classList.remove('d-none');
      $('#download-xml').disabled = false; $('#encode-form-submit').disabled = false; syncEditor();
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
  $('#download-xml').addEventListener('click', async () => { try { await download('/api/download-xml', 'config.xml', metadataForm()); showAlert('تم تنزيل ملف XML.', 'success'); } catch (e) { showAlert(e.message); } });
  $('#encode-form-submit').addEventListener('click', async () => {
    const button = $('#encode-form-submit'); setBusy(button, true); alertBox.classList.add('d-none');
    try { await download('/api/encode', 'config.bin', metadataForm()); showAlert('تمت إعادة التشفير وتنزيل config.bin.', 'success'); } catch (e) { showAlert(e.message); } finally { setBusy(button, false); }
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
