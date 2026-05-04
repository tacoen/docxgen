// ═══════════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════════
let currentModel   = '';
let currentProject = '';
let currentSchema  = {};   // raw fields.json content
let fieldDefs      = [];   // flattened: [{group,key,def}]
let templates      = [];
let outputs        = JSON.parse(localStorage.getItem('docgen_outputs') || '[]');

const STORAGE_KEY = () => 'docgen_draft_' + currentModel;

// ═══════════════════════════════════════════════════════════════════════════════
// INDONESIAN HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
const BULAN = ['','Januari','Februari','Maret','April','Mei','Juni',
               'Juli','Agustus','September','Oktober','November','Desember'];
const HARI  = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

function parseDMY(s) {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [,d,mo,y] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo-1, d);
  return dt.getMonth() === mo-1 ? dt : null;
}

function toTanggalPanjang(s) {
  const dt = parseDMY(s);
  return dt ? `${dt.getDate()} ${BULAN[dt.getMonth()+1]} ${dt.getFullYear()}` : '';
}

function toNamaHari(s) {
  const dt = parseDMY(s);
  return dt ? HARI[dt.getDay()] : '';
}

function maskDate(raw) {
  let v = raw.replace(/\D/g,'').slice(0,8);
  if (v.length > 4) v = v.slice(0,2)+'/'+v.slice(2,4)+'/'+v.slice(4);
  else if (v.length > 2) v = v.slice(0,2)+'/'+v.slice(2);
  return v;
}

// ── Terbilang ────────────────────────────────────────────────────────────────
const SAT = ['','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan',
             'sepuluh','sebelas','dua belas','tiga belas','empat belas','lima belas',
             'enam belas','tujuh belas','delapan belas','sembilan belas'];
const PUL = ['','','dua puluh','tiga puluh','empat puluh','lima puluh',
             'enam puluh','tujuh puluh','delapan puluh','sembilan puluh'];

function tbRatusan(n) {
  if (!n) return '';
  if (n < 20) return SAT[n];
  if (n < 100) { const s=SAT[n%10]; return s ? PUL[Math.floor(n/10)]+' '+s : PUL[Math.floor(n/10)]; }
  const r=Math.floor(n/100), rest=n%100;
  const p = r===1 ? 'seratus' : SAT[r]+' ratus';
  return rest ? p+' '+tbRatusan(rest) : p;
}

function toTerbilang(str, { prefix = '', suffix = '' } = {}) {
  const n = parseInt(String(str).replace(/\D/g,''), 10);
  if (!n) return '';
  const parts = [];
  const mil = Math.floor(n/1e9), jut = Math.floor((n%1e9)/1e6),
        rib = Math.floor((n%1e6)/1e3), sis = n%1e3;
  if (mil) parts.push(mil===1?'satu miliar':tbRatusan(mil)+' miliar');
  if (jut) parts.push(jut===1?'satu juta':tbRatusan(jut)+' juta');
  if (rib) parts.push(rib===1?'seribu':tbRatusan(rib)+' ribu');
  if (sis) parts.push(tbRatusan(sis));
  return prefix + parts.join(' ') + suffix;
}

const STOP_WORDS = new Set([
  'dan','di','ke','dari','atau','yang','untuk','dengan','pada','dalam','oleh',
  'the','of','and','or','to','in','at','by','for','a','an'
]);

function toAbbr(str) {
  if (!str) return '';
  return str.trim().split(/\s+/)
    .filter(w => !STOP_WORDS.has(w.toLowerCase()))
    .map(w => w[0] || '')
    .join('')
    .toUpperCase();
}

/** dd/mm/yyyy + N days → dd/mm/yyyy */
function toCalcDate(startDmy, days) {
  if (!startDmy || !days) return '';
  const p = startDmy.split('/');
  if (p.length !== 3) return '';
  const d = new Date(+p[2], +p[1] - 1, +p[0]);
  if (isNaN(d)) return '';
  d.setDate(d.getDate() + parseInt(days, 10));
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA → FIELD DEFS
// Parse fields.json into flat fieldDefs array
// ═══════════════════════════════════════════════════════════════════════════════
function parseSchema(schema) {
  const defs = [];
  for (const [group, fields] of Object.entries(schema)) {
    for (const [key, def] of Object.entries(fields)) {
      if (typeof def === 'string') {
        // Simple: value is the default
        defs.push({ group, key, default: def, note: '', func: '', source: '', prefix: '', suffix: '', row: '' });
      } else {
        // Object: has func/note/source/default
        // source can be a string or array (for calcDate)
        defs.push({
          group,
          key,
          default: def.default ?? '',
          note:    def.note    ?? '',
          func:    (def.func ?? '').toLowerCase(),
          source:  def.source  ?? '',   // string or array
          prefix:  def.prefix  ?? '',
          suffix:  def.suffix  ?? '',
          row:     def.row     ?? '',
        });
      }
    }
  }
  return defs;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD FORM from fieldDefs
// ═══════════════════════════════════════════════════════════════════════════════
function buildForm() {
  const container = document.getElementById('form-fields');
  if (!fieldDefs.length) {
    container.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">No fields defined in fields.json</div></div>';
    return;
  }

  // Group fields
  const groups = {};
  fieldDefs.forEach(f => {
    if (!groups[f.group]) groups[f.group] = [];
    groups[f.group].push(f);
  });

  const groupIcons = {
    'Info': '📋', 'Instansi': '🏛️', 'Rekanan': '🤝',
    'Surat Perintah': '📜', 'Berita Acara Pemeriksaan': '📑',
    'Berita Acara Pembayaran': '💳', 'Berita Acara Serah Terima': '🤲',
    'Dokumen Penagihan': '🧾',
  };

  let html = '';
  for (const [group, fields] of Object.entries(groups)) {
    const icon = groupIcons[group] || '📌';
    html += `<div class="card"><div class="card-title">${icon} ${group}</div>`;

    // Build rows — explicit row key takes priority, then auto-pairing for auto fields
    const rows = [];
    const seenRows = {};
    let i = 0;
    while (i < fields.length) {
      const f = fields[i];

      if (f.row) {
        // Explicit row group — collect all fields with same row key in order
        if (!seenRows[f.row]) {
          const rowFields = fields.filter(x => x.row === f.row);
          rows.push(rowFields);
          rowFields.forEach(x => { seenRows[x.row] = true; });
        }
        // Already added as part of its row group — skip
        i++;
        continue;
      }

      const isAuto = f.func === 'autolong' || f.func === 'terbilang' || f.func === 'abbr' || f.func === 'calcdate';
      if (isAuto) {
        // Try to pair with previous non-auto field
        if (rows.length && rows[rows.length-1].length === 1 && !rows[rows.length-1][0].isAuto) {
          rows[rows.length-1].push(f);
        } else {
          rows.push([f]);
        }
      } else {
        rows.push([f]);
      }
      i++;
    }

    rows.forEach(row => {
      const count = row.length;
      const cls   = count === 1 ? 'full' : count === 3 ? 'triple' : '';
      html += `<div class="form-grid ${cls}">`;
      row.forEach(f => { html += renderField(f); });
      html += `</div>`;
    });

    html += `</div>`;
  }

  container.innerHTML = html;
}

function renderField(f) {
  const isAutoReadonly = f.func === 'autolong' || f.func === 'terbilang';
  const isAuto         = isAutoReadonly || f.func === 'abbr' || f.func === 'calcdate';
  const placeholder    = f.note || f.key;
  const badge = f.func ? `<span class="func-badge ${isAuto?'auto':''}">${f.func}</span>` : '';
  const hintId = `hint-${f.key}`;

  let inputAttrs = `type="text" id="f-${f.key}" placeholder="${placeholder}"`;

  if (f.func === 'date') {
    inputAttrs += ` oninput="onDateInput(this,'${f.key}')" maxlength="10"`;
  } else if (f.func === 'calcdate') {
    // editable, date-masked, fires same downstream chain as date
    inputAttrs += ` oninput="onDateInput(this,'${f.key}')" maxlength="10"`;
  } else if (f.func === 'hari') {
    inputAttrs += ` oninput="onHariInput(this,'${f.key}')" maxlength="10"`;
  } else if (f.func === 'nilai') {
    inputAttrs += ` oninput="onNilaiInput(this)"`;
  } else if (isAutoReadonly) {
    inputAttrs += ` readonly class="auto-field"`;
  }

  // last-date link for both date and calcDate fields
  const lastDateLink = (f.func === 'date' || f.func === 'calcdate')
    ? `<a class="last-date-link" id="lastdate-${f.key}" href="#" onclick="useLastDate('${f.key}');return false;" style="display:none">← use last date</a>`
    : '';

  return `
    <div class="field">
      <label>${f.key} ${badge}<span class="field-hint" id="${hintId}"></span>${lastDateLink}</label>
      <input ${inputAttrs} />
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INPUT HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════
function onDateInput(input, key) {
  input.value = maskDate(input.value);
  const long = toTanggalPanjang(input.value);
  const hint = document.getElementById('hint-' + key);
  if (hint) hint.textContent = long;
  // Update all autoLong fields that source this key
  fieldDefs.filter(f => f.func === 'autolong' && f.source === key).forEach(f => {
    const el = document.getElementById('f-' + f.key);
    if (el) el.value = long;
  });
  // Update all hari fields that source this key
  fieldDefs.filter(f => f.func === 'hari' && f.source === key).forEach(f => {
    const el = document.getElementById('f-' + f.key);
    if (el) { el.value = input.value; onHariInput(el, f.key); }
  });
  // Update calcDate fields that use this key as date source
  triggerCalcDate(key);
  // Save last valid date and refresh all date links
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(input.value)) {
    setLastDate(input.value);
  }
  autoSave();
}

/** Recompute all calcDate fields whose source[0] or source[1] is `changedKey` */
function triggerCalcDate(changedKey) {
  fieldDefs.filter(f => f.func === 'calcdate' && Array.isArray(f.source)).forEach(f => {
    if (!f.source.includes(changedKey)) return;
    const dateEl = document.getElementById('f-' + f.source[0]);
    const daysEl = document.getElementById('f-' + f.source[1]);
    if (!dateEl || !daysEl) return;
    const result = toCalcDate(dateEl.value, daysEl.value.replace(/\D/g,''));
    const el = document.getElementById('f-' + f.key);
    if (el) {
      el.value = result;
      // fire downstream chains (autoLong, hari) from the calcDate field
      if (result) onDateInput(el, f.key);
    }
  });
}

const LAST_DATE_KEY = () => 'docgen_lastdate_' + currentModel;

function getLastDate() {
  return localStorage.getItem(LAST_DATE_KEY()) || '';
}

function setLastDate(val) {
  localStorage.setItem(LAST_DATE_KEY(), val);
  refreshLastDateLinks(val);
}

function refreshLastDateLinks(val) {
  document.querySelectorAll('.last-date-link').forEach(a => {
    if (val) {
      a.textContent = `← ${val}`;
      a.style.display = 'inline';
    } else {
      a.style.display = 'none';
    }
  });
}

function useLastDate(key) {
  const val = getLastDate();
  if (!val) return;
  const el = document.getElementById('f-' + key);
  if (!el) return;
  el.value = val;
  onDateInput(el, key);
}

function onHariInput(input, key) {
  input.value = maskDate(input.value);
  const hari = toNamaHari(input.value);
  input.dataset.resolved = hari; // store resolved day name for collectForm
  const hint = document.getElementById('hint-' + key);
  if (hint) hint.textContent = hari;
  autoSave();
}

function onNilaiInput(input) {
  const raw = input.value.replace(/\D/g,'');
  if (raw) input.value = parseInt(raw,10).toLocaleString('id-ID');
  // Update all terbilang fields that source this field
  const key = input.id.replace('f-','');
  fieldDefs.filter(f => f.func === 'terbilang' && f.source === key).forEach(f => {
    const spelled = toTerbilang(raw, { prefix: f.prefix, suffix: f.suffix });
    const el = document.getElementById('f-' + f.key);
    if (el && !el.dataset.manual) el.value = spelled;
    const hint = document.getElementById('hint-' + f.key);
    if (hint) hint.textContent = spelled ? '→ auto' : '';
  });
  autoSave();
}


// ═══════════════════════════════════════════════════════════════════════════════
function collectForm() {
  const data = { _project: currentProject, _model: currentModel };
  fieldDefs.forEach(f => {
    const el = document.getElementById('f-' + f.key);
    if (!el) return;
    // hari fields: send resolved day name to generate.php,
    // but also save the raw dd/mm/yyyy so drafts can be restored
    if (f.func === 'hari') {
      data[f.key]          = el.dataset.resolved || toNamaHari(el.value) || el.value;
      data[f.key + '_raw'] = el.value; // raw date for draft restore
    } else {
      data[f.key] = el.value;
    }
  });
  return data;
}

function applyFieldData(data) {
  fieldDefs.forEach(f => {
    const el = document.getElementById('f-' + f.key);
    if (!el) return;
    // hari fields: restore the raw dd/mm/yyyy into the input, then re-fire
    if (f.func === 'hari') {
      const raw = data[f.key + '_raw'] ?? data[f.key] ?? '';
      el.value = raw;
    } else {
      const v = data[f.key];
      if (v !== undefined) el.value = v;
    }
    // Re-fire handlers
    if (f.func === 'date')  onDateInput(el, f.key);
    if (f.func === 'hari')  onHariInput(el, f.key);
    if (f.func === 'nilai') onNilaiInput(el);
  });
  // Resolve abbr fields from restored source values
  fieldDefs.filter(f => f.func === 'abbr' && f.source).forEach(f => {
    const srcEl = document.getElementById('f-' + f.source);
    const el    = document.getElementById('f-' + f.key);
    if (srcEl && el) el.value = toAbbr(srcEl.value);
  });
  // Resolve calcDate fields
  fieldDefs.filter(f => f.func === 'calcdate' && Array.isArray(f.source)).forEach(f => {
    triggerCalcDate(f.source[0]);
  });
  refreshLastDateLinks(getLastDate());
}

function applyDefaults() {
  fieldDefs.forEach(f => {
    const el = document.getElementById('f-' + f.key);
    if (!el) return;
    el.value = f.default || '';
    if (f.func === 'date')  onDateInput(el, f.key);
    if (f.func === 'hari')  onHariInput(el, f.key);
    if (f.func === 'nilai') onNilaiInput(el);
  });
  // Resolve abbr fields from their source defaults
  fieldDefs.filter(f => f.func === 'abbr' && f.source).forEach(f => {
    const srcEl = document.getElementById('f-' + f.source);
    const el    = document.getElementById('f-' + f.key);
    if (srcEl && el) el.value = toAbbr(srcEl.value);
  });
  // Resolve calcDate fields
  fieldDefs.filter(f => f.func === 'calcdate' && Array.isArray(f.source)).forEach(f => {
    triggerCalcDate(f.source[0]);
  });
  refreshLastDateLinks(getLastDate());
}

function clearForm() {
  if (!confirm('Clear all form fields? Unsaved data will be lost.')) return;
  applyDefaults();
  localStorage.removeItem(STORAGE_KEY());
  toast('Form cleared', '');
}

function saveDraft() {
  localStorage.setItem(STORAGE_KEY(), JSON.stringify(collectForm()));
  toast('Draft saved', 'success');
}

function autoSave() {
  clearTimeout(window._saveTimer);
  window._saveTimer = setTimeout(() => {
    if (currentModel) localStorage.setItem(STORAGE_KEY(), JSON.stringify(collectForm()));
  }, 600);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODEL LOADING
// ═══════════════════════════════════════════════════════════════════════════════
async function onModelChange(model) {
  if (!model) return;
  currentModel = model;
  localStorage.setItem('docgen_last_model', model);
  document.getElementById('path-model-preview').textContent = model;
  document.getElementById('upload-model-name').textContent = model;
  document.getElementById('upload-model-path').textContent = model;

  // Fetch fields.json
  try {
    const resp = await fetch('api/fields.php?model=' + encodeURIComponent(model));
    if (!resp.ok) throw new Error('fields.json not found for model: ' + model);
    currentSchema = await resp.json();
    fieldDefs     = parseSchema(currentSchema);
    buildForm();

    // Always apply defaults first, then overlay draft on top.
    // This ensures new fields added to fields.json get their defaults
    // even when an older draft exists that predates those fields.
    applyDefaults();
    const draft = localStorage.getItem(STORAGE_KEY());
    if (draft) applyFieldData(JSON.parse(draft));

    // Update keyword list
    renderKeywords();
    renderKeywordsPanel();

    // Load templates for this model
    await syncTemplates();

    // Check if a values.json snapshot exists for the current project+model
    await checkRestoreSnapshot();

    toast('Loaded: ' + model, 'success');
  } catch(e) {
    toast(e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESTORE FROM SNAPSHOT
// ═══════════════════════════════════════════════════════════════════════════════
let _snapshotData = null;

async function checkRestoreSnapshot() {
  const banner = document.getElementById('restore-banner');
  banner.style.display = 'none';
  _snapshotData = null;

  if (!currentProject || !currentModel) return;

  // Only offer restore if there's no existing draft (draft takes priority)
  if (localStorage.getItem(STORAGE_KEY())) return;

  try {
    const path = 'output/' + currentProject + '/' + currentModel + '/values.json';
    const resp = await fetch('api/download.php?path=' + encodeURIComponent(path));
    if (!resp.ok) return; // no snapshot exists
    _snapshotData = await resp.json();

    const meta = _snapshotData._meta || {};
    const date = meta.generated_at
      ? new Date(meta.generated_at).toLocaleString('id-ID')
      : 'unknown date';

    document.getElementById('restore-banner-text').textContent =
      `Last session: ${meta.template || '?'} — ${date}`;
    banner.style.display = 'flex';
  } catch(e) {
    // No snapshot or server error — stay hidden
  }
}

function restoreFromSnapshot() {
  if (!_snapshotData) return;
  applyFieldData(_snapshotData);
  document.getElementById('restore-banner').style.display = 'none';
  toast('Fields restored from last session', 'success');
}

function dismissRestore() {
  document.getElementById('restore-banner').style.display = 'none';
  _snapshotData = null;
}


function renderKeywords() {
  const el = document.getElementById('keyword-list');
  if (!fieldDefs.length) { el.textContent = 'No fields.'; return; }
  el.innerHTML = fieldDefs.map(f => {
    const badge = f.func ? ` <span class="func-badge ${f.func==='autolong'||f.func==='terbilang'?'auto':''}">${f.func}</span>` : '';
    const src   = f.source ? ` ← ${f.source}` : '';
    return `<div>\${${f.key}}${badge}<span style="color:var(--ink3)">${src}</span></div>`;
  }).join('') + `
    <div style="margin-top:8px;color:var(--ink3)">\${hariIni} \${bulanIni} \${tahunIni} — always available</div>`;
}

async function scanTemplateKeywords(templateName) {
  const el = document.getElementById('keyword-scan-result');
  if (!el) return;
  if (!templateName) { el.innerHTML = ''; return; }

  el.innerHTML = '<span style="color:var(--ink3)">Scanning…</span>';
  try {
    const resp = await fetch(
      'api/template_keywords.php?model=' + encodeURIComponent(currentModel) +
      '&template=' + encodeURIComponent(templateName)
    );
    const r = await resp.json();
    if (r.error) throw new Error(r.error);

    let html = '';

    if (r.missing.length) {
      html += `<div style="margin-bottom:8px">
        <div style="font-size:10px;font-weight:600;color:var(--error);margin-bottom:4px">⚠ In template, NOT in fields.json — will be left blank:</div>
        ${r.missing.map(k => `<span class="chip error" style="margin:2px 2px 0 0">\${${k}}</span>`).join('')}
      </div>`;
    }
    if (r.extra.length) {
      html += `<div style="margin-bottom:8px">
        <div style="font-size:10px;font-weight:600;color:var(--ink3);margin-bottom:4px">ℹ In fields.json, NOT in template — unused:</div>
        ${r.extra.map(k => `<span class="chip info" style="margin:2px 2px 0 0">\${${k}}</span>`).join('')}
      </div>`;
    }
    if (!r.missing.length && !r.extra.length) {
      html = '<span class="chip success">✓ All keywords match</span>';
    }

    html += `<div style="margin-top:8px;font-size:10px;color:var(--ink3)">${r.keywords.length} keyword(s) found in template</div>`;
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = `<span class="chip error">✗ ${e.message}</span>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════
window.onload = async () => {
  // Restore project
  const savedProject = localStorage.getItem('docgen_project') || '';
  if (savedProject) {
    currentProject = savedProject;
    document.getElementById('project-name').value = savedProject;
    document.getElementById('path-preview').textContent = savedProject;
    document.getElementById('sidebar-project').textContent = savedProject;
  }

  // Load model list
  await loadModelList();

  // Restore last model
  const lastModel = localStorage.getItem('docgen_last_model') || '';
  if (lastModel) {
    document.getElementById('model-select').value = lastModel;
    await onModelChange(lastModel);
  }

  renderOutputs();
};

async function loadModelList() {
  const sel = document.getElementById('model-select');
  try {
    const resp = await fetch('api/list.php?type=models');
    if (!resp.ok) throw new Error('Server error');
    const r = await resp.json();
    const models = r.models || [];
    if (!models.length) {
      sel.innerHTML = '<option value="">— no models found —</option>';
      toast('No models found. Create one with ＋ New Model.', 'info');
      return;
    }
    sel.innerHTML = '<option value="">— select model —</option>' +
      models.map(m =>
        `<option value="${m.name}">${m.name} (${m.templates} templates)</option>`
      ).join('');
  } catch(e) {
    sel.innerHTML = '<option value="">⚠ server offline</option>';
    sel.style.color = 'var(--error)';
    toast('Server not reachable. Run: php -S localhost:8000 router.php', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT
// ═══════════════════════════════════════════════════════════════════════════════
function onProjectInput(val) {
  currentProject = val.trim().replace(/\s+/g,'-').toLowerCase();
  document.getElementById('project-name').value = currentProject;
  document.getElementById('path-preview').textContent = currentProject || '...';
  document.getElementById('sidebar-project').textContent = currentProject || '— none —';
  localStorage.setItem('docgen_project', currentProject);
  if (currentModel) checkRestoreSnapshot();
}

async function showModal() {
  document.getElementById('modal-project-input').value = currentProject;
  document.getElementById('modal-bg').classList.add('open');

  // Fetch existing projects from server
  const field  = document.getElementById('existing-projects-field');
  const sel    = document.getElementById('existing-project-select');
  try {
    const resp = await fetch('api/list.php?type=projects');
    const r    = await resp.json();
    const projects = r.projects || [];
    if (projects.length) {
      sel.innerHTML = '<option value="">— pick an existing project —</option>' +
        projects.map(p => `<option value="${p.name}"${p.name === currentProject ? ' selected' : ''}>${p.name}</option>`).join('');
      field.style.display = '';
    } else {
      field.style.display = 'none';
    }
  } catch(e) {
    field.style.display = 'none';
  }

  setTimeout(() => document.getElementById('modal-project-input').focus(), 80);
}

function onExistingProjectSelect(val) {
  if (val) document.getElementById('modal-project-input').value = val;
}

function closeModal() { document.getElementById('modal-bg').classList.remove('open'); }
function applyProject() {
  const val = document.getElementById('modal-project-input').value.trim().replace(/\s+/g,'-').toLowerCase();
  if (!val) return toast('Enter a project name', 'error');
  onProjectInput(val);
  closeModal();
  toast('Project: ' + val, 'success');
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLEAR CACHE
// ═══════════════════════════════════════════════════════════════════════════════
function showClearCacheModal() {
  // Update model badge labels
  const m = currentModel || '—';
  document.getElementById('cc-draft-model').textContent   = m;
  document.getElementById('cc-tpl-model').textContent     = m;
  // Reset checkboxes to sensible defaults
  document.getElementById('cc-draft').checked     = true;
  document.getElementById('cc-templates').checked = true;
  document.getElementById('cc-project').checked   = false;
  document.getElementById('cc-outputs').checked   = false;
  document.getElementById('clear-cache-modal-bg').classList.add('open');
}

function closeClearCacheModal() {
  document.getElementById('clear-cache-modal-bg').classList.remove('open');
}

function executeClearCache() {
  const cleared = [];

  if (document.getElementById('cc-draft').checked && currentModel) {
    localStorage.removeItem(STORAGE_KEY());
    localStorage.removeItem(LAST_DATE_KEY());
    cleared.push('draft');
  }
  if (document.getElementById('cc-templates').checked && currentModel) {
    localStorage.removeItem(TEMPLATE_KEY());
    cleared.push('template selection');
  }
  if (document.getElementById('cc-project').checked) {
    localStorage.removeItem('docgen_project');
    localStorage.removeItem('docgen_last_model');
    cleared.push('project & model');
  }
  if (document.getElementById('cc-outputs').checked) {
    localStorage.removeItem('docgen_outputs');
    outputs = [];
    cleared.push('output history');
  }

  closeClearCacheModal();

  if (!cleared.length) return toast('Nothing selected', '');

  // Re-apply defaults so form reflects cleared draft immediately
  if (cleared.includes('draft')) applyDefaults();
  if (cleared.includes('template selection')) refreshTemplateSelect();

  toast('Cleared: ' + cleared.join(', '), 'success');
}

document.getElementById('clear-cache-modal-bg').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeClearCacheModal();
});


// ═══════════════════════════════════════════════════════════════════════════════
function showNewModelModal() {
  // Populate copy-from dropdown with existing models
  const sel = document.getElementById('new-model-copy-from');
  const existing = [...document.getElementById('model-select').options]
    .filter(o => o.value)
    .map(o => `<option value="${o.value}">${o.value}</option>`)
    .join('');
  sel.innerHTML = '<option value="">— start blank —</option>' + existing;
  document.getElementById('new-model-name').value = '';
  document.getElementById('new-model-modal-bg').classList.add('open');
  setTimeout(() => document.getElementById('new-model-name').focus(), 80);
}

function closeNewModelModal() {
  document.getElementById('new-model-modal-bg').classList.remove('open');
}

async function createModel() {
  const name     = document.getElementById('new-model-name').value.trim().replace(/\s+/g,'-').toLowerCase();
  const copyFrom = document.getElementById('new-model-copy-from').value;
  if (!name) return toast('Enter a model name', 'error');

  try {
    const resp = await fetch('api/model_create.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, copy_from: copyFrom }),
    });
    const r = await resp.json();
    if (!resp.ok || r.error) throw new Error(r.error);

    closeNewModelModal();
    await loadModelList();
    document.getElementById('model-select').value = name;
    await onModelChange(name);
    toast('Model created: ' + name, 'success');
  } catch(e) {
    toast(e.message, 'error');
  }
}

// Close new model modal on backdrop click
document.getElementById('new-model-modal-bg').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeNewModelModal();
});
document.getElementById('new-model-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') createModel();
});


// ═══════════════════════════════════════════════════════════════════════════════
let _lastOutputsRefresh = 0;
let _outputsRefreshedByGenerate = false;

function switchTab(name, navEl) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
  if (navEl) navEl.classList.add('active');
  const tb = document.getElementById('tab-' + name);
  if (tb) tb.classList.add('active');
  const titles = { form: 'Fill Form', templates: 'Templates', outputs: 'Output Files', keywords: 'Keywords' };
  document.getElementById('topbar-title').textContent = titles[name] || name;
  if (name === 'outputs') {
    if (_outputsRefreshedByGenerate && Date.now() - _lastOutputsRefresh < 5000) {
      _outputsRefreshedByGenerate = false;
    } else {
      renderOutputs();
    }
  }
  if (name === 'templates') syncTemplates();
  if (name === 'keywords')  renderKeywordsPanel();
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════
async function syncTemplates() {
  if (!currentModel) return;
  try {
    const resp = await fetch('api/list.php?type=templates&model=' + encodeURIComponent(currentModel));
    const r    = await resp.json();
    templates  = r.templates || [];
  } catch(e) { templates = []; }
  renderTemplates();
  refreshTemplateSelect();
  // Scan the first checked template
  const firstChecked = getCheckedTemplates()[0];
  if (firstChecked) scanTemplateKeywords(firstChecked);
}

function renderTemplates() {
  const list = document.getElementById('template-list');
  if (!templates.length) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">No templates in models/' + (currentModel||'—') + '/</div></div>';
    return;
  }
  list.innerHTML = '<div class="file-list">' + templates.map(t => `
    <div class="file-item">
      <span>📄</span>
      <span class="file-name">${t.name}</span>
      <span class="file-meta">${t.date}</span>
      <div class="file-actions">
        <button onclick="selectTemplate('${t.name}')">Use</button>
        <button class="danger" onclick="deleteTemplate('${t.name}')">🗑</button>
      </div>
    </div>`).join('') + '</div>';
}

const TEMPLATE_KEY = () => 'docgen_template_' + currentModel;

function getCheckedTemplates() {
  return [...document.querySelectorAll('.tpl-check-item input:checked')].map(cb => cb.value);
}

function refreshTemplateSelect() {
  const cl      = document.getElementById('template-checklist');
  const badge   = document.getElementById('tpl-count-badge');
  const saved   = JSON.parse(localStorage.getItem(TEMPLATE_KEY()) || '[]');

  // Also keep hidden select in sync (used by TEMPLATE_KEY save on change)
  const sel = document.getElementById('template-select');
  sel.innerHTML = '<option value="">—</option>' +
    templates.map(t => `<option value="${t.name}">${t.name}</option>`).join('');

  if (!templates.length) {
    cl.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:12px;font-family:\'DM Mono\',monospace">No templates uploaded</div>';
    badge.style.display = 'none';
    return;
  }

  cl.innerHTML = templates.map(t => {
    const checked = saved.includes(t.name) ? 'checked' : '';
    return `<div class="tpl-check-item">
      <input type="checkbox" id="tpl-${t.name}" value="${t.name}" ${checked} onchange="onTemplateCheck()">
      <label for="tpl-${t.name}" title="${t.name}">${t.name}</label>
    </div>`;
  }).join('');

  onTemplateCheck();
}

function setGenerateBtnLabel(label, disabled) {
  document.querySelectorAll('.btn-generate').forEach(btn => {
    btn.textContent = label;
    btn.disabled    = disabled;
  });
}

function onTemplateCheck() {
  const checked = getCheckedTemplates();
  localStorage.setItem(TEMPLATE_KEY(), JSON.stringify(checked));
  const badge = document.getElementById('tpl-count-badge');
  if (checked.length === 0) {
    badge.style.display = 'none';
    setGenerateBtnLabel('⚡ Generate .docx', false);
  } else {
    badge.style.display = 'inline';
    badge.textContent   = checked.length + ' selected';
    setGenerateBtnLabel(
      checked.length > 1 ? `⚡ Generate ${checked.length} docs` : '⚡ Generate .docx',
      false
    );
  }
}

function selectTemplate(name) {
  // Called from Templates panel "Use" button — check that template in the checklist
  const cb = document.getElementById('tpl-' + name);
  if (cb) { cb.checked = true; onTemplateCheck(); }
  switchTab('form');
  toast('Template selected: ' + name, 'success');
}

async function handleUpload(files) {
  if (!currentModel) return toast('Select a model first', 'error');
  const zone = document.getElementById('upload-zone');
  zone.classList.add('uploading');
  const origText = zone.querySelector('.upload-text').innerHTML;
  zone.querySelector('.upload-text').innerHTML = '<strong>Uploading…</strong>';

  for (const file of Array.from(files)) {
    if (!file.name.endsWith('.docx')) { toast(file.name + ': not a .docx', 'error'); continue; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('model', currentModel);
    try {
      const resp = await fetch('api/upload.php', { method: 'POST', body: fd });
      const r    = await resp.json();
      if (r.success) toast('Uploaded: ' + r.filename, 'success');
      else toast(r.error || 'Upload failed', 'error');
    } catch(e) { toast('Upload failed (server not running?)', 'error'); }
  }

  zone.classList.remove('uploading');
  zone.querySelector('.upload-text').innerHTML = origText;
  await syncTemplates();
}

function dragOver(e)  { e.preventDefault(); document.getElementById('upload-zone').classList.add('drag-over'); }
function dragLeave()  { document.getElementById('upload-zone').classList.remove('drag-over'); }
function dropFile(e)  { e.preventDefault(); document.getElementById('upload-zone').classList.remove('drag-over'); handleUpload(e.dataTransfer.files); }

// ═══════════════════════════════════════════════════════════════════════════════
// GENERATE
// ═══════════════════════════════════════════════════════════════════════════════
async function generateDoc() {
  if (!currentProject) return toast('Set a project name first', 'error');
  if (!currentModel)   return toast('Select a model first', 'error');

  const tpls = getCheckedTemplates();
  if (!tpls.length) return toast('Select at least one template', 'error');

  const fields = collectForm();
  saveDraft();

  const pb  = document.getElementById('progress-bar');
  const pf  = document.getElementById('progress-fill');
  const st  = document.getElementById('gen-status');

  pb.style.display = 'block';
  setGenerateBtnLabel('⏳ Generating…', true);
  const total       = tpls.length;
  let succeeded     = 0;
  let failed        = 0;

  for (let i = 0; i < tpls.length; i++) {
    const tpl      = tpls[i];
    const progress = Math.round(((i + 0.5) / total) * 90);
    pf.style.width = progress + '%';
    st.textContent = total > 1
      ? `Generating ${i+1}/${total}: ${tpl}…`
      : `Generating…`;

    try {
      const resp = await fetch('api/generate.php', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ project: currentProject, model: currentModel, template: tpl, fields }),
      });
      const r = await resp.json();
      if (!resp.ok || r.error) throw new Error(r.error || 'Server error');

      const entry = {
        project: currentProject, model: currentModel,
        file:    r.filename,
        time:    new Date().toLocaleTimeString('id-ID'),
        path:    'output/' + currentProject + '/' + currentModel + '/' + r.filename,
        url:     r.download_url,
      };
      outputs.unshift(entry);
      succeeded++;

      // Auto-download each generated file
      if (r.download_url) setTimeout(() => window.open(r.download_url), 400 * (i + 1));

    } catch(e) {
      failed++;
      toast(`✗ ${tpl}: ${e.message}`, 'error');
    }
  }

  pf.style.width = '100%';
  localStorage.setItem('docgen_outputs', JSON.stringify(outputs.slice(0, 50)));
  _outputsRefreshedByGenerate = true;
  renderOutputs();
  setGenerateBtnLabel(
    total > 1 ? `⚡ Generate ${total} docs` : '⚡ Generate .docx',
    false
  );

  if (failed === 0) {
    st.innerHTML = total > 1
      ? `<span class="chip success">✓ ${succeeded} docs generated</span>`
      : `<span class="chip success">✓ Generated</span>`;
    toast(total > 1 ? `Generated ${succeeded} files` : 'Generated: ' + outputs[0]?.file, 'success');
  } else {
    st.innerHTML = `<span class="chip error">✗ ${failed} failed, ${succeeded} ok</span>`;
  }

  setTimeout(() => { pb.style.display = 'none'; pf.style.width = '0'; }, 2500);
}

// ═══════════════════════════════════════════════════════════════════════════════
// KEYWORDS PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function renderKeywordsPanel() {
  const container = document.getElementById('keywords-content');
  if (!container) return; // panel not in DOM yet
  if (!fieldDefs.length) {
    container.innerHTML = '<div class="empty"><div class="empty-icon">🔑</div><div class="empty-text">Select a model to see its keywords</div></div>';
    return;
  }

  const funcDesc = {
    'date':      'Date input (dd/mm/yyyy)',
    'autolong':  'Auto — long date from source',
    'hari':      'Auto — Indonesian day name from source',
    'nilai':     'Currency input',
    'terbilang': 'Auto — spelled-out number from source',
    'abbr':      'Auto — abbreviation from source',
    'calcdate':  'Auto — calculated date (start + days)',
  };

  // Sorted A-Z, fields first then built-ins
  const sorted = [...fieldDefs].sort((a, b) => a.key.localeCompare(b.key));

  const builtins = [
    { key: 'bulanIni', desc: 'Current month and year (e.g. Mei 2026)' },
    { key: 'hariIni',  desc: 'Today\'s date (dd-mm-yyyy)' },
    { key: 'model',    desc: 'Current model name (e.g. spk)' },
    { key: 'project',  desc: 'Current project code / name' },
    { key: 'tahunIni', desc: 'Current year (e.g. 2026)' },
  ];

  // Collect current live values from form fields
  const liveValues = {};
  fieldDefs.forEach(f => {
    const el = document.getElementById('f-' + f.key);
    liveValues[f.key] = el ? el.value : '';
  });
  // Built-in values
  const now = new Date();
  const bulanNames = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  liveValues['hariIni']  = now.toLocaleDateString('id-ID', { day:'2-digit', month:'2-digit', year:'numeric' }).replace(/\//g,'-');
  liveValues['bulanIni'] = bulanNames[now.getMonth()+1] + ' ' + now.getFullYear();
  liveValues['tahunIni'] = String(now.getFullYear());
  liveValues['project']  = currentProject || '—';
  liveValues['model']    = currentModel   || '—';

  const rows = sorted.map(f => {
    const src = f.source
      ? (Array.isArray(f.source) ? f.source.join(' + ') : f.source)
      : '—';
    const desc = f.func ? (funcDesc[f.func] || f.func) : 'Plain text input';
    const badge = f.func
      ? `<span class="func-badge ${['autolong','terbilang','abbr','calcdate','hari'].includes(f.func)?'auto':''}">${f.func}</span>`
      : '';
    const val = liveValues[f.key];
    const valCell = val
      ? `<span class="kw-val">${val}</span>`
      : `<span class="kw-val-empty">—</span>`;
    return `<tr class="kw-row" onclick="copyKeyword('${f.key}')" title="Click to copy \${${f.key}}">
      <td class="kw-token">\${${f.key}}</td>
      <td>${badge}</td>
      <td class="kw-src">${src}</td>
      <td class="kw-explain">${desc}</td>
      <td class="kw-value">${valCell}</td>
    </tr>`;
  }).join('');

  const builtinRows = builtins.map(b => `
    <tr class="kw-row kw-builtin" onclick="copyKeyword('${b.key}')" title="Click to copy \${${b.key}}">
      <td class="kw-token">\${${b.key}}</td>
      <td><span class="func-badge">built-in</span></td>
      <td class="kw-src">—</td>
      <td class="kw-explain">${b.desc}</td>
      <td class="kw-value"><span class="kw-val">${liveValues[b.key]}</span></td>
    </tr>`).join('');

  container.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden">
      <table class="kw-table">
        <thead>
          <tr>
            <th>Keyword</th>
            <th>Type</th>
            <th>Source</th>
            <th>Description</th>
            <th>Current Value</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="kw-divider"><td colspan="5">Built-in variables</td></tr>
          ${builtinRows}
        </tbody>
      </table>
    </div>`;
}

function copyKeyword(key) {
  const text = '${' + key + '}';
  navigator.clipboard.writeText(text).then(() => toast('Copied: ' + text, 'success'));
}


// ═══════════════════════════════════════════════════════════════════════════════
async function renderOutputs() {
  const list = document.getElementById('output-list');
  list.innerHTML = '<div class="empty"><div class="empty-icon">⏳</div><div class="empty-text">Loading…</div></div>';

  try {
    // Fetch all projects from server
    const projResp = await fetch('api/list.php?type=projects');
    const projData = await projResp.json();
    const projects = projData.projects || [];

    // For each project, fetch its model subdirs, then files
    const serverOutputs = [];
    for (const proj of projects) {
      const outResp = await fetch('api/list.php?type=outputs&project=' + encodeURIComponent(proj.name));
      const outData = await outResp.json();
      for (const out of (outData.outputs || [])) {
        const filesResp = await fetch('api/list.php?type=files&project=' + encodeURIComponent(proj.name) + '&model=' + encodeURIComponent(out.model));
        const filesData = await filesResp.json();
        for (const f of (filesData.files || [])) {
          serverOutputs.push({
            project: proj.name,
            model:   out.model,
            file:    f.filename,
            time:    f.date,
            path:    f.path,
            url:     'api/download.php?path=' + encodeURIComponent(f.path),
          });
        }
      }
    }

    // Sort newest first by filename (timestamp embedded)
    serverOutputs.sort((a, b) => b.file.localeCompare(a.file));

    // Sync back to localStorage
    outputs = serverOutputs;
    localStorage.setItem('docgen_outputs', JSON.stringify(outputs.slice(0, 50)));
    _lastOutputsRefresh = Date.now();

  } catch(e) {
    // Server not reachable — fall back to localStorage
    outputs = JSON.parse(localStorage.getItem('docgen_outputs') || '[]');
  }

  if (!outputs.length) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">No files generated yet</div></div>';
    return;
  }

  // Group by project
  const byProject = {};
  outputs.forEach(o => {
    if (!byProject[o.project]) byProject[o.project] = [];
    byProject[o.project].push(o);
  });

  list.innerHTML = Object.entries(byProject).map(([project, files]) => `
    <div class="output-project-group">
      <div class="output-project-header">
        <span class="output-project-name">📁 ${project.toUpperCase()}</span>
        <span class="output-project-count">${files.length} file${files.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="file-list">
        ${files.map(o => `
        <div class="file-item">
          <span>📄</span>
          <span class="file-name">${o.file}</span>
          <span class="file-meta" style="font-family:'DM Mono',monospace;font-size:10px;background:var(--paper);padding:2px 6px;border-radius:3px">${o.model}</span>
          <span class="file-meta">${o.time}</span>
          <div class="file-actions">
            <a href="${o.url || 'api/download.php?path='+encodeURIComponent(o.path)}" style="text-decoration:none">
              <button>↓</button>
            </a>
            <button class="danger" onclick="deleteOutput('${o.path}')">🗑</button>
          </div>
        </div>`).join('')}
      </div>
    </div>`).join('');
}

async function deleteTemplate(filename) {
  if (!confirm('Delete template "' + filename + '"? This cannot be undone.')) return;
  try {
    const resp = await fetch('api/delete.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'template', model: currentModel, filename }),
    });
    const r = await resp.json();
    if (!resp.ok || r.error) throw new Error(r.error);
    toast('Deleted: ' + filename, 'success');
    await syncTemplates();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteOutput(path) {
  if (!confirm('Delete "' + path.split('/').pop() + '"? This cannot be undone.')) return;
  try {
    const resp = await fetch('api/delete.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'output', path }),
    });
    const r = await resp.json();
    if (!resp.ok || r.error) throw new Error(r.error);
    toast('Deleted: ' + path.split('/').pop(), 'success');
    await renderOutputs();
  } catch(e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════════════════════
function toast(msg, type='') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show' + (type ? ' '+type : '');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.className = '', 3000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════════════════
document.addEventListener('input', e => {
  if (!e.target.id?.startsWith('f-')) return;
  autoSave();
  const key    = e.target.id.replace('f-', '');
  const srcDef = fieldDefs.find(f => f.key === key);
  if (!srcDef || srcDef.func === 'nilai') return;

  // terbilang derived fields from plain number source
  const raw = e.target.value.replace(/\D/g, '');
  fieldDefs.filter(f => f.func === 'terbilang' && f.source === key).forEach(f => {
    const spelled = toTerbilang(raw, { prefix: f.prefix, suffix: f.suffix });
    const el = document.getElementById('f-' + f.key);
    if (el && !el.dataset.manual) el.value = spelled;
    const hint = document.getElementById('hint-' + f.key);
    if (hint) hint.textContent = spelled ? '→ auto' : '';
  });

  // abbr derived fields from plain text source
  fieldDefs.filter(f => f.func === 'abbr' && f.source === key).forEach(f => {
    const abbr = toAbbr(e.target.value);
    const el   = document.getElementById('f-' + f.key);
    if (el) el.value = abbr;
    const hint = document.getElementById('hint-' + f.key);
    if (hint) hint.textContent = abbr ? '→ auto' : '';
  });

  // calcDate: trigger when the days field changes
  triggerCalcDate(key);
});

document.getElementById('model-select').addEventListener('change', e => {
  onModelChange(e.target.value);
});

document.getElementById('modal-bg').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

document.getElementById('modal-project-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') applyProject();
});

// terbilang: manual edit locks auto-fill; dblclick resets
document.addEventListener('dblclick', e => {
  const f = fieldDefs.find(f => f.func === 'terbilang' && 'f-'+f.key === e.target.id);
  if (f) {
    e.target.dataset.manual = '';
    const srcDef = fieldDefs.find(s => s.key === f.source);
    if (srcDef) onNilaiInput(document.getElementById('f-' + srcDef.key));
  }
});

document.addEventListener('input', e => {
  const f = fieldDefs.find(f => f.func === 'terbilang' && 'f-'+f.key === e.target.id);
  if (f) e.target.dataset.manual = '1';
});