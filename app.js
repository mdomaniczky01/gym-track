/* Entreno — registro de entrenamiento. Todo vive en localStorage. */
(function () {
'use strict';

/* ============================ constantes ============================ */

const KEY = 'entreno.v1';

const MOD = {
  pesas:    { nm:'Pesas',    ico:'🏋️', c:'var(--pesas)',    hex:'#E8A33D' },
  running:  { nm:'Running',  ico:'🏃', c:'var(--running)',  hex:'#FF7A59' },
  bici:     { nm:'Bici',     ico:'🚴', c:'var(--bici)',     hex:'#45C8A0' },
  natacion: { nm:'Natación', ico:'🏊', c:'var(--natacion)', hex:'#4FA8E8' },
  libre:    { nm:'Libre',    ico:'✳️', c:'var(--libre)',    hex:'#A98BE8' }
};
const MODS = Object.keys(MOD);
const CARDIO = ['running','bici','natacion'];

/* campos opcionales por modalidad (los esenciales están fijos en el form) */
const OPT = {
  running:  [['hrMax','FC máx','ppm'],['cadence','Cadencia','ppm'],['kcal','Calorías','kcal'],['elev','Desnivel','m'],['effect','Training effect',''],['temp','Temperatura','°C']],
  bici:     [['hrMax','FC máx','ppm'],['cadence','Cadencia','rpm'],['kcal','Calorías','kcal'],['elev','Desnivel','m'],['speedMax','Vel. máx','km/h'],['effect','Training effect','']],
  natacion: [['hrMax','FC máx','ppm'],['kcal','Calorías','kcal'],['lengths','Largos',''],['swolf','SWOLF',''],['pool','Pileta','m']]
};

OPT.libre = [['dist','Distancia','km'],['hrAvg','FC promedio','ppm'],['hrMax','FC máx','ppm'],
  ['kcal','Calorías','kcal'],['steps','Pasos',''],['elev','Desnivel','m'],
  ['cadence','Cadencia','ppm'],['effect','Training effect',''],['temp','Temperatura','°C']];

/* dist y hrAvg viven en el objeto raíz para que entren en las métricas */
const OPT_ROOT = { dist:'dist', hrAvg:'hrAvg' };
const getOpt = k => OPT_ROOT[k] ? D[OPT_ROOT[k]] : D.opt[k];
const setOpt = (k, v) => {
  if (OPT_ROOT[k]) D[OPT_ROOT[k]] = (v === null) ? null : (v === '' ? '' : num(v));
  else D.opt[k] = v;
};
const hasOpt = k => { const v = getOpt(k); return v !== undefined && v !== null; };

const STYLES = ['Crol','Espalda','Pecho','Mariposa','Mixto'];
const GROUPS = ['Pecho','Espalda','Hombros','Bíceps','Tríceps','Cuádriceps','Isquios','Glúteos','Gemelos','Core','Full body'];

const DEFAULT_ROUTINES = [
  ['Push','Press de banca con barra','Press de banca inclinado con mancuernas','Press militar sentado con mancuernas',
   'Elevaciones laterales con mancuernas','Extensión de tríceps en polea con cuerda','Fondos en paralelas lastrados'],
  ['Pull','Dominadas lastradas','Remo con barra','Jalón al pecho en polea','Face pull en polea',
   'Curl de bíceps con barra Z','Curl martillo con mancuernas'],
  ['Legs','Sentadilla con barra','Prensa de piernas a 45° en máquina','Peso muerto rumano con barra',
   'Curl femoral tumbado en máquina','Hip thrust con barra','Elevación de gemelos de pie en máquina']
];

/* modificadores de carga sugeridos por grupo (kg) */
const STEP = { Pecho:2.5, Espalda:2.5, Hombros:2.5, Bíceps:1.25, Tríceps:1.25, Antebrazo:1.25,
  Cuádriceps:5, Isquios:5, Glúteos:5, Gemelos:5, 'Full body':5, Core:2.5, Movilidad:0 };

/* ============================ estado ============================ */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const catId = name => 'c:' + norm(name);

function seed() {
  const routines = DEFAULT_ROUTINES.map(r => ({
    id: uid(), name: r[0], exerciseIds: r.slice(1).map(catId)
  }));
  return { version:2, custom:[], overrides:{}, hidden:[], routines,
    sessions:[], weights:[], settings:{ focus:'pesas' } };
}

/* ---- biblioteca: catálogo fijo + ejercicios propios + renombres ---- */
let EX = [], EXMAP = {};
function buildEx() {
  const hidden = new Set(S.hidden || []);
  const ov = S.overrides || {};
  EX = [];
  (window.EX_CATALOG || []).forEach(c => {
    const id = 'c:' + c.s;
    if (hidden.has(id)) return;
    const o = ov[id];
    const name = (o && o.name) || c.n;
    EX.push({ id, name, group: o && o.group != null ? o.group : c.g, s: norm(name), cat: true });
  });
  (S.custom || []).forEach(e => {
    if (hidden.has(e.id)) return;
    EX.push({ id: e.id, name: e.name, group: e.group || '', s: norm(e.name) });
  });
  EXMAP = {};
  EX.forEach(e => EXMAP[e.id] = e);
}
function exLookup(id) {
  if (EXMAP[id]) return EXMAP[id];
  const o = (S.overrides || {})[id];
  const cust = (S.custom || []).find(x => x.id === id);
  if (cust) return { id, name: cust.name, group: cust.group || '' };
  if (String(id).indexOf('c:') === 0) {
    const c = (window.EX_CATALOG || []).find(x => 'c:' + x.s === id);
    if (c) return { id, name: (o && o.name) || c.n, group: (o && o.group) || c.g };
  }
  if (o && o.name) return { id, name: o.name, group: o.group || '' };
  return null;
}
function exGroup(id) { const e = exLookup(id); return e ? e.group : ''; }

/* usos por ejercicio, para ordenar la búsqueda */
function usageMap() {
  const u = {};
  S.sessions.forEach(x => (x.entries || []).forEach(en => { u[en.exerciseId] = (u[en.exerciseId] || 0) + 1; }));
  return u;
}
function searchEx(q, limit) {
  const u = usageMap();
  const toks = norm(q).split(' ').filter(Boolean);
  let hits = toks.length ? EX.filter(e => toks.every(t => e.s.indexOf(t) >= 0)) : EX.slice();
  hits.sort((a, b) => {
    const ua = u[a.id] || 0, ub = u[b.id] || 0;
    if (ua !== ub) return ub - ua;
    if (toks.length) {
      const sa = a.s.indexOf(toks[0]) === 0 ? 0 : 1, sb = b.s.indexOf(toks[0]) === 0 ? 0 : 1;
      if (sa !== sb) return sa - sb;
      if (a.name.length !== b.name.length) return a.name.length - b.name.length;
    }
    return a.name.localeCompare(b.name, 'es');
  });
  return { total: hits.length, list: hits.slice(0, limit || 40) };
}

let S = null;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) { S = seed(); save(); return; }
    const d = JSON.parse(raw);
    S = Object.assign(seed(), d);
    S.custom    = Array.isArray(d.custom)  ? d.custom  : [];
    S.hidden    = Array.isArray(d.hidden)  ? d.hidden  : [];
    S.overrides = d.overrides && typeof d.overrides === 'object' ? d.overrides : {};
    S.routines  = d.routines  || S.routines;
    S.sessions  = Array.isArray(d.sessions) ? d.sessions : [];
    S.weights   = Array.isArray(d.weights)  ? d.weights  : [];
    S.settings  = Object.assign({ focus:'pesas' }, d.settings || {});
    delete S.settings.apiKey;
    if (Array.isArray(d.exercises) && d.exercises.length) migrateV1(d.exercises);
    S.version = 2; delete S.exercises;
  } catch (e) {
    console.error(e); S = seed();
  }
  buildEx();
  save();
}

/* Los ejercicios viejos tenían id propio: los mapeo al catálogo por nombre
   y los que no existen quedan como ejercicios propios. */
function migrateV1(olds) {
  const cat = {};
  (window.EX_CATALOG || []).forEach(c => { cat[c.s] = 'c:' + c.s; });
  const map = {};
  olds.forEach(e => {
    const k = norm(e.name);
    if (cat[k]) map[e.id] = cat[k];
    else { S.custom.push({ id: e.id, name: e.name, group: e.group || '' }); map[e.id] = e.id; }
  });
  const fix = id => map[id] || id;
  S.routines.forEach(r => r.exerciseIds = r.exerciseIds.map(fix));
  S.sessions.forEach(x => (x.entries || []).forEach(en => en.exerciseId = fix(en.exerciseId)));
  Object.keys(S.overrides || {}).forEach(k => { if (map[k] && map[k] !== k) { S.overrides[map[k]] = S.overrides[k]; delete S.overrides[k]; } });
}

function save() {
  buildEx();
  try { localStorage.setItem(KEY, JSON.stringify(S)); return true; }
  catch (e) { toast('No se pudo guardar: el almacenamiento está lleno'); return false; }
}
const saveNow = save;

/* ============================ utilidades ============================ */

const $ = s => document.querySelector(s);

/* memoria del scroll horizontal de las cintas de filtros */
const STRIP = {};
function keepStrip(key) {
  const el = $('.mods');
  if (!el) return;
  el.scrollLeft = STRIP[key] || 0;
  el.addEventListener('scroll', () => { STRIP[key] = el.scrollLeft; }, { passive: true });
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
const round = (n, d = 1) => { const p = Math.pow(10, d); return Math.round(n * p) / p; };

function todayISO(d) {
  const t = d ? new Date(d) : new Date();
  return new Date(t.getTime() - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
}
function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const mes = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const hoy = todayISO();
  if (iso === hoy) return 'Hoy';
  const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
  if (iso === todayISO(ayer)) return 'Ayer';
  return `${dias[dt.getDay()]} ${d} ${mes[m - 1]}`;
}

/* campo de tiempo: h / min / seg, todo con teclado numérico */
function timeHTML(id, sec, label) {
  const t = sec || 0;
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sg = Math.round(t % 60);
  const box = (k, v, cap, ph) => `<div>
      <input class="tin" id="${id}${k}" inputmode="numeric" pattern="[0-9]*" maxlength="2"
             value="${t ? v : ''}" placeholder="${ph}">
      <div class="tcap">${cap}</div>
    </div>`;
  return `<div class="field">
    <label class="label">${label}</label>
    <div class="tgrid">
      ${box('H', h, 'horas', '0')}
      ${box('M', m, 'min', '00')}
      ${box('S', sg, 'seg', '00')}
    </div>
  </div>`;
}
function readTime(id) {
  const v = k => { const n = parseInt(($('#' + id + k) || {}).value, 10); return isFinite(n) ? n : 0; };
  const t = v('H') * 3600 + v('M') * 60 + v('S');
  return t > 0 ? t : null;
}
function wireTime(id, onChange) {
  ['H', 'M', 'S'].forEach(k => {
    const el = $('#' + id + k);
    if (el) el.oninput = () => onChange(readTime(id));
  });
}

/* "45:30" | "1:05:20" | "45" (min) -> segundos (para datos viejos) */
function parseTime(str) {
  if (!str) return null;
  const s = String(str).trim().replace(',', '.');
  if (!s) return null;
  const p = s.split(':').map(x => parseFloat(x));
  if (p.some(x => !isFinite(x))) return null;
  if (p.length === 1) return Math.round(p[0] * 60);
  if (p.length === 2) return Math.round(p[0] * 60 + p[1]);
  return Math.round(p[0] * 3600 + p[1] * 60 + p[2]);
}
function fmtTime(sec) {
  if (sec == null || !isFinite(sec)) return '—';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = n => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}
/* ritmo min/km (o min/100m en natación) */
function paceStr(sec, dist) {
  if (!sec || !dist) return '—';
  const p = sec / dist;
  const m = Math.floor(p / 60), s = Math.round(p % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function sessionTitle(x) {
  if (x.modality === 'pesas') return x.name || 'Pesas';
  if (x.modality === 'libre') return x.name || 'Actividad libre';
  return MOD[x.modality].nm;
}
function exName(id) {
  const e = exLookup(id);
  return e ? e.name : 'Ejercicio borrado';
}
function volumeOf(x) {
  if (x.modality !== 'pesas') return 0;
  let v = 0;
  (x.entries || []).forEach(en => (en.sets || []).forEach(st => {
    if (st.w != null && st.r != null) v += st.w * st.r;
    if (en.uni && st.w2 != null && st.r2 != null) v += st.w2 * st.r2;
  }));
  return v;
}

/* una serie por lado cuenta como dos para el historial y los récords */
function flatSets(en) {
  const out = [];
  (en.sets || []).forEach(st => {
    if (st.w != null && st.r != null) out.push({ w: st.w, r: st.r, lado: en.uni ? 'Izquierda' : '' });
    if (en.uni && st.w2 != null && st.r2 != null) out.push({ w: st.w2, r: st.r2, lado: 'Derecha' });
  });
  return out;
}
function sessionsSorted() {
  return S.sessions.slice().sort((a, b) =>
    a.date === b.date ? (b.created || 0) - (a.created || 0) : (a.date < b.date ? 1 : -1));
}

/* ============================ UI base ============================ */

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2100);
}

/* Navegación hacia atrás
   La app mantiene una pila de capas abiertas (hoja, formulario). Mientras
   haya alguna, deja una entrada marcada en el historial: así el gesto de
   volver atrás del iPhone cierra una capa en vez de salir de la app.
   La sincronización con el historial se hace diferida, porque cerrar una
   capa y abrir otra en el mismo gesto es normal y no debería tocar nada. */
const NAVS = [];
let HIST_MARK = false, SKIP_POP = 0, histTimer = null;

/* abrir marca el historial al instante; cerrar lo libera diferido, para que
   cerrar una capa y abrir otra en el mismo gesto no toque nada */
function markHist() {
  if (HIST_MARK) return;
  HIST_MARK = true;
  try { history.pushState({ entreno: 1 }, ''); } catch (e) { HIST_MARK = false; }
}
function syncHist() {
  clearTimeout(histTimer);
  histTimer = setTimeout(() => {
    if (NAVS.length) { markHist(); return; }
    if (HIST_MARK) {
      HIST_MARK = false; SKIP_POP++;
      try { history.back(); } catch (e) { SKIP_POP--; }
    }
  }, 0);
}
function pushNav(kind) { NAVS.push(kind); markHist(); }
function dropNav(kind) {
  const i = NAVS.lastIndexOf(kind);
  if (i >= 0) NAVS.splice(i, 1);
  syncHist();
}
window.addEventListener('popstate', () => {
  if (SKIP_POP > 0) { SKIP_POP--; return; }
  HIST_MARK = false;
  const kind = NAVS.pop();
  if (kind === 'sheet') realCloseSheet();
  else if (kind === 'form') realLeaveForm();
  if (NAVS.length) markHist();
});

function openSheet(html) {
  const sh = $('#sheet');
  const yaAbierta = sh.classList.contains('on');
  sh.innerHTML = '<div class="bar"></div><button class="sheetx" id="sheetX" aria-label="Cerrar">✕</button>' + html;
  sh.scrollTop = 0;
  $('#veil').classList.add('on');
  requestAnimationFrame(() => sh.classList.add('on'));
  $('#sheetX').onclick = closeSheet;
  document.documentElement.classList.add('lock');
  if (!yaAbierta) pushNav('sheet');
}
function realCloseSheet() {
  $('#sheet').classList.remove('on');
  $('#veil').classList.remove('on');
  document.documentElement.classList.remove('lock');
}
function closeSheet() {
  realCloseSheet();
  dropNav('sheet');
}
$('#veil').addEventListener('click', closeSheet);

function confirmAsk(text, okLabel, onOk) {
  openSheet(`
    <h2>${esc(text)}</h2>
    <button class="btn wide" style="color:var(--danger)" id="cfOk">${esc(okLabel)}</button>
    <button class="btn wide" style="margin-top:8px" id="cfNo">Cancelar</button>`);
  $('#cfOk').onclick = () => { closeSheet(); onOk(); };
  $('#cfNo').onclick = closeSheet;
}

/* ============================ router ============================ */

let TAB = 'hoy';
const SCREENS = {};

function go(tab) {
  TAB = tab;
  const bk = $('#back'); if (bk) bk.classList.add('hide');
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  render();
  window.scrollTo(0, 0);
}
function render() {
  const s = SCREENS[TAB];
  if (s) s();
}
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => go(b.dataset.tab));

/* teclado abierto: la barra inferior se retira para no tapar el campo */
(function () {
  const root = document.documentElement;
  const esCampo = el => el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  document.addEventListener('focusin', e => { if (esCampo(e.target)) root.classList.add('kb'); });
  document.addEventListener('focusout', () => {
    setTimeout(() => { if (!esCampo(document.activeElement)) root.classList.remove('kb'); }, 60);
  });
  const vv = window.visualViewport;
  if (vv) vv.addEventListener('resize', () => {
    const tapado = window.innerHeight - vv.height > 120;
    if (!tapado) root.classList.remove('kb');
  });
})();

load();

/* ==================================================================
   PANTALLA: ENTRENAR
   ================================================================== */

SCREENS.hoy = function () {
  $('#hTitle').textContent = 'Entrenar';
  const n = S.sessions.length;
  const last = sessionsSorted()[0];
  $('#hSub').textContent = last
    ? `${n} ${n === 1 ? 'sesión registrada' : 'sesiones registradas'} · última ${fmtDate(last.date).toLowerCase()}`
    : 'Elegí qué entrenaste para empezar';

  const week = weekStats();
  $('#view').innerHTML = `
    <div class="pick">
      ${MODS.map(m => `
        <button data-m="${m}" class="${m === 'libre' ? 'full' : ''}" style="--c:${MOD[m].hex}">
          <span class="ico">${MOD[m].ico}</span>
          <span class="nm">${MOD[m].nm}</span>
          <span class="dt">${modHint(m)}</span>
        </button>`).join('')}
    </div>

    <div class="card" style="margin-top:14px">
      <div class="row" style="justify-content:space-between">
        <div>
          <div style="font-weight:700;font-size:15px">Esta semana</div>
          <div style="font-size:12.5px;color:var(--muted);margin-top:2px">${week.count} ${week.count === 1 ? 'sesión' : 'sesiones'} · ${week.days} ${week.days === 1 ? 'día' : 'días'} activos</div>
        </div>
        <button class="btn sm" id="goDiario">Ver diario</button>
      </div>
      ${week.count ? `<div class="hr"></div><div style="font-size:13px;color:var(--muted);line-height:1.6">${week.lines.join('<br>')}</div>` : ''}
    </div>

    <button class="btn wide" style="margin-top:10px" id="addW">Registrar peso corporal</button>`;

  document.querySelectorAll('.pick button').forEach(b => b.onclick = () => openForm(b.dataset.m, null));
  $('#goDiario').onclick = () => go('diario');
  $('#addW').onclick = weightSheet;
};

function modHint(m) {
  const list = S.sessions.filter(x => x.modality === m);
  if (!list.length) return 'Sin registros';
  const last = list.sort((a, b) => a.date < b.date ? 1 : -1)[0];
  return 'Última: ' + fmtDate(last.date).toLowerCase();
}

function weekStats() {
  const from = new Date(); from.setDate(from.getDate() - 6);
  const iso = todayISO(from);
  const list = S.sessions.filter(x => x.date >= iso);
  const days = new Set(list.map(x => x.date)).size;
  const lines = [];
  MODS.forEach(m => {
    const ls = list.filter(x => x.modality === m);
    if (!ls.length) return;
    if (m === 'pesas') {
      const v = ls.reduce((a, x) => a + volumeOf(x), 0);
      lines.push(`${MOD[m].ico} ${ls.length}× pesas · ${Math.round(v).toLocaleString('es')} kg de volumen`);
    } else if (CARDIO.includes(m)) {
      const d = ls.reduce((a, x) => a + (x.dist || 0), 0);
      const u = m === 'natacion' ? 'm' : 'km';
      lines.push(`${MOD[m].ico} ${ls.length}× ${MOD[m].nm.toLowerCase()} · ${round(d, m === 'natacion' ? 0 : 1)} ${u}`);
    } else {
      lines.push(`${MOD[m].ico} ${ls.length}× actividad libre`);
    }
  });
  return { count: list.length, days, lines };
}

/* ==================================================================
   FORMULARIO DE SESIÓN
   ================================================================== */

let D = null;          // borrador
let EDIT_ID = null;    // id si estoy editando

function newDraft(m) {
  const base = { id: uid(), created: Date.now(), date: todayISO(), modality: m, notes: '' };
  if (m === 'pesas') return Object.assign(base, { name: '', routineId: '', entries: [], durSec: null });
  if (m === 'libre') return Object.assign(base, { name: '', durSec: null, intensity: '', dist: null, hrAvg: null, opt: {} });
  return Object.assign(base, { dist: null, durSec: null, hrAvg: null, opt: {}, style: '', laps: [] });
}

let PREV_TAB = 'hoy';
function openForm(m, session) {
  D = session ? JSON.parse(JSON.stringify(session)) : newDraft(m);
  EDIT_ID = session ? session.id : null;
  if (TAB !== 'form') { PREV_TAB = TAB; pushNav('form'); }
  TAB = 'form';
  document.querySelectorAll('#nav button').forEach(b => b.classList.remove('on'));
  SCREENS.form();
  window.scrollTo(0, 0);
}

SCREENS.form = function () {
  const m = D.modality, C = MOD[m];
  $('#hTitle').textContent = (EDIT_ID ? 'Editar ' : '') + C.nm;
  $('#hSub').textContent = EDIT_ID ? 'Cambiá lo que necesites y guardá' : 'Los campos vacíos no se guardan';
  const bk = $('#back');
  bk.classList.remove('hide');
  bk.onclick = leaveForm;
  document.body.style.setProperty('--accent', C.hex);

  const body = m === 'pesas' ? formPesas() : m === 'libre' ? formLibre() : formCardio();

  $('#view').innerHTML = `
    <div class="field">
      <label class="label">Fecha</label>
      <input type="date" id="fDate" value="${D.date}">
    </div>
    ${body}
    <div class="field">
      <label class="label">Notas</label>
      <textarea id="fNotes" placeholder="Cómo te sentiste, qué cambiar la próxima...">${esc(D.notes)}</textarea>
    </div>
    <button class="btn primary wide" style="margin-top:14px" id="fSave">${EDIT_ID ? 'Guardar cambios' : 'Guardar sesión'}</button>
    ${EDIT_ID ? '<button class="btn wide danger" style="margin-top:8px" id="fDel">Borrar sesión</button>' : ''}
    <button class="btn wide" style="margin-top:8px;border:none;color:var(--muted)" id="fCancel">Cancelar</button>
    <div style="height:8px"></div>`;

  $('#fDate').oninput = e => { D.date = e.target.value; };
  $('#fNotes').oninput = e => { D.notes = e.target.value; };
  $('#fSave').onclick = saveForm;
  $('#fCancel').onclick = leaveForm;
  if (EDIT_ID) $('#fDel').onclick = () => confirmAsk('¿Borrar esta sesión?', 'Borrar', () => {
    S.sessions = S.sessions.filter(x => x.id !== EDIT_ID); saveNow(); toast('Sesión borrada'); leaveForm();
  });

  if (m === 'pesas') wirePesas();
  else if (m === 'libre') wireLibre();
  else wireCardio();
};

function realLeaveForm() {
  D = null; EDIT_ID = null;
  realCloseSheet();
  document.body.style.removeProperty('--accent');
  go(PREV_TAB === 'form' ? 'diario' : PREV_TAB);
}
function leaveForm() {
  realLeaveForm();
  dropNav('sheet');
  dropNav('form');
}

function saveForm() {
  if (!D.date) { toast('Falta la fecha'); return; }
  const m = D.modality;
  ['dist', 'hrAvg'].forEach(k => { if (D[k] === '' || (D[k] != null && !isFinite(D[k]))) D[k] = null; });

  if (m === 'pesas') {
    D.entries = (D.entries || []).map(en => {
      const sets = (en.sets || [])
        .filter(st => st.w != null || st.r != null || st.w2 != null || st.r2 != null)
        .map(st => en.uni ? st : { w: st.w, r: st.r });
      return en.uni ? { exerciseId: en.exerciseId, uni: true, sets } : { exerciseId: en.exerciseId, sets };
    }).filter(en => en.sets.length);
    if (!D.entries.length) { toast('Cargá al menos una serie'); return; }
    if (!D.name) {
      const r = S.routines.find(x => x.id === D.routineId);
      D.name = r ? r.name : 'Pesas';
    }
  } else if (m === 'libre') {
    if (!D.name) { toast('Ponele un nombre a la actividad'); return; }
    Object.keys(D.opt || {}).forEach(k => { if (D.opt[k] === '' || D.opt[k] == null) delete D.opt[k]; });
  } else {
    if (!D.dist && !D.durSec) { toast('Cargá al menos distancia o tiempo'); return; }
  }

  const i = S.sessions.findIndex(x => x.id === D.id);
  if (i >= 0) S.sessions[i] = D; else S.sessions.push(D);
  if (saveNow()) toast(EDIT_ID ? 'Cambios guardados' : 'Sesión guardada');
  leaveForm();
}

/* ---------------------------- pesas ---------------------------- */

function formPesas() {
  return `
    <div class="field">
      <label class="label">Rutina</label>
      <select id="fRoutine">
        <option value="">Sesión suelta</option>
        ${S.routines.map(r => `<option value="${r.id}" ${r.id === D.routineId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label class="label">Nombre de la sesión</label>
      <input id="fName" value="${esc(D.name || '')}" placeholder="Push, Full body, Pierna...">
    </div>
    <div class="hr"></div>
    <div id="exList">${D.entries.map(entryHTML).join('') || '<div class="empty">Todavía no agregaste ejercicios.</div>'}</div>
    <button class="btn wide" id="addEx">Agregar ejercicio</button>
    ${timeHTML('fDur', D.durSec, 'Duración total (opcional)')}`;
}

function entryHTML(en, i) {
  const sets = en.sets || [];
  const uni = !!en.uni;
  const inp = (j, f, v, mode) => `<input inputmode="${mode}" data-i="${i}" data-j="${j}" data-f="${f}" value="${v != null ? v : ''}" placeholder="—">`;

  const fila = (st, j) => uni
    ? `<div class="setrow uni">
        <span class="n">${j + 1}</span>
        <div class="sides">
          <div class="side"><span class="sl">I</span>${inp(j, 'w', st.w, 'decimal')}${inp(j, 'r', st.r, 'numeric')}</div>
          <div class="side"><span class="sl">D</span>${inp(j, 'w2', st.w2, 'decimal')}${inp(j, 'r2', st.r2, 'numeric')}</div>
        </div>
        <button class="x" data-del-set="${i}:${j}">✕</button>
      </div>`
    : `<div class="setrow">
        <span class="n">${j + 1}</span>
        ${inp(j, 'w', st.w, 'decimal')}
        ${inp(j, 'r', st.r, 'numeric')}
        <button class="x" data-del-set="${i}:${j}">✕</button>
      </div>`;

  return `<div class="exblk" data-i="${i}">
    <div class="hd">
      <div class="nm">${esc(exName(en.exerciseId))}</div>
      <button class="x" data-del-ex="${i}">✕</button>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="unibtn ${uni ? 'on' : ''}" data-uni="${i}">${uni ? 'Por lado' : 'Por lado'}</button>
      <div class="grow"></div>
    </div>
    ${uni
      ? `<div class="side" style="margin-top:10px"><span></span><span class="mini">Peso (kg)</span><span class="mini">Reps</span></div>`
      : `<div class="minis"><span></span><span class="mini">Peso (kg)</span><span class="mini">Reps</span><span></span></div>`}
    ${sets.map(fila).join('')}
    <div class="row" style="margin-top:10px;gap:8px">
      <button class="btn sm grow" data-add-set="${i}">+ Serie</button>
      <button class="btn sm grow" data-copy-set="${i}">Repetir última</button>
    </div>
  </div>`;
}

function wirePesas() {
  $('#fRoutine').onchange = e => {
    D.routineId = e.target.value;
    const r = S.routines.find(x => x.id === D.routineId);
    if (r) {
      const known = new Set(D.entries.map(en => en.exerciseId));
      r.exerciseIds.forEach(id => { if (!known.has(id)) D.entries.push({ exerciseId: id, sets: [{ w: null, r: null }] }); });
      if (!D.name) D.name = r.name;
    }
    SCREENS.form();
  };
  $('#fName').oninput = e => { D.name = e.target.value; };
  wireTime('fDur', v => { D.durSec = v; });
  $('#addEx').onclick = pickExercise;

  const list = $('#exList');
  list.oninput = e => {
    const t = e.target;
    if (t.dataset.f === undefined) return;
    const st = D.entries[+t.dataset.i].sets[+t.dataset.j];
    st[t.dataset.f] = t.value.trim() === '' ? null : num(t.value);
  };
  list.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.delEx !== undefined) { D.entries.splice(+b.dataset.delEx, 1); SCREENS.form(); }
    else if (b.dataset.addSet !== undefined) { D.entries[+b.dataset.addSet].sets.push({ w: null, r: null }); SCREENS.form(); }
    else if (b.dataset.copySet !== undefined) {
      const sets = D.entries[+b.dataset.copySet].sets;
      const last = sets[sets.length - 1] || {};
      sets.push({ w: last.w != null ? last.w : null, r: last.r != null ? last.r : null,
                  w2: last.w2 != null ? last.w2 : null, r2: last.r2 != null ? last.r2 : null });
      SCREENS.form();
    }
    else if (b.dataset.uni !== undefined) {
      const en = D.entries[+b.dataset.uni];
      en.uni = !en.uni;
      /* al pasar a por lado, el peso ya cargado se copia al otro lado */
      if (en.uni) en.sets.forEach(st => { if (st.w2 == null) st.w2 = st.w; if (st.r2 == null) st.r2 = st.r; });
      SCREENS.form();
    } else if (b.dataset.delSet !== undefined) {
      const [i, j] = b.dataset.delSet.split(':').map(Number);
      D.entries[i].sets.splice(j, 1); SCREENS.form();
    }
  };
}

/* buscador de ejercicios reutilizable (sesiones, rutinas, ajustes) */
let EQ = '';
function exSearchSheet(title, onPick) {
  openSheet(`
    <h2>${esc(title)}</h2>
    <input id="exSearch" placeholder="Buscar entre ${(window.EX_CATALOG || []).length} ejercicios" autocomplete="off" value="${esc(EQ)}">
    <div id="exResults" style="margin-top:6px"></div>`);
  const draw = () => {
    const q = EQ.trim();
    const { total, list } = searchEx(q, 40);
    const exact = list.some(e => e.s === norm(q));
    $('#exResults').innerHTML =
      (q && !exact ? `<button class="li" data-new="1" style="width:100%;text-align:left">
          <div class="grow"><div class="nm">Crear “${esc(q)}”</div><div class="gp">Se guarda en tu biblioteca</div></div></button>` : '') +
      (list.length
        ? list.map(e => `<button class="li" data-id="${e.id}" style="width:100%;text-align:left">
            <div class="grow"><div class="nm">${esc(e.name)}</div><div class="gp">${esc(e.group || 'Sin grupo')}</div></div></button>`).join('') +
          (total > list.length ? `<div style="color:var(--faint);font-size:12.5px;padding:10px 0;text-align:center">+${total - list.length} más. Escribí para afinar la búsqueda.</div>` : '')
        : (q ? '' : '<div class="empty">Sin ejercicios.</div>'));
    $('#exResults').querySelectorAll('button').forEach(b => b.onclick = () => {
      let id = b.dataset.id;
      if (b.dataset.new) {
        const ex = { id: uid(), name: q, group: '' };
        S.custom.push(ex); save(); id = ex.id;
      }
      EQ = ''; onPick(id);
    });
  };
  draw();
  const inp = $('#exSearch');
  inp.oninput = e => { EQ = e.target.value; draw(); };
}

function pickExercise() {
  EQ = '';
  exSearchSheet('Agregar ejercicio', id => {
    D.entries.push({ exerciseId: id, sets: [{ w: null, r: null }] });
    closeSheet(); SCREENS.form();
  });
}

/* ---------------------------- cardio ---------------------------- */

function formCardio() {
  const m = D.modality;
  const isSwim = m === 'natacion';
  const distLabel = isSwim ? 'Distancia (m)' : 'Distancia (km)';
  const opts = OPT[m];
  const shown = opts.filter(o => hasOpt(o[0]));
  return `
    <div class="grid2">
      <div class="field" style="margin:0">
        <label class="label">${distLabel}</label>
        <input id="cDist" inputmode="decimal" value="${D.dist != null ? D.dist : ''}" placeholder="—">
      </div>
      <div class="field" style="margin:0">
        <label class="label">FC promedio (ppm)</label>
        <input id="cHr" inputmode="numeric" value="${D.hrAvg != null ? D.hrAvg : ''}" placeholder="—">
      </div>
    </div>
    ${timeHTML('cDur', D.durSec, 'Tiempo')}
    <div class="paceout">${m === 'bici' ? 'Velocidad' : 'Ritmo'}: <b id="paceOut">${paceCalc()}</b></div>
    ${isSwim ? `
    <div class="field">
      <label class="label">Estilo</label>
      <select id="cStyle"><option value="">—</option>${STYLES.map(s => `<option ${s === D.style ? 'selected' : ''}>${s}</option>`).join('')}</select>
    </div>` : ''}
    <div id="optBox">${shown.map(o => optHTML(o)).join('')}</div>
    <button class="btn wide" style="margin-top:10px" id="addOpt">Agregar otro dato del Garmin</button>`;
}

function optHTML(o) {
  const [k, label, unit] = o;
  const v = getOpt(k);
  return `<div class="field" data-opt="${k}">
    <label class="label">${label}${unit ? ' (' + unit + ')' : ''}</label>
    <div class="row">
      <input class="grow" data-optin="${k}" inputmode="decimal" value="${v != null ? v : ''}">
      <button class="x" data-optdel="${k}">✕</button>
    </div>
  </div>`;
}

/* alta/baja de campos opcionales, compartido por cardio y libre */
function wireOpt() {
  const box = $('#optBox');
  box.oninput = e => {
    const k = e.target.dataset.optin;
    if (k) setOpt(k, e.target.value.trim() === '' ? null : e.target.value.trim());
  };
  box.onclick = e => {
    const b = e.target.closest('[data-optdel]'); if (!b) return;
    const k = b.dataset.optdel;
    if (OPT_ROOT[k]) D[OPT_ROOT[k]] = null; else delete D.opt[k];
    SCREENS.form();
  };
  $('#addOpt').onclick = () => {
    const free = OPT[D.modality].filter(o => !hasOpt(o[0]));
    if (!free.length) { toast('Ya agregaste todos los campos'); return; }
    openSheet(`<h2>Agregar dato</h2>` + free.map(o =>
      `<button class="li" data-k="${o[0]}" style="width:100%;text-align:left"><div class="nm">${o[1]}</div></button>`).join(''));
    $('#sheet').querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
      setOpt(b.dataset.k, ''); closeSheet(); SCREENS.form();
      const inp = document.querySelector(`[data-optin="${b.dataset.k}"]`); if (inp) inp.focus();
    });
  };
}

function paceCalc() {
  if (!D.durSec || !D.dist) return '—';
  if (D.modality === 'natacion') return paceStr(D.durSec, D.dist / 100) + ' /100m';
  if (D.modality === 'bici') return round(D.dist / (D.durSec / 3600), 1) + ' km/h';
  return paceStr(D.durSec, D.dist) + ' /km';
}

function wireCardio() {
  $('#cDist').oninput = e => { D.dist = num(e.target.value); refreshPace(); };
  wireTime('cDur', v => { D.durSec = v; refreshPace(); });
  $('#cHr').oninput   = e => { D.hrAvg = num(e.target.value); };
  const st = $('#cStyle'); if (st) st.onchange = e => { D.style = e.target.value; };

  wireOpt();
}
function refreshPace() {
  const el = $('#paceOut');
  if (el) el.textContent = paceCalc();
}

/* ---------------------------- libre ---------------------------- */

function formLibre() {
  if (!D.opt) D.opt = {};
  const shown = OPT.libre.filter(o => hasOpt(o[0]));
  return `
    <div class="field">
      <label class="label">Actividad</label>
      <input id="lName" value="${esc(D.name || '')}" placeholder="Caminata, escalada, fútbol...">
    </div>
    ${timeHTML('lDur', D.durSec, 'Duración')}
    <div class="field">
      <label class="label">Intensidad</label>
      <select id="lInt"><option value="">—</option>${['Suave','Moderada','Fuerte','Máxima'].map(x => `<option ${x === D.intensity ? 'selected' : ''}>${x}</option>`).join('')}</select>
    </div>
    <div id="optBox">${shown.map(o => optHTML(o)).join('')}</div>
    ${D.dist && D.durSec ? `<div style="color:var(--muted);font-size:13px;margin-top:8px">Ritmo: ${paceStr(D.durSec, D.dist)} /km</div>` : ''}
    <button class="btn wide" style="margin-top:10px" id="addOpt">Agregar dato del Garmin</button>`;
}
function wireLibre() {
  $('#lName').oninput = e => { D.name = e.target.value; };
  wireTime('lDur', v => { D.durSec = v; });
  $('#lInt').onchange = e => { D.intensity = e.target.value; };
  wireOpt();
}

/* ---------------------------- peso corporal ---------------------------- */

function weightSheet() {
  openSheet(`
    <h2>Peso corporal</h2>
    <div class="field">
      <label class="label">Kilos</label>
      <input id="wKg" inputmode="decimal" placeholder="—" autocomplete="off">
    </div>
    <div class="field">
      <label class="label">Fecha</label>
      <input type="date" id="wDate" value="${todayISO()}">
    </div>
    <button class="btn primary wide" style="margin-top:12px;--accent:var(--pesas)" id="wSave">Guardar peso</button>
    ${S.weights.length ? `<div class="hr"></div>` + S.weights.slice().sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 8).map(w =>
      `<div class="li"><div class="grow"><div class="nm num">${w.kg} kg</div><div class="gp">${fmtDate(w.date)}</div></div><button class="x" data-wdel="${w.id}">✕</button></div>`).join('') : ''}`);
  $('#wSave').onclick = () => {
    const kg = num($('#wKg').value), date = $('#wDate').value;
    if (!kg || !date) { toast('Falta el peso'); return; }
    S.weights = S.weights.filter(w => w.date !== date);
    S.weights.push({ id: uid(), date, kg });
    saveNow(); closeSheet(); toast('Peso guardado'); render();
  };
  $('#sheet').querySelectorAll('[data-wdel]').forEach(b => b.onclick = () => {
    S.weights = S.weights.filter(w => w.id !== b.dataset.wdel); saveNow(); weightSheet();
  });
}

/* ==================================================================
   PANTALLA: DIARIO
   ================================================================== */

let DFILTER = 'todo';

SCREENS.diario = function () {
  $('#hTitle').textContent = 'Diario';
  const all = sessionsSorted();
  const list = DFILTER === 'todo' ? all : all.filter(x => x.modality === DFILTER);
  $('#hSub').textContent = `${list.length} ${list.length === 1 ? 'entrenamiento' : 'entrenamientos'}`;

  const groups = [];
  list.forEach(x => {
    const g = groups[groups.length - 1];
    if (g && g.date === x.date) g.items.push(x);
    else groups.push({ date: x.date, items: [x] });
  });

  $('#view').innerHTML = `
    <div class="mods">
      <button class="chip ${DFILTER === 'todo' ? 'on' : ''}" data-f="todo" style="${DFILTER === 'todo' ? 'background:var(--text)' : ''}">Todo</button>
      ${MODS.map(m => `<button class="chip ${DFILTER === m ? 'on' : ''}" data-f="${m}" style="${DFILTER === m ? 'background:' + MOD[m].hex : ''}">${MOD[m].ico} ${MOD[m].nm}</button>`).join('')}
    </div>
    ${groups.length ? groups.map(g => `
      <div class="day">
        <h3>${fmtDate(g.date)}</h3>
        ${g.items.map(x => `
          <div class="sesh" data-id="${x.id}" style="--c:${MOD[x.modality].hex}">
            <div class="t">
              <div class="nm">${MOD[x.modality].ico} ${esc(sessionTitle(x))}</div>
              <div style="font-size:13px;color:var(--muted)" class="num">${esc(headline(x))}</div>
            </div>
            <div class="mt">${esc(subline(x))}</div>
          </div>`).join('')}
      </div>`).join('')
    : `<div class="empty">Nada por acá todavía.<br>Cargá tu primer entrenamiento desde Entrenar.</div>`}
    <div style="height:10px"></div>`;

  keepStrip('diario');
  document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { DFILTER = b.dataset.f; SCREENS.diario(); });
  document.querySelectorAll('.sesh').forEach(el => el.onclick = () => detailSheet(el.dataset.id));
};

function headline(x) {
  if (x.modality === 'pesas') return Math.round(volumeOf(x)).toLocaleString('es') + ' kg';
  if (x.modality === 'natacion') return x.dist ? x.dist + ' m' : fmtTime(x.durSec);
  if (CARDIO.includes(x.modality)) return x.dist ? round(x.dist, 2) + ' km' : fmtTime(x.durSec);
  return x.durSec ? fmtTime(x.durSec) : '';
}
function subline(x) {
  if (x.modality === 'pesas') {
    const sets = (x.entries || []).reduce((a, e) => a + e.sets.length, 0);
    const uni = (x.entries || []).some(e => e.uni);
    return `${x.entries.length} ejercicios · ${sets} series${uni ? ' (por lado)' : ''}${x.durSec ? ' · ' + fmtTime(x.durSec) : ''}`;
  }
  if (x.modality === 'libre') {
    const b = [];
    if (x.durSec) b.push(fmtTime(x.durSec));
    if (x.dist) b.push(round(x.dist, 2) + ' km');
    if (x.hrAvg) b.push(x.hrAvg + ' ppm');
    if (x.intensity) b.push(x.intensity);
    return b.join(' · ') || 'Sin detalles';
  }
  const bits = [];
  if (x.durSec) bits.push(fmtTime(x.durSec));
  const p = paceOf(x); if (p !== '—') bits.push(p);
  if (x.hrAvg) bits.push(x.hrAvg + ' ppm');
  if (x.style) bits.push(x.style);
  return bits.join(' · ') || 'Sin detalles';
}
function paceOf(x) {
  if (!x.durSec || !x.dist) return '—';
  if (x.modality === 'natacion') return paceStr(x.durSec, x.dist / 100) + ' /100m';
  if (x.modality === 'bici') return round(x.dist / (x.durSec / 3600), 1) + ' km/h';
  return paceStr(x.durSec, x.dist) + ' /km';
}

function detailSheet(id) {
  const x = S.sessions.find(s => s.id === id); if (!x) return;
  let body = '';
  if (x.modality === 'pesas') {
    body = (x.entries || []).map(en => `
      <div style="margin-bottom:12px">
        <div style="font-weight:700;font-size:15px">${esc(exName(en.exerciseId))}</div>
        <div class="num" style="color:var(--muted);font-size:14px;margin-top:3px">
          ${en.uni
            ? en.sets.map(st => `I ${st.w != null ? st.w : '—'}×${st.r != null ? st.r : '—'} / D ${st.w2 != null ? st.w2 : '—'}×${st.r2 != null ? st.r2 : '—'}`).join('<br>')
            : en.sets.map(st => `${st.w != null ? st.w : '—'}×${st.r != null ? st.r : '—'}`).join('  ·  ')}
        </div>
      </div>`).join('');
    body += `<div class="hr"></div><div style="color:var(--muted);font-size:14px">Volumen total: <b class="num" style="color:var(--text)">${Math.round(volumeOf(x)).toLocaleString('es')} kg</b></div>`;
  } else if (CARDIO.includes(x.modality)) {
    const rows = [
      ['Distancia', x.dist != null ? x.dist + (x.modality === 'natacion' ? ' m' : ' km') : null],
      ['Tiempo', x.durSec ? fmtTime(x.durSec) : null],
      [x.modality === 'bici' ? 'Velocidad media' : 'Ritmo', paceOf(x) === '—' ? null : paceOf(x)],
      ['FC promedio', x.hrAvg ? x.hrAvg + ' ppm' : null],
      ['Estilo', x.style || null]
    ].concat((OPT[x.modality] || []).map(o => [o[1], x.opt && x.opt[o[0]] ? x.opt[o[0]] + (o[2] ? ' ' + o[2] : '') : null]))
      .filter(r => r[1]);
    body = rows.map(r => `<div class="li"><div class="grow gp">${r[0]}</div><div class="nm num">${esc(r[1])}</div></div>`).join('');
  } else {
    const rows = [['Duración', x.durSec ? fmtTime(x.durSec) : null], ['Intensidad', x.intensity || null],
      ['Distancia', x.dist ? x.dist + ' km' : null],
      ['Ritmo', x.dist && x.durSec ? paceStr(x.durSec, x.dist) + ' /km' : null],
      ['FC promedio', x.hrAvg ? x.hrAvg + ' ppm' : null]]
      .concat((OPT.libre || []).filter(o => !OPT_ROOT[o[0]]).map(o => [o[1], x.opt && x.opt[o[0]] ? x.opt[o[0]] + (o[2] ? ' ' + o[2] : '') : null]))
      .filter(r => r[1]);
    body = rows.map(r => `<div class="li"><div class="grow gp">${r[0]}</div><div class="nm">${esc(r[1])}</div></div>`) .join('');
  }

  openSheet(`
    <h2>${MOD[x.modality].ico} ${esc(sessionTitle(x))}</h2>
    <div style="color:var(--muted);font-size:13.5px;margin:-6px 0 14px">${fmtDate(x.date)}</div>
    ${body}
    ${x.notes ? `<div class="hr"></div><div style="font-size:14px;line-height:1.55;color:var(--muted)">${esc(x.notes)}</div>` : ''}
    <button class="btn wide" style="margin-top:14px" id="dEdit">Editar</button>
    <button class="btn wide danger" style="margin-top:8px" id="dDel">Borrar</button>`);
  $('#dEdit').onclick = () => { closeSheet(); openForm(x.modality, x); };
  $('#dDel').onclick = () => confirmAsk('¿Borrar esta sesión?', 'Borrar', () => {
    S.sessions = S.sessions.filter(s => s.id !== id); saveNow(); toast('Sesión borrada'); SCREENS.diario();
  });
}

/* ==================================================================
   PANTALLA: MÉTRICAS
   ================================================================== */

let RANGE = 90;

SCREENS.metricas = function () {
  const f = S.settings.focus || 'pesas';
  $('#hTitle').textContent = 'Métricas';
  $('#hSub').textContent = 'Enfoque: ' + (f === 'general' ? 'General' : MOD[f].nm);
  const accent = f === 'general' ? '#EDF1F3' : MOD[f].hex;

  const from = new Date(); from.setDate(from.getDate() - (RANGE - 1));
  const iso = RANGE === 0 ? '0000-00-00' : todayISO(from);
  const inRange = S.sessions.filter(x => x.date >= iso);

  $('#view').innerHTML = `
    <div class="mods">
      ${['general'].concat(MODS).map(m => {
        const on = m === f, hex = m === 'general' ? '#EDF1F3' : MOD[m].hex;
        return `<button class="chip ${on ? 'on' : ''}" data-focus="${m}" style="${on ? 'background:' + hex : ''}">${m === 'general' ? 'General' : MOD[m].ico + ' ' + MOD[m].nm}</button>`;
      }).join('')}
    </div>
    <div class="row" style="gap:6px;margin:12px 0 14px">
      ${[[30, '30 días'], [90, '90 días'], [365, '1 año'], [0, 'Todo']].map(r =>
        `<button class="btn sm grow" data-range="${r[0]}" style="${RANGE === r[0] ? 'background:var(--surface2);color:var(--text);border-color:' + accent : 'color:var(--muted)'}">${r[1]}</button>`).join('')}
    </div>
    <div id="mBody"></div>
    <div style="height:10px"></div>`;

  keepStrip('metricas');
  document.querySelectorAll('[data-focus]').forEach(b => b.onclick = () => {
    S.settings.focus = b.dataset.focus; save(); SCREENS.metricas();
  });
  document.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { RANGE = +b.dataset.range; SCREENS.metricas(); });

  $('#mBody').innerHTML =
    f === 'general' ? viewGeneral(inRange) :
    f === 'pesas'   ? viewPesas(inRange) :
    f === 'libre'   ? viewLibre(inRange) : viewCardio(f, inRange);

  drawCharts();
};

const kpi = (v, k, d) => `<div class="kpi"><div class="v num">${v}</div><div class="k">${k}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`;
const chartBox = (title, id, sub) => `
  <div class="card" style="margin-top:10px">
    <div style="font-weight:700;font-size:14.5px">${title}</div>
    ${sub ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">${sub}</div>` : ''}
    <canvas id="${id}" height="150" style="margin-top:10px"></canvas>
  </div>`;

let CHARTS = [];

function viewGeneral(list) {
  const days = new Set(list.map(x => x.date)).size;
  const perMod = MODS.map(m => ({ m, n: list.filter(x => x.modality === m).length })).filter(x => x.n);
  const w = S.weights.slice().sort((a, b) => a.date < b.date ? 1 : -1);
  const dw = w.length > 1 ? round(w[0].kg - w[w.length - 1].kg, 1) : null;
  const streak = currentStreak();

  CHARTS = [{ id: 'cg1', type: 'bar', data: weeklyCount(list), color: '#EDF1F3', fmt: v => v + ' ses.' }];
  if (w.length > 1) CHARTS.push({ id: 'cg2', type: 'line', data: w.slice().reverse().map(x => ({ label: x.date.slice(5), v: x.kg })), color: MOD.pesas.hex, fmt: v => v + ' kg' });

  return `
    <div class="kpis">
      ${kpi(list.length, 'Sesiones', days + ' días activos')}
      ${kpi(streak, 'Semanas seguidas', 'con al menos 1 sesión')}
      ${kpi(round(list.length / Math.max(1, weeksIn()), 1), 'Sesiones/semana', 'promedio del período')}
      ${kpi(w.length ? w[0].kg + ' kg' : '—', 'Peso corporal', dw != null ? (dw > 0 ? '+' : '') + dw + ' kg en el registro' : 'sin datos')}
    </div>
    ${perMod.length ? `<div class="card" style="margin-top:10px">
      <div style="font-weight:700;font-size:14.5px;margin-bottom:9px">Reparto por modalidad</div>
      ${perMod.map(p => `<div class="row" style="margin-top:7px">
        <div style="width:96px;font-size:13.5px;color:var(--muted)">${MOD[p.m].ico} ${MOD[p.m].nm}</div>
        <div class="grow" style="height:8px;background:var(--surface2);border-radius:5px;overflow:hidden">
          <div style="height:100%;width:${Math.round(p.n / list.length * 100)}%;background:${MOD[p.m].hex}"></div></div>
        <div class="num" style="width:26px;text-align:right;font-size:13.5px">${p.n}</div>
      </div>`).join('')}
    </div>` : ''}
    ${chartBox('Sesiones por semana', 'cg1')}
    ${w.length > 1 ? chartBox('Peso corporal', 'cg2', 'todos los registros') : ''}`;
}

function viewPesas(list) {
  const ls = list.filter(x => x.modality === 'pesas');
  if (!ls.length) { CHARTS = []; return `<div class="empty">Sin sesiones de pesas en este período.</div>`; }
  const vol = ls.reduce((a, x) => a + volumeOf(x), 0);
  const sets = ls.reduce((a, x) => a + x.entries.reduce((b, e) => b + e.sets.length, 0), 0);
  const reps = ls.reduce((a, x) => a + x.entries.reduce((b, e) => b + e.sets.reduce((c, s) => c + (s.r || 0), 0), 0), 0);

  CHARTS = [{ id: 'cp1', type: 'bar', data: weeklySum(ls, volumeOf), color: MOD.pesas.hex, fmt: v => Math.round(v).toLocaleString('es') + ' kg' }];

  return `
    <div class="kpis">
      ${kpi(ls.length, 'Sesiones', round(vol / ls.length / 1000, 1) + 'k kg promedio')}
      ${kpi(Math.round(vol / 1000) + 'k', 'Volumen total (kg)', 'peso × reps')}
      ${kpi(sets, 'Series')}
      ${kpi(reps, 'Repeticiones')}
    </div>
    ${chartBox('Volumen por semana', 'cp1', 'kilos totales movidos')}
    <div class="card" style="margin-top:10px">
      <div style="font-weight:700;font-size:14.5px;margin-bottom:4px">Récords por ejercicio</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Mejor serie de todos los tiempos</div>
      ${prTable()}
    </div>`;
}

function prTable() {
  const best = {};
  S.sessions.filter(x => x.modality === 'pesas').forEach(x =>
    (x.entries || []).forEach(en => flatSets(en).forEach(st => {
      if (st.w == null || st.r == null) return;
      const e1 = st.w * (1 + st.r / 30); // Epley
      const cur = best[en.exerciseId];
      if (!cur || e1 > cur.e1) best[en.exerciseId] = { e1, w: st.w, r: st.r, date: x.date };
    })));
  const rows = Object.entries(best).sort((a, b) => b[1].e1 - a[1].e1).slice(0, 12);
  if (!rows.length) return '<div class="empty">Sin récords todavía.</div>';
  return rows.map(([id, b]) => `<div class="li">
      <div class="grow"><div class="nm">${esc(exName(id))}</div><div class="gp">${fmtDate(b.date)} · 1RM est. ${Math.round(b.e1)} kg</div></div>
      <div class="num" style="font-weight:700">${b.w}×${b.r}</div>
    </div>`).join('');
}

function viewCardio(m, list) {
  const ls = list.filter(x => x.modality === m);
  if (!ls.length) { CHARTS = []; return `<div class="empty">Sin sesiones de ${MOD[m].nm.toLowerCase()} en este período.</div>`; }
  const isSwim = m === 'natacion';
  const dist = ls.reduce((a, x) => a + (x.dist || 0), 0);
  const time = ls.reduce((a, x) => a + (x.durSec || 0), 0);
  const withBoth = ls.filter(x => x.dist && x.durSec);
  const hrs = ls.filter(x => x.hrAvg).map(x => x.hrAvg);
  const avgHr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;
  const unit = isSwim ? 'm' : 'km';

  let paceKPI = '—', paceLbl = isSwim ? 'Ritmo medio /100m' : (m === 'bici' ? 'Velocidad media' : 'Ritmo medio /km');
  if (withBoth.length) {
    const d = withBoth.reduce((a, x) => a + x.dist, 0), t = withBoth.reduce((a, x) => a + x.durSec, 0);
    paceKPI = m === 'bici' ? round(d / (t / 3600), 1) + ' km/h' : paceStr(t, isSwim ? d / 100 : d);
  }
  const longest = ls.slice().sort((a, b) => (b.dist || 0) - (a.dist || 0))[0];

  CHARTS = [{ id: 'cc1', type: 'bar', data: weeklySum(ls, x => x.dist || 0), color: MOD[m].hex, fmt: v => round(v, 1) + ' ' + unit }];
  if (withBoth.length > 1) {
    const pts = withBoth.slice().sort((a, b) => a.date < b.date ? -1 : 1).map(x => ({
      label: x.date.slice(5),
      v: m === 'bici' ? x.dist / (x.durSec / 3600) : x.durSec / (isSwim ? x.dist / 100 : x.dist) / 60
    }));
    CHARTS.push({ id: 'cc2', type: 'line', data: pts, color: MOD[m].hex, invert: m !== 'bici',
      fmt: v => m === 'bici' ? round(v, 1) + ' km/h' : `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}` });
  }

  return `
    <div class="kpis">
      ${kpi(round(dist, isSwim ? 0 : 1), 'Distancia total (' + unit + ')', ls.length + ' sesiones')}
      ${kpi(fmtTime(time), 'Tiempo en movimiento')}
      ${kpi(paceKPI, paceLbl)}
      ${kpi(avgHr ? avgHr : '—', 'FC promedio (ppm)', hrs.length ? hrs.length + ' sesiones con FC' : 'sin datos')}
    </div>
    ${longest && longest.dist ? `<div class="card" style="margin-top:10px">
      <div style="font-weight:700;font-size:14.5px">Sesión más larga</div>
      <div style="color:var(--muted);font-size:13.5px;margin-top:4px">${round(longest.dist, 2)} ${unit} · ${fmtTime(longest.durSec)} · ${fmtDate(longest.date)}</div>
    </div>` : ''}
    ${chartBox('Distancia por semana', 'cc1', unit + ' acumulados')}
    ${CHARTS.length > 1 ? chartBox(m === 'bici' ? 'Velocidad por sesión' : 'Ritmo por sesión', 'cc2', m === 'bici' ? 'km/h' : (isSwim ? 'min/100m — más abajo es más rápido' : 'min/km — más abajo es más rápido')) : ''}`;
}

function viewLibre(list) {
  const ls = list.filter(x => x.modality === 'libre');
  if (!ls.length) { CHARTS = []; return `<div class="empty">Sin actividades libres en este período.</div>`; }
  const time = ls.reduce((a, x) => a + (x.durSec || 0), 0);
  const byName = {};
  ls.forEach(x => { byName[x.name] = (byName[x.name] || 0) + 1; });
  CHARTS = [{ id: 'cl1', type: 'bar', data: weeklyCount(ls), color: MOD.libre.hex, fmt: v => v + ' ses.' }];
  const dist = ls.reduce((a, x) => a + (x.dist || 0), 0);
  return `
    <div class="kpis">
      ${kpi(ls.length, 'Actividades')}
      ${kpi(fmtTime(time), 'Tiempo total')}
      ${dist ? kpi(round(dist, 1), 'Distancia (km)') : ''}
    </div>
    <div class="card" style="margin-top:10px">
      <div style="font-weight:700;font-size:14.5px;margin-bottom:5px">Qué hiciste</div>
      ${Object.entries(byName).sort((a, b) => b[1] - a[1]).map(([n, c]) =>
        `<div class="li"><div class="grow nm">${esc(n)}</div><div class="num">${c}×</div></div>`).join('')}
    </div>
    ${chartBox('Actividades por semana', 'cl1')}`;
}

/* ---- agregación semanal ---- */
function weekKey(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const day = (dt.getDay() + 6) % 7; // lunes = 0
  dt.setDate(dt.getDate() - day);
  return todayISO(dt);
}
function weeksIn() {
  return RANGE === 0
    ? Math.max(1, Math.ceil((Date.now() - new Date(S.sessions.reduce((a, x) => x.date < a ? x.date : a, todayISO()))) / 6048e5))
    : RANGE / 7;
}
function weeklySum(list, fn) {
  const map = {};
  list.forEach(x => { const k = weekKey(x.date); map[k] = (map[k] || 0) + fn(x); });
  return bucketsFrom(map);
}
function weeklyCount(list) {
  const map = {};
  list.forEach(x => { const k = weekKey(x.date); map[k] = (map[k] || 0) + 1; });
  return bucketsFrom(map);
}
function bucketsFrom(map) {
  const keys = Object.keys(map).sort();
  if (!keys.length) return [];
  const out = [];
  let cur = new Date(keys[0]), end = new Date(weekKey(todayISO()));
  let guard = 0;
  while (cur <= end && guard++ < 120) {
    const k = todayISO(cur);
    out.push({ label: k.slice(8) + '/' + k.slice(5, 7), v: map[k] || 0 });
    cur.setDate(cur.getDate() + 7);
  }
  return out.slice(-16);
}
function currentStreak() {
  const weeks = new Set(S.sessions.map(x => weekKey(x.date)));
  let n = 0, cur = new Date(weekKey(todayISO()));
  while (weeks.has(todayISO(cur)) && n < 300) { n++; cur.setDate(cur.getDate() - 7); }
  return n;
}

/* ---- canvas ---- */
function drawCharts() {
  CHARTS.forEach(c => {
    const el = document.getElementById(c.id);
    if (!el || !c.data || !c.data.length) return;
    const dpr = window.devicePixelRatio || 1;
    const W = el.clientWidth, H = 150;
    el.width = W * dpr; el.height = H * dpr;
    const g = el.getContext('2d'); g.scale(dpr, dpr);
    g.clearRect(0, 0, W, H);

    const vals = c.data.map(d => d.v);
    let max = Math.max(...vals), min = Math.min(...vals);
    const padB = 18, padT = 16, padR = 2;
    if (c.type === 'bar') { min = 0; max = max || 1; }
    else { const sp = (max - min) || 1; max += sp * .15; min -= sp * .15; }
    const x = i => padR + (i + .5) * ((W - padR * 2) / c.data.length);
    const y = v => padT + (H - padT - padB) * (1 - (v - min) / ((max - min) || 1));

    g.font = '10px -apple-system,system-ui,sans-serif';
    g.textAlign = 'center';

    if (c.type === 'bar') {
      const bw = Math.max(4, Math.min(26, (W / c.data.length) * .62));
      c.data.forEach((d, i) => {
        const h = Math.max(d.v > 0 ? 2 : 0, (H - padT - padB) * (d.v / max));
        g.fillStyle = c.color;
        g.globalAlpha = d.v ? 1 : .18;
        const rx = x(i) - bw / 2, ry = H - padB - h;
        g.beginPath();
        if (g.roundRect) g.roundRect(rx, ry, bw, h || 2, 3); else g.rect(rx, ry, bw, h || 2);
        g.fill();
        g.globalAlpha = 1;
      });
    } else {
      g.strokeStyle = c.color; g.lineWidth = 2; g.lineJoin = 'round';
      g.beginPath();
      c.data.forEach((d, i) => i ? g.lineTo(x(i), y(d.v)) : g.moveTo(x(i), y(d.v)));
      g.stroke();
      g.fillStyle = c.color;
      c.data.forEach((d, i) => { g.beginPath(); g.arc(x(i), y(d.v), 2.6, 0, 7); g.fill(); });
    }

    g.fillStyle = '#5C6773';
    const step = Math.ceil(c.data.length / 6);
    c.data.forEach((d, i) => { if (i % step === 0 || i === c.data.length - 1) g.fillText(d.label, x(i), H - 4); });

    const lastV = vals[vals.length - 1];
    g.fillStyle = '#8C98A3'; g.textAlign = 'right';
    g.fillText(c.fmt ? c.fmt(lastV) : String(round(lastV, 1)), W - 2, 10);
  });
}
window.addEventListener('resize', () => { if (TAB === 'metricas') drawCharts(); });

/* ==================================================================
   PANTALLA: AJUSTES
   ================================================================== */

SCREENS.ajustes = function () {
  $('#hTitle').textContent = 'Ajustes';
  $('#hSub').textContent = `${EX.length} ejercicios · ${S.routines.length} rutinas · ${S.sessions.length} sesiones`;
  $('#view').innerHTML = `
    <div class="card">
      <div style="font-weight:700;font-size:15px">Ejercicios</div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:2px;margin-bottom:10px">${(window.EX_CATALOG || []).length} ejercicios de base + los tuyos</div>
      <button class="btn wide" id="aEx">Administrar ejercicios</button>
    </div>
    <div class="card">
      <div style="font-weight:700;font-size:15px">Rutinas</div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:2px;margin-bottom:10px">Plantillas que se cargan solas al empezar</div>
      <button class="btn wide" id="aRt">Administrar rutinas</button>
    </div>
    <div class="card">
      <div style="font-weight:700;font-size:15px">Peso corporal</div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:2px;margin-bottom:10px">${S.weights.length ? S.weights.length + ' registros' : 'Sin registros'}</div>
      <button class="btn wide" id="aW">Registrar peso</button>
    </div>
    <div class="card">
      <div style="font-weight:700;font-size:15px">Tus datos</div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:2px;margin-bottom:10px">Todo se guarda en este navegador. Hacé un backup de vez en cuando.</div>
      <button class="btn wide" id="aXls">Exportar a Excel</button>
      <button class="btn wide" style="margin-top:8px" id="aJson">Descargar backup (.json)</button>
      <button class="btn wide" style="margin-top:8px" id="aImp">Restaurar desde backup</button>
      <input type="file" id="aFile" accept="application/json,.json" class="hide">
      <div class="hr"></div>
      <button class="btn wide danger" id="aWipe">Borrar todos los datos</button>
    </div>
    <div style="text-align:center;color:var(--faint);font-size:12px;margin:16px 0 6px">Entreno · datos locales, sin cuentas ni nube</div>`;

  $('#aEx').onclick = () => exerciseManager('');
  $('#aRt').onclick = routineManager;
  $('#aW').onclick = weightSheet;
  $('#aXls').onclick = exportXlsx;
  $('#aJson').onclick = exportJson;
  $('#aImp').onclick = () => $('#aFile').click();
  $('#aFile').onchange = importJson;
  $('#aWipe').onclick = () => confirmAsk('Se borra todo: sesiones, ejercicios y pesos. No se puede deshacer.', 'Borrar todo', () => {
    S = seed(); saveNow(); toast('Datos borrados'); go('hoy');
  });
};

/* ---- ejercicios ---- */
function exerciseManager(q) {
  if (typeof q !== 'string') q = '';
  const { total, list } = searchEx(q, 30);
  const u = usageMap();
  const hidden = (S.hidden || []).length;
  openSheet(`
    <h2>Ejercicios</h2>
    <input id="emQ" placeholder="Buscar entre ${EX.length}" value="${esc(q)}" autocomplete="off">
    <button class="btn wide" style="margin-top:8px" id="emNew">Crear ejercicio propio</button>
    <div style="margin-top:6px">${list.length ? list.map(e => `
      <div class="li">
        <div class="grow"><div class="nm">${esc(e.name)}</div>
        <div class="gp">${esc(e.group || 'Sin grupo')}${u[e.id] ? ' · usado ' + u[e.id] + '×' : ''}${e.cat ? '' : ' · propio'}</div></div>
        <button class="btn sm" data-edit="${e.id}">Editar</button>
      </div>`).join('') + (total > list.length
        ? `<div style="color:var(--faint);font-size:12.5px;padding:10px 0;text-align:center">+${total - list.length} más. Escribí para afinar.</div>` : '')
      : '<div class="empty">Nada encontrado.</div>'}</div>
    ${hidden ? `<div class="hr"></div><button class="btn wide" id="emRestore">Mostrar los ${hidden} ejercicios ocultos</button>` : ''}`);

  const inp = $('#emQ');
  inp.oninput = e => {
    const v = e.target.value;
    exerciseManager(v);
    const i = $('#emQ'); i.focus(); i.setSelectionRange(v.length, v.length);
  };
  $('#emNew').onclick = () => exerciseEditor(null);
  const rb = $('#emRestore');
  if (rb) rb.onclick = () => { S.hidden = []; save(); toast('Ejercicios restaurados'); exerciseManager(q); };
  $('#sheet').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => exerciseEditor(b.dataset.edit));
}

function countUses(id) {
  let n = 0;
  S.sessions.forEach(x => (x.entries || []).forEach(en => { if (en.exerciseId === id) n += en.sets.length; }));
  return n;
}

function exerciseEditor(id) {
  const ex = id ? (exLookup(id) || { name: '', group: '' }) : { name: '', group: '' };
  const isCat = id && String(id).indexOf('c:') === 0;
  openSheet(`
    <h2>${id ? 'Editar ejercicio' : 'Nuevo ejercicio'}</h2>
    <div class="field"><label class="label">Nombre</label><input id="eeN" value="${esc(ex.name)}" placeholder="Press de banca con barra"></div>
    <div class="field"><label class="label">Grupo muscular</label>
      <select id="eeG"><option value="">Sin grupo</option>${GROUPS.map(g => `<option ${g === ex.group ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
    ${id ? `<div style="color:var(--faint);font-size:12.5px;margin-top:8px">${countUses(id)} series registradas${isCat ? ' · es del catálogo, el nombre nuevo se aplica solo para vos' : ''}</div>` : ''}
    <button class="btn primary wide" style="margin-top:12px;--accent:var(--pesas)" id="eeS">Guardar</button>
    ${id ? `<button class="btn wide danger" style="margin-top:8px" id="eeD">${isCat ? 'Ocultar de la biblioteca' : 'Borrar ejercicio'}</button>` : ''}`);

  $('#eeS').onclick = () => {
    const name = $('#eeN').value.trim(), group = $('#eeG').value;
    if (!name) { toast('Falta el nombre'); return; }
    if (!id) S.custom.push({ id: uid(), name, group });
    else if (isCat) S.overrides[id] = { name, group };
    else { const c = S.custom.find(x => x.id === id); if (c) { c.name = name; c.group = group; } }
    save(); toast('Guardado'); exerciseManager('');
  };

  if (id) $('#eeD').onclick = () => confirmAsk(
    isCat ? `“${ex.name}” se oculta del buscador. Las sesiones viejas lo siguen mostrando.`
          : `¿Borrar “${ex.name}”? Las sesiones viejas lo van a mostrar como borrado.`,
    isCat ? 'Ocultar' : 'Borrar', () => {
      if (isCat) { S.hidden = (S.hidden || []).concat([id]); }
      else {
        S.custom = S.custom.filter(e => e.id !== id);
        S.routines.forEach(r => r.exerciseIds = r.exerciseIds.filter(x => x !== id));
      }
      save(); toast(isCat ? 'Ejercicio oculto' : 'Ejercicio borrado'); exerciseManager('');
    });
}

/* ---- rutinas ---- */
function routineManager() {
  openSheet(`
    <h2>Rutinas</h2>
    <button class="btn wide" id="rmNew">Nueva rutina</button>
    <div style="margin-top:6px">${S.routines.length ? S.routines.map(r => `
      <div class="li">
        <div class="grow"><div class="nm">${esc(r.name)}</div><div class="gp">${r.exerciseIds.length} ejercicios</div></div>
        <button class="btn sm" data-rt="${r.id}">Editar</button>
      </div>`).join('') : '<div class="empty">Sin rutinas. Creá una para no cargar los ejercicios a mano cada vez.</div>'}</div>`);
  $('#rmNew').onclick = () => routineEditor(null);
  $('#sheet').querySelectorAll('[data-rt]').forEach(b => b.onclick = () => routineEditor(b.dataset.rt));
}
let RDRAFT = null;
function routineEditor(id) {
  if (!RDRAFT || RDRAFT.id !== id) {
    const r = S.routines.find(x => x.id === id);
    RDRAFT = r ? JSON.parse(JSON.stringify(r)) : { id: null, name: '', exerciseIds: [] };
  }
  openSheet(`
    <h2>${id ? 'Editar rutina' : 'Nueva rutina'}</h2>
    <div class="field"><label class="label">Nombre</label><input id="reN" value="${esc(RDRAFT.name)}" placeholder="Push, Pull, Legs..."></div>
    <div class="hr"></div>
    <div class="label">Ejercicios en la rutina (en orden)</div>
    ${RDRAFT.exerciseIds.length ? RDRAFT.exerciseIds.map((eid, i) => `
      <div class="li">
        <div class="grow nm">${i + 1}. ${esc(exName(eid))}</div>
        <button class="x" data-up="${i}">↑</button>
        <button class="x" data-down="${i}">↓</button>
        <button class="x" data-rm="${i}">✕</button>
      </div>`).join('') : '<div style="color:var(--faint);font-size:13.5px;padding:8px 0">Todavía ninguno</div>'}
    <button class="btn wide" style="margin-top:10px" id="reAdd">Agregar ejercicio</button>
    <button class="btn primary wide" style="margin-top:12px;--accent:var(--pesas)" id="reS">Guardar rutina</button>
    ${id ? '<button class="btn wide danger" style="margin-top:8px" id="reD">Borrar rutina</button>' : ''}`);

  $('#reN').oninput = e => { RDRAFT.name = e.target.value; };
  $('#reAdd').onclick = () => { EQ = ''; exSearchSheet('Agregar a la rutina', eid => { RDRAFT.exerciseIds.push(eid); routineEditor(id); }); };
  $('#sheet').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { RDRAFT.exerciseIds.splice(+b.dataset.rm, 1); routineEditor(id); });
  $('#sheet').querySelectorAll('[data-up]').forEach(b => b.onclick = () => {
    const i = +b.dataset.up; if (i === 0) return;
    const a = RDRAFT.exerciseIds; [a[i - 1], a[i]] = [a[i], a[i - 1]]; routineEditor(id);
  });
  $('#sheet').querySelectorAll('[data-down]').forEach(b => b.onclick = () => {
    const i = +b.dataset.down, a = RDRAFT.exerciseIds;
    if (i >= a.length - 1) return;
    [a[i + 1], a[i]] = [a[i], a[i + 1]]; routineEditor(id);
  });
  $('#reS').onclick = () => {
    if (!RDRAFT.name.trim()) { toast('Falta el nombre'); return; }
    if (id) { const r = S.routines.find(x => x.id === id); r.name = RDRAFT.name.trim(); r.exerciseIds = RDRAFT.exerciseIds; }
    else S.routines.push({ id: uid(), name: RDRAFT.name.trim(), exerciseIds: RDRAFT.exerciseIds });
    RDRAFT = null; saveNow(); toast('Rutina guardada'); routineManager(); render();
  };
  if (id) $('#reD').onclick = () => confirmAsk('¿Borrar esta rutina?', 'Borrar', () => {
    S.routines = S.routines.filter(r => r.id !== id); RDRAFT = null; saveNow(); toast('Rutina borrada'); routineManager();
  });
}

/* ==================================================================
   EXPORTAR
   ================================================================== */

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
}

function exportJson() {
  const stamp = todayISO();
  download(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }), `entreno-backup-${stamp}.json`);
  toast('Backup descargado');
}

function importJson(e) {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d || !Array.isArray(d.sessions)) throw new Error('formato');
      confirmAsk(`El backup tiene ${d.sessions.length} sesiones. Reemplaza todo lo que tenés ahora.`, 'Restaurar', () => {
        S = Object.assign(seed(), d);
        S.settings = Object.assign({ focus: 'pesas' }, d.settings || {});
        saveNow(); toast('Backup restaurado'); go('diario');
      });
    } catch (err) { toast('Ese archivo no es un backup válido'); }
    e.target.value = '';
  };
  r.readAsText(f);
}

function exportXlsx() {
  if (typeof XLSX === 'undefined') { toast('Recargá la app y probá de nuevo'); return; }
  const wb = XLSX.utils.book_new();
  const add = (rows, name) => {
    if (!rows.length) return;
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(10, Math.min(28, k.length + 6)) }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  const ord = sessionsSorted().slice().reverse();

  /* Resumen */
  add(ord.map(x => ({
    Fecha: x.date, Modalidad: MOD[x.modality].nm, Sesión: sessionTitle(x),
    'Duración': x.durSec ? fmtTime(x.durSec) : '',
    'Distancia': x.dist != null ? x.dist : '',
    'Unidad': CARDIO.includes(x.modality) ? (x.modality === 'natacion' ? 'm' : 'km') : '',
    'Volumen (kg)': x.modality === 'pesas' ? Math.round(volumeOf(x)) : '',
    'FC prom': x.hrAvg || '', Notas: x.notes || ''
  })), 'Resumen');

  /* Pesas: una fila por serie */
  const pes = [];
  ord.filter(x => x.modality === 'pesas').forEach(x =>
    (x.entries || []).forEach(en => (en.sets || []).forEach((st, j) => {
      const fila = (peso, reps, lado) => pes.push({
        Fecha: x.date, Sesión: sessionTitle(x), Ejercicio: exName(en.exerciseId),
        Serie: j + 1, Lado: lado,
        'Peso (kg)': peso != null ? peso : '', Reps: reps != null ? reps : '',
        'Volumen (kg)': (peso != null && reps != null) ? round(peso * reps, 1) : '', Notas: x.notes || ''
      });
      if (en.uni) { fila(st.w, st.r, 'Izquierda'); fila(st.w2, st.r2, 'Derecha'); }
      else fila(st.w, st.r, '');
    })));
  add(pes, 'Pesas');

  /* Cardio */
  CARDIO.forEach(m => {
    const rows = ord.filter(x => x.modality === m).map(x => {
      const r = {
        Fecha: x.date,
        [m === 'natacion' ? 'Distancia (m)' : 'Distancia (km)']: x.dist != null ? x.dist : '',
        'Tiempo': x.durSec ? fmtTime(x.durSec) : '',
        'Tiempo (s)': x.durSec || '',
        [m === 'bici' ? 'Velocidad (km/h)' : (m === 'natacion' ? 'Ritmo /100m' : 'Ritmo /km')]: paceOf(x) === '—' ? '' : paceOf(x).replace(' /km', '').replace(' /100m', '').replace(' km/h', ''),
        'FC prom': x.hrAvg || ''
      };
      if (m === 'natacion') r.Estilo = x.style || '';
      (OPT[m] || []).forEach(o => { r[o[1]] = (x.opt && x.opt[o[0]]) || ''; });
      r.Notas = x.notes || '';
      return r;
    });
    add(rows, MOD[m].nm);
  });

  /* Libre y peso */
  add(ord.filter(x => x.modality === 'libre').map(x => {
    const r = {
      Fecha: x.date, Actividad: x.name || '', 'Duración': x.durSec ? fmtTime(x.durSec) : '',
      Intensidad: x.intensity || '',
      'Distancia (km)': x.dist != null ? x.dist : '',
      'Ritmo /km': x.dist && x.durSec ? paceStr(x.durSec, x.dist) : '',
      'FC prom': x.hrAvg || ''
    };
    OPT.libre.filter(o => !OPT_ROOT[o[0]]).forEach(o => { r[o[1]] = (x.opt && x.opt[o[0]]) || ''; });
    r.Notas = x.notes || '';
    return r;
  }), 'Libre');
  add(S.weights.slice().sort((a, b) => a.date < b.date ? -1 : 1).map(w => ({ Fecha: w.date, 'Peso (kg)': w.kg })), 'Peso corporal');

  if (!wb.SheetNames.length) { toast('Todavía no hay nada para exportar'); return; }
  try {
    XLSX.writeFile(wb, `entreno-${todayISO()}.xlsx`);
    toast('Excel exportado');
  } catch (err) { toast('No se pudo exportar'); }
}


/* ==================================================================
   PANTALLA: COACH
   Dos capas: análisis de tus propios datos (siempre, offline) y
   un chat con IA opcional si cargás tu API key de Anthropic.
   ================================================================== */

const DAY = 864e5;
const daysAgo = iso => Math.round((new Date(todayISO()) - new Date(iso)) / DAY);
const e1rm = st => (st.w != null && st.r != null) ? st.w * (1 + st.r / 30) : 0;

/* historial por ejercicio: una entrada por sesión, de la más nueva a la más vieja */
function exHistory(id) {
  return S.sessions.filter(x => x.modality === 'pesas' && (x.entries || []).some(e => e.exerciseId === id))
    .map(x => {
      const sets = x.entries.filter(e => e.exerciseId === id).reduce((a, e) => a.concat(flatSets(e)), []);
      if (!sets.length) return null;
      const top = sets.reduce((a, b) => e1rm(b) > e1rm(a) ? b : a);
      const topW = Math.max.apply(null, sets.map(st => st.w));
      const atTop = sets.filter(st => st.w === topW);
      return { date: x.date, sets, top, e1: e1rm(top), topW,
        minRepsAtTop: Math.min.apply(null, atTop.map(st => st.r)), nSets: sets.length };
    }).filter(Boolean).sort((a, b) => a.date < b.date ? 1 : -1);
}

function alternativesFor(id, n) {
  const g = exGroup(id), used = new Set();
  S.sessions.filter(x => x.date >= todayISO(new Date(Date.now() - 30 * DAY)))
    .forEach(x => (x.entries || []).forEach(e => used.add(e.exerciseId)));
  const base = (exLookup(id) || {}).name || '';
  const stem = norm(base).split(' ').slice(0, 2).join(' ');
  return EX.filter(e => e.group === g && !used.has(e.id) && e.s.indexOf(stem) !== 0)
    .sort(() => Math.random() - .5).slice(0, n || 2).map(e => e.name);
}

/* ---------- reglas ---------- */
function advicePesas() {
  const out = [];
  const recent = S.sessions.filter(x => x.modality === 'pesas' && daysAgo(x.date) <= 45);
  const ids = [...new Set(recent.reduce((a, x) => a.concat((x.entries || []).map(e => e.exerciseId)), []))];

  ids.forEach(id => {
    const h = exHistory(id);
    if (!h.length) return;
    const name = exName(id), step = STEP[exGroup(id)] || 2.5;
    const last = h[0];

    if (last.minRepsAtTop >= 12 && last.topW > 0) {
      out.push({ lvl: 'up', t: `Subí el peso en ${name}`,
        d: `La última vez hiciste todas las series con ${last.topW} kg a ${last.minRepsAtTop}+ reps. Probá ${round(last.topW + step, 2)} kg y volvé a 8 reps.` });
      return;
    }
    if (h.length >= 3) {
      const [a, b, c] = h;
      const stalled = a.e1 <= b.e1 * 1.01 && b.e1 <= c.e1 * 1.01;
      if (stalled && daysAgo(c.date) <= 45) {
        const alt = alternativesFor(id, 2);
        out.push({ lvl: 'stall', t: `${name} está estancado`,
          d: `Tres sesiones sin mejorar (1RM estimado ~${Math.round(a.e1)} kg). Dos caminos: bajá un 10% el peso y subí de a poco otra vez, o cambiá de variante unas semanas${alt.length ? ' — probá ' + alt.join(' o ') : ''}.` });
        return;
      }
    }
    if (h.length >= 2 && h[0].e1 > h[1].e1 * 1.02) {
      out.push({ lvl: 'ok', t: `${name} viene subiendo`, d: `1RM estimado pasó de ${Math.round(h[1].e1)} a ${Math.round(h[0].e1)} kg. Mantené el esquema, está funcionando.` });
    }
  });

  /* ejercicios de rutina abandonados */
  const inRoutines = [...new Set(S.routines.reduce((a, r) => a.concat(r.exerciseIds), []))];
  inRoutines.forEach(id => {
    const h = exHistory(id);
    if (!h.length) return;
    const d = daysAgo(h[0].date);
    if (d >= 21 && d <= 120) out.push({ lvl: 'warn', t: `Hace ${d} días que no hacés ${exName(id)}`, d: 'Está en una de tus rutinas. Si lo dejaste a propósito, sacalo de la rutina para que el diario refleje lo que hacés.' });
  });

  /* volumen semanal por grupo */
  const wk = S.sessions.filter(x => x.modality === 'pesas' && daysAgo(x.date) <= 7);
  const byGroup = {};
  wk.forEach(x => (x.entries || []).forEach(e => {
    const g = exGroup(e.exerciseId) || 'Sin grupo';
    byGroup[g] = (byGroup[g] || 0) + e.sets.length;
  }));
  Object.keys(byGroup).forEach(g => {
    if (g === 'Sin grupo' || g === 'Movilidad') return;
    if (byGroup[g] > 25) out.push({ lvl: 'warn', t: `Mucho volumen en ${g}`, d: `${byGroup[g]} series en 7 días. Arriba de ~22 series semanales por grupo la recuperación suele ser el cuello de botella.` });
  });
  const trained = Object.keys(byGroup);
  if (trained.length >= 3) {
    const low = trained.filter(g => byGroup[g] > 0 && byGroup[g] < 6 && g !== 'Movilidad' && g !== 'Sin grupo');
    if (low.length) out.push({ lvl: 'info', t: `Poco volumen en ${low.join(', ')}`, d: 'Menos de 6 series semanales alcanza para mantener, pero queda corto para crecer. El rango típico es 10 a 20.' });
  }
  return out;
}

function adviceCardio() {
  const out = [];
  CARDIO.concat(['libre']).forEach(m => {
    const wk = S.sessions.filter(x => x.modality === m && daysAgo(x.date) <= 7 && x.dist);
    const prev = S.sessions.filter(x => x.modality === m && daysAgo(x.date) > 7 && daysAgo(x.date) <= 14 && x.dist);
    if (!wk.length || !prev.length) return;
    const a = wk.reduce((t, x) => t + x.dist, 0), b = prev.reduce((t, x) => t + x.dist, 0);
    const u = m === 'natacion' ? 'm' : 'km';
    if (a > b * 1.25) out.push({ lvl: 'warn', t: `Saltaste mucho el volumen de ${MOD[m].nm.toLowerCase()}`,
      d: `${round(a, 1)} ${u} esta semana contra ${round(b, 1)} la anterior (+${Math.round((a / b - 1) * 100)}%). Subir más del 10% semanal es la forma clásica de terminar lesionado.` });
    if (a < b * .6) out.push({ lvl: 'info', t: `Bajó el volumen de ${MOD[m].nm.toLowerCase()}`, d: `De ${round(b, 1)} a ${round(a, 1)} ${u}. Si no fue una semana de descarga planificada, revisá qué pasó.` });
  });

  /* distribución de intensidad en running */
  const runs = S.sessions.filter(x => x.modality === 'running' && x.hrAvg && daysAgo(x.date) <= 28);
  if (runs.length >= 4) {
    const maxHr = Math.max.apply(null, S.sessions.filter(x => x.hrAvg).map(x => x.hrAvg));
    const duras = runs.filter(x => x.hrAvg > maxHr * .88).length;
    const pct = Math.round(duras / runs.length * 100);
    if (pct > 40) out.push({ lvl: 'warn', t: 'Corrés casi siempre fuerte',
      d: `${pct}% de tus salidas del último mes fueron a FC alta. El reparto que mejor funciona es cerca de 80% suave y 20% fuerte: la mayoría de los kilómetros deberían dejarte charlar.` });
    else if (pct < 5 && runs.length >= 6) out.push({ lvl: 'info', t: 'Todo a ritmo cómodo',
      d: 'Ninguna salida intensa en el último mes. Una sesión semanal de series o un tramo a ritmo fuerte es lo que mueve el techo aeróbico.' });
  }
  return out;
}

function adviceGeneral() {
  const out = [];
  const dates = [...new Set(S.sessions.map(x => x.date))].sort().reverse();
  if (!dates.length) return out;

  /* días seguidos sin descanso */
  let streak = 0, cur = new Date(todayISO());
  if (dates[0] === todayISO() || daysAgo(dates[0]) === 1) {
    let d = new Date(dates[0]);
    while (dates.indexOf(todayISO(d)) >= 0 && streak < 30) { streak++; d.setDate(d.getDate() - 1); }
  }
  if (streak >= 7) out.push({ lvl: 'warn', t: `${streak} días seguidos entrenando`, d: 'El progreso pasa en la recuperación. Un día off completo, o al menos uno muy suave, te va a hacer rendir más la semana que viene.' });

  const d0 = daysAgo(dates[0]);
  if (d0 >= 5) out.push({ lvl: 'info', t: `Hace ${d0} días que no registrás nada`, d: 'Volver con algo corto y fácil funciona mejor que esperar el día perfecto para la sesión completa.' });

  /* peso corporal */
  const w = S.weights.slice().sort((a, b) => a.date < b.date ? 1 : -1);
  if (w.length >= 2) {
    const recientes = w.filter(x => daysAgo(x.date) <= 28);
    if (recientes.length >= 2) {
      const a = recientes[0], b = recientes[recientes.length - 1];
      const dias = Math.max(1, daysAgo(b.date) - daysAgo(a.date));
      const porSemana = (a.kg - b.kg) / dias * 7;
      if (porSemana < -0.01 * a.kg) out.push({ lvl: 'warn', t: 'Estás bajando rápido',
        d: `${round(Math.abs(porSemana), 2)} kg por semana. Arriba del 1% del peso corporal semanal se pierde más músculo del necesario y la fuerza lo acusa.` });
      else if (Math.abs(porSemana) < 0.05 && recientes.length >= 3) out.push({ lvl: 'info', t: 'Peso estable',
        d: `${a.kg} kg, sin cambios en el último mes. Si buscabas subir o bajar, el punto de partida es ajustar comida, no entrenamiento.` });
    }
  } else if (!w.length) {
    out.push({ lvl: 'info', t: 'No registrás peso corporal', d: 'Un dato por semana alcanza para leer las tendencias y saber si la fuerza sube por carga o por peso.' });
  }
  return out;
}

function allAdvice() {
  const rank = { up: 0, stall: 1, warn: 2, info: 3, ok: 4 };
  return advicePesas().concat(adviceCardio(), adviceGeneral())
    .sort((a, b) => rank[a.lvl] - rank[b.lvl]);
}

const LVL = {
  up:    { c: '#45C8A0', n: 'Subir carga' },
  stall: { c: '#E8A33D', n: 'Estancado' },
  warn:  { c: '#FF7A59', n: 'Atención' },
  info:  { c: '#4FA8E8', n: 'Dato' },
  ok:    { c: '#45C8A0', n: 'Va bien' }
};

/* ---------- pantalla ---------- */
/* ---------- próxima sesión de pesas, con pesos ya calculados ---------- */
function nextSession() {
  if (!S.routines.length) return null;
  const lastOf = r => {
    const ses = S.sessions.filter(x => x.modality === 'pesas' && (x.routineId === r.id || x.name === r.name));
    return ses.length ? ses.sort((a, b) => a.date < b.date ? 1 : -1)[0].date : '0000-00-00';
  };
  const r = S.routines.slice().sort((a, b) => lastOf(a) < lastOf(b) ? -1 : 1)[0];
  const last = lastOf(r);
  const items = r.exerciseIds.slice(0, 10).map(id => {
    const h = exHistory(id), step = STEP[exGroup(id)] || 2.5;
    if (!h.length) return { n: exName(id), s: 'Primera vez: buscá un peso que te deje 2 reps en el tanque.' };
    const l = h[0];
    if (l.minRepsAtTop >= 12) return { n: exName(id), s: `${round(l.topW + step, 2)} kg × 8 — subiste de ${l.topW} kg`, up: true };
    return { n: exName(id), s: `${l.topW} kg × ${l.minRepsAtTop + 1} — la última fueron ${l.minRepsAtTop} reps` };
  });
  return { routine: r, last, items };
}

SCREENS.coach = function () {
  $('#hTitle').textContent = 'Coach';
  $('#hSub').textContent = 'Todo calculado con tus propios datos';
  const list = allAdvice();
  const nx = nextSession();

  $('#view').innerHTML = `
    ${S.sessions.length < 2 ? '<div class="empty">Cargá unas cuantas sesiones y acá vas a ver qué subir, qué cambiar y qué frenar.</div>' : ''}
    ${list.map(a => `
      <div class="card" style="border-left:3px solid ${LVL[a.lvl].c}">
        <div class="tag" style="background:${LVL[a.lvl].c}22;color:${LVL[a.lvl].c};display:inline-block">${LVL[a.lvl].n}</div>
        <div style="font-weight:700;font-size:15px;margin-top:7px">${esc(a.t)}</div>
        <div style="font-size:13.5px;color:var(--muted);line-height:1.55;margin-top:4px">${esc(a.d)}</div>
      </div>`).join('')}
    ${nx ? `
    <div class="card" style="margin-top:14px">
      <div style="font-weight:700;font-size:15px">Te toca ${esc(nx.routine.name)}</div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:2px">
        ${nx.last === '0000-00-00' ? 'Todavía no la hiciste' : 'La última vez fue ' + fmtDate(nx.last).toLowerCase()} · es la rutina que más tiempo lleva sin tocar
      </div>
      <div class="hr"></div>
      ${nx.items.map(i => `<div class="li">
          <div class="grow"><div class="nm">${esc(i.n)}</div><div class="gp">${esc(i.s)}</div></div>
          ${i.up ? '<div class="tag" style="background:#45C8A022;color:#45C8A0">subir</div>' : ''}
        </div>`).join('')}
      <button class="btn primary wide" style="margin-top:12px;--accent:var(--pesas)" id="cStart">Empezar esta sesión</button>
    </div>` : ''}
    <div style="height:10px"></div>`;

  const b = $('#cStart');
  if (b) b.onclick = () => {
    openForm('pesas', null);
    D.routineId = nx.routine.id;
    D.name = nx.routine.name;
    nx.routine.exerciseIds.forEach(id => D.entries.push({ exerciseId: id, sets: [{ w: null, r: null }] }));
    SCREENS.form();
  };
};

/* ==================================================================
   INICIO
   ================================================================== */

go('hoy');

})();
