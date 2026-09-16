/* Pruebas de extremo a extremo con jsdom.
   Uso: npm i jsdom xlsx && node tests/e2e.js                        */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const XLSX = require('xlsx');

const raw = fs.readFileSync('public/index.html', 'utf8');
const html = raw.replace(/<script src="\/vendor[^"]*"[^>]*><\/script>/, '');
const js = fs.readFileSync('public/app.js', 'utf8');

const store = {};
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://x.test/' });
const w = dom.window;
Object.defineProperty(w, 'localStorage', { value: {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
}});
w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {}, set: () => true });
let wrote = null;
w.XLSX = Object.assign({}, XLSX, { writeFile: (wb, n) => { wrote = { wb, n }; } });

/* estado en formato v1, para probar la migración */
store['entreno.v1'] = JSON.stringify({
  version: 1,
  exercises: [{ id: 'old1', name: 'Press banca', group: 'Pecho' },
              { id: 'old2', name: 'Sentadilla con barra', group: 'Cuádriceps' }],
  routines: [{ id: 'r1', name: 'Vieja', exerciseIds: ['old1'] }],
  sessions: [{ id: 's1', created: 1, date: '2026-01-10', modality: 'pesas', name: 'Vieja',
    entries: [{ exerciseId: 'old2', sets: [{ w: 100, r: 5 }] }], notes: '' }],
  weights: [], settings: { focus: 'pesas', apiKey: 'sk-ant-vieja' }
});

w.eval(fs.readFileSync('public/catalog.js', 'utf8'));
w.eval(js);

const $ = s => w.document.querySelector(s);
const $$ = s => [...w.document.querySelectorAll(s)];
const click = el => { if (!el) throw new Error('elemento inexistente'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const type = (el, v) => { if (!el) throw new Error('input inexistente'); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const change = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
const tab = t => click($(`#nav button[data-tab="${t}"]`));
const st = () => JSON.parse(store['entreno.v1']);
const tick = () => new Promise(r => setTimeout(r, 40));
const back = async () => { w.history.back(); await tick(); };

const R = [], pend = [];
const t = (n, f) => pend.push([n, f]);

/* ---------------- offline y migración ---------------- */
t('sin dependencias de red', () => {
  const limpio = js.replace('delete S.settings.apiKey;', '');
  ['fetch(', 'anthropic', 'apiKey', 'XMLHttpRequest'].forEach(x => { if (limpio.includes(x)) throw new Error(x); });
  if (/src="https?:/.test(raw)) throw new Error('CDN en el HTML');
});
t('migra el estado viejo y borra la key', () => {
  const S = st();
  if (S.version !== 2) throw new Error('no migró');
  if (S.settings.apiKey) throw new Error('key no borrada');
  if (S.sessions[0].entries[0].exerciseId !== 'c:sentadilla con barra') throw new Error('no mapeó al catálogo');
  if (S.routines[0].exerciseIds[0] !== 'old1') throw new Error('rutina vieja rota');
  tab('diario');
  if ($('#view').textContent.includes('borrado')) throw new Error('referencias rotas');
});
t('reset', () => { tab('ajustes'); click($('#aWipe')); click($('#cfOk')); if (st().sessions.length) throw new Error('no borró'); });

/* ---------------- layout ---------------- */
t('la barra inferior no usa blur y el contenido no queda debajo', () => {
  const nav = raw.slice(raw.indexOf('nav{'), raw.indexOf('nav button{'));
  if (nav.includes('backdrop-filter')) throw new Error('sigue el blur');
  if (!nav.includes('translateZ(0)')) throw new Error('sin capa propia');
  if (!raw.includes('padding-bottom:calc(84px + var(--safe-b))')) throw new Error('falta espacio para la barra');
});
t('el campo de fecha tiene alto propio y alineación', () => {
  if (!raw.includes('input[type="date"]::-webkit-date-and-time-value')) throw new Error('sin el arreglo de iOS');
});

/* ---------------- tiempos ---------------- */
t('el tiempo se carga en tres casillas numéricas', () => {
  tab('hoy'); click($$('.pick button')[1]);
  if ($('#cDur')) throw new Error('quedó el campo de texto viejo');
  if ($('#cDurM').getAttribute('inputmode') !== 'numeric') throw new Error('teclado equivocado');
  type($('#cDist'), '8.4'); type($('#cDurM'), '45'); type($('#cDurS'), '30');
  if ($('#paceOut').textContent.trim() !== '5:25 /km') throw new Error('ritmo: ' + $('#paceOut').textContent);
  click($('#fSave'));
  if (st().sessions[0].durSec !== 2730) throw new Error('segundos mal');
});
t('reabrir reparte el tiempo en las casillas', () => {
  tab('diario'); click($('.sesh')); click($('#dEdit'));
  if ($('#cDurM').value !== '45' || $('#cDurS').value !== '30') throw new Error('no reparte');
  click($('#back'));
});

/* ---------------- navegación ---------------- */
t('el botón atrás vuelve a la pestaña anterior', async () => {
  tab('metricas'); tab('hoy'); click($$('.pick button')[0]);
  if ($('#back').classList.contains('hide')) throw new Error('no se ve');
  click($('#back'));
  if ($('#hTitle').textContent !== 'Entrenar') throw new Error('volvió a ' + $('#hTitle').textContent);
});
t('el gesto del sistema cierra hoja y después formulario', async () => {
  tab('hoy'); click($$('.pick button')[0]); click($('#addEx'));
  await tick();
  if (!$('#sheet').classList.contains('on')) throw new Error('no abrió la hoja');
  await back();
  if ($('#sheet').classList.contains('on')) throw new Error('la hoja sigue abierta');
  if ($('#hTitle').textContent !== 'Pesas') throw new Error('cerró de más');
  await back();
  if ($('#hTitle').textContent !== 'Entrenar') throw new Error('no cerró el formulario');
});
t('la ✕ de las hojas cierra sin romper el historial', async () => {
  tab('ajustes'); click($('#aEx')); await tick();
  click($('#sheetX'));
  if ($('#sheet').classList.contains('on')) throw new Error('sigue abierta');
  await tick();
  tab('hoy'); click($$('.pick button')[0]); await back();
  if ($('#hTitle').textContent !== 'Entrenar') throw new Error('historial desfasado');
});

/* ---------------- filtros ---------------- */
t('la cinta de filtros no vuelve al inicio', () => {
  tab('diario');
  const s1 = $('.mods');
  Object.defineProperty(s1, 'scrollLeft', { writable: true, value: 0, configurable: true });
  s1.scrollLeft = 180; s1.dispatchEvent(new w.Event('scroll'));
  click($('[data-f="bici"]'));
  if ($('.mods').scrollLeft !== 180) throw new Error('diario se reseteó');
  tab('metricas');
  const s2 = $('.mods');
  Object.defineProperty(s2, 'scrollLeft', { writable: true, value: 0, configurable: true });
  s2.scrollLeft = 120; s2.dispatchEvent(new w.Event('scroll'));
  click($('[data-focus="natacion"]'));
  if ($('.mods').scrollLeft !== 120) throw new Error('métricas se reseteó');
});

/* ---------------- pesas ---------------- */
t('sesión de pesas con rutina', () => {
  tab('hoy'); click($$('.pick button')[0]);
  const sel = $('#fRoutine');
  change(sel, [...sel.options].find(o => o.textContent === 'Push').value);
  if ($$('.exblk').length !== 6) throw new Error('rutina mal');
  type($('input[data-i="0"][data-j="0"][data-f="w"]'), '60');
  type($('input[data-i="0"][data-j="0"][data-f="r"]'), '12');
  click($('[data-copy-set="0"]')); click($('[data-copy-set="0"]'));
  type($('#fDurM'), '52');
  click($('#fSave'));
  const s = st().sessions.find(x => x.name === 'Push');
  if (!s || s.entries.length !== 1 || s.entries[0].sets.length !== 3) throw new Error('mal guardada');
  if (s.durSec !== 3120) throw new Error('duración mal');
});
t('buscador entre miles de ejercicios', () => {
  tab('hoy'); click($$('.pick button')[0]); click($('#addEx'));
  type($('#exSearch'), 'sentadilla bulgara mancuernas');
  if (!$$('#exResults [data-id] .nm').some(e => e.textContent.includes('búlgara'))) throw new Error('sin resultados');
  type($('#exSearch'), 'Remo del pueblo'); click($('#exResults [data-new]'));
  if (!st().custom.some(e => e.name === 'Remo del pueblo')) throw new Error('no creó');
});

/* ---------------- por lado ---------------- */
t('un ejercicio pasa a por lado y muestra 4 campos', () => {
  click($('#addEx')); type($('#exSearch'), 'zancadas con mancuernas'); click($('#exResults [data-id]'));
  const i = $$('.exblk').length - 1;
  if ($$('.setrow')[$$('.setrow').length - 1].querySelectorAll('input').length !== 2) throw new Error('no arranca con 2');
  click($(`[data-uni="${i}"]`));
  const fila = $$('.exblk')[i].querySelector('.setrow');
  if (fila.querySelectorAll('input').length !== 4) throw new Error('no son 4 campos');
  if (!$(`[data-uni="${i}"]`).classList.contains('on')) throw new Error('botón sin marcar');
  type($$(`[data-i="${i}"][data-f="w"]`)[0], '20');
  type($$(`[data-i="${i}"][data-f="r"]`)[0], '10');
  type($$(`[data-i="${i}"][data-f="w2"]`)[0], '20');
  type($$(`[data-i="${i}"][data-f="r2"]`)[0], '8');
  click($(`[data-copy-set="${i}"]`));
  if ($$(`[data-i="${i}"][data-f="r2"]`)[1].value !== '8') throw new Error('repetir última no copió el lado derecho');
  click($('#fSave'));
  const en = st().sessions.find(x => x.name === 'Push' && x.entries.length > 1);
});
t('guarda, suma y muestra los dos lados', () => {
  const s = st().sessions.find(x => (x.entries || []).some(e => e.uni));
  if (!s) throw new Error('no guardó el unilateral');
  const en = s.entries.find(e => e.uni);
  if (en.sets[0].w2 !== 20 || en.sets[0].r2 !== 8) throw new Error('lado derecho mal');
  tab('diario');
  click($('[data-f="todo"]'));   // el filtro quedó en bici de la prueba anterior
  const el = $$('.sesh')[0];
  if (!el.textContent.includes('por lado')) throw new Error('el diario no lo indica');
  click(el);
  if (!$('#sheet').textContent.includes('I 20×10')) throw new Error('detalle sin lados');
  click($('#sheetX'));
});

/* ---------------- cardio y libre ---------------- */
t('natación en metros y ritmo /100m', () => {
  tab('hoy'); click($$('.pick button')[3]);
  type($('#cDist'), '1200'); type($('#cDurM'), '28');
  if (!$('#paceOut').textContent.includes('2:20')) throw new Error($('#paceOut').textContent);
  click($('#fSave'));
});
t('bici en km/h', () => {
  tab('hoy'); click($$('.pick button')[2]);
  type($('#cDist'), '30'); type($('#cDurH'), '1');
  if (!$('#paceOut').textContent.includes('30 km/h')) throw new Error($('#paceOut').textContent);
  click($('#fSave'));
});
t('libre con datos del Garmin', () => {
  tab('hoy'); click($$('.pick button')[4]);
  type($('#lName'), 'Caminata'); type($('#lDurH'), '1'); type($('#lDurM'), '12');
  click($('#addOpt')); click($('#sheet [data-k="dist"]')); type($('[data-optin="dist"]'), '6.4');
  click($('#addOpt')); click($('#sheet [data-k="steps"]')); type($('[data-optin="steps"]'), '9120');
  click($('#fSave'));
  const s = st().sessions.find(x => x.modality === 'libre');
  if (s.dist !== 6.4 || s.opt.steps !== '9120' || s.durSec !== 4320) throw new Error('datos mal');
});
t('peso corporal en filas completas', () => {
  tab('ajustes'); click($('#aW'));
  if ($('#sheet').querySelector('.grid2')) throw new Error('quedó la grilla de dos columnas');
  type($('#wKg'), '84.2'); click($('#wSave'));
  if (st().weights[0].kg !== 84.2) throw new Error('no guardó');
});

/* ---------------- coach, métricas, excel ---------------- */
t('coach: progresión, próxima sesión y peso', () => {
  tab('coach');
  const txt = $('#view').textContent;
  if (!txt.includes('Subí el peso')) throw new Error('sin progresión');
  if (!txt.includes('Te toca')) throw new Error('sin próxima sesión');
  click($('#cStart'));
  if (!$$('.exblk').length) throw new Error('no precargó');
  click($('#back'));
});
t('métricas: 6 enfoques × 4 rangos', () => {
  tab('metricas');
  ['general', 'pesas', 'running', 'bici', 'natacion', 'libre'].forEach(f => {
    click($(`[data-focus="${f}"]`));
    [30, 90, 365, 0].forEach(r => {
      click($(`[data-range="${r}"]`));
      if (!$('#mBody').innerHTML.trim()) throw new Error(f + '/' + r);
    });
  });
});
t('Excel: una hoja por modalidad y una fila por lado', () => {
  tab('ajustes'); click($('#aXls'));
  if (!wrote) throw new Error('no exportó');
  ['Resumen', 'Pesas', 'Bici', 'Natación', 'Libre'].forEach(h => {
    if (!wrote.wb.SheetNames.includes(h)) throw new Error('falta ' + h);
  });
  const pesas = XLSX.utils.sheet_to_json(wrote.wb.Sheets['Pesas']);
  const lados = pesas.filter(f => f.Lado === 'Derecha');
  if (!lados.length) throw new Error('sin filas del lado derecho');
  const libre = XLSX.utils.sheet_to_json(wrote.wb.Sheets['Libre'])[0];
  if (libre['Pasos'] !== '9120' || libre['Distancia (km)'] !== 6.4) throw new Error('libre mal');
});
t('borrar todo deja la app usable', () => {
  tab('ajustes'); click($('#aWipe')); click($('#cfOk'));
  if (st().sessions.length || !st().routines.length) throw new Error('reset mal');
  ['hoy', 'diario', 'metricas', 'coach', 'ajustes'].forEach(x => {
    tab(x);
    if (!$('#view').innerHTML.trim()) throw new Error('vacía: ' + x);
  });
});

(async () => {
  for (const [n, f] of pend) {
    try { await f(); R.push('✅ ' + n); }
    catch (e) { R.push('❌ ' + n + ' → ' + e.message); }
    await tick();
  }
  console.log(R.join('\n'));
  const fails = R.filter(x => x.startsWith('❌')).length;
  console.log(`\n${R.length - fails}/${R.length} pruebas OK`);
  process.exit(fails ? 1 : 0);
})();
