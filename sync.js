// Realtime sync layer for the car-photo app.
//
// LOCAL mode (no Firebase config): everything lives in localStorage, synced
// across browser tabs on this machine via BroadcastChannel — good for demos.
//
// FIREBASE mode (config supplied): record metadata lives in a small
// "<collection>" docs collection and each photo is written to its OWN doc in
// a "<collection>_shots" collection — so no single Firestore document ever
// risks the 1MiB/doc hard limit, no matter how detailed the photos are.
// subscribe() joins the two collections back into the same
// { ...meta, shots:[...] } shape either way, so callers never need to know
// which mode is active.
//
// A third, tiny "<collection>_stats" collection holds one doc per calendar
// day ({ dateKey, count }) that's only ever incremented — it is NOT touched
// by deleteRecords(), so daily totals survive even after the office downloads
// and deletes a day's photos. subscribeStats() streams that map for
// weekly/monthly trend charts. Everything here fits Firestore's free Spark
// plan (no billing account) as long as old days get deleted after download.
const LOCAL_KEY = 'carphoto_cloud_v1';
const STATS_KEY = 'carphoto_stats_v1';
const SAMPLES_KEY = 'carphoto_samples_v1';
const CHANNEL = 'carphoto_rt';
const STATS_CHANNEL = 'carphoto_rt_stats';
const SAMPLES_CHANNEL = 'carphoto_rt_samples';

let mode = 'local';
let fb = null, db = null;
let recordsCol = null, shotsCol = null, statsCol = null, samplesCol = null;
let sheetUrl = (typeof window !== 'undefined' && window.CARPHOTO_SHEET_URL) || null;
const localListeners = new Set();
const statsListeners = new Set();
const sampleListeners = new Set();

// Fire-and-forget append to a Google Apps Script Web App bound to a Sheet.
// no-cors + text/plain avoids a CORS preflight; Apps Script reads
// e.postData.contents. Runs alongside whichever storage mode is active.
async function logToSheet(row) {
  if (!sheetUrl) return;
  try {
    await fetch(sheetUrl, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(row),
    });
  } catch (e) { console.warn('[sync] Google Sheet log failed', e); }
}

export function getMode() { return mode; }

export async function initSync(config) {
  sheetUrl = (config && config.sheetUrl) || (typeof window !== 'undefined' && window.CARPHOTO_SHEET_URL) || null;
  if (config && config.apiKey && config.projectId) {
    try {
      const appMod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
      const fsMod  = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
      const app = appMod.initializeApp(config);
      db = fsMod.getFirestore(app);
      fb = fsMod;
      const base = config.collection || 'car_photos';
      recordsCol = fsMod.collection(db, base);
      shotsCol = fsMod.collection(db, base + '_shots');
      statsCol = fsMod.collection(db, base + '_stats');
      samplesCol = fsMod.collection(db, base + '_samples');
      mode = 'firebase';
      return 'firebase';
    } catch (e) {
      console.warn('[sync] Firebase init failed, falling back to local:', e);
      mode = 'local';
      return 'local';
    }
  }
  mode = 'local';
  return 'local';
}

function readLocal() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch (e) { return []; } }
function writeLocal(arr) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(arr)); } catch (e) {} }
function notifyLocal() {
  localListeners.forEach(fn => { try { fn(); } catch (e) {} });
  try { new BroadcastChannel(CHANNEL).postMessage('update'); } catch (e) {}
}

function readStats() { try { return JSON.parse(localStorage.getItem(STATS_KEY) || '{}'); } catch (e) { return {}; } }
function writeStats(obj) { try { localStorage.setItem(STATS_KEY, JSON.stringify(obj)); } catch (e) {} }
function notifyStats() {
  statsListeners.forEach(fn => { try { fn(); } catch (e) {} });
  try { new BroadcastChannel(STATS_CHANNEL).postMessage('update'); } catch (e) {}
}
function bumpLocalStats(dateKey, hour) {
  const stats = readStats();
  const day = stats[dateKey] || { count: 0, hours: {} };
  day.count = (day.count || 0) + 1;
  day.hours = day.hours || {};
  day.hours[hour] = (day.hours[hour] || 0) + 1;
  stats[dateKey] = day;
  writeStats(stats);
  notifyStats();
}

// rec: { dateKey, dateLabel, time, plate, location, shots:[{key,title,img,timeLabel,location}] }
export async function addRecord(rec) {
  const meta = Object.assign({}, rec);
  const shots = meta.shots || [];
  delete meta.shots;
  delete meta.id; // the store assigns the real id
  meta.createdAt = Date.now();

  if (mode === 'firebase' && recordsCol) {
    const recRef = await fb.addDoc(recordsCol, meta);
    await Promise.all(shots.map((sh, i) => fb.addDoc(shotsCol, {
      recordId: recRef.id, order: i, key: sh.key, title: sh.title, img: sh.img,
      timeLabel: sh.timeLabel, location: sh.location || null,
    })));
    let dailyCount = null;
    try {
      const hour = new Date(meta.createdAt).getHours();
      await fb.setDoc(fb.doc(statsCol, meta.dateKey), {
        dateKey: meta.dateKey, count: fb.increment(1), ['hours.' + hour]: fb.increment(1),
      }, { merge: true });
      const snap = await fb.getDoc(fb.doc(statsCol, meta.dateKey));
      dailyCount = snap.exists() ? (snap.data().count || null) : null;
    } catch (e) { console.warn('[sync] stats bump failed', e); }
    logToSheet({ date: meta.dateLabel, time: meta.time, count: dailyCount, plate: meta.plate || '', dateKey: meta.dateKey });
    return recRef.id;
  }

  const arr = readLocal();
  arr.push(Object.assign({ id: Date.now() }, meta, { shots }));
  writeLocal(arr);
  notifyLocal();
  bumpLocalStats(meta.dateKey, new Date(meta.createdAt).getHours());
  const dailyCount = (readStats()[meta.dateKey] || {}).count || null;
  logToSheet({ date: meta.dateLabel, time: meta.time, count: dailyCount, plate: meta.plate || '', dateKey: meta.dateKey });
}

// cb receives an array of records, newest first: { id, dateKey, dateLabel, time, plate, location, shots:[...] }
export function subscribe(cb) {
  if (mode === 'firebase' && recordsCol) {
    let recs = [], shots = [];
    const emit = () => {
      const byRecord = {};
      shots.forEach(s => { (byRecord[s.recordId] = byRecord[s.recordId] || []).push(s); });
      Object.values(byRecord).forEach(list => list.sort((a, b) => (a.order || 0) - (b.order || 0)));
      cb(recs.map(r => Object.assign({}, r, { shots: byRecord[r.id] || [] })));
    };
    const un1 = fb.onSnapshot(fb.query(recordsCol, fb.orderBy('createdAt', 'desc')), snap => {
      recs = snap.docs.map(d => Object.assign({}, d.data(), { id: d.id })); emit();
    }, err => console.warn('[sync] records snapshot error', err));
    const un2 = fb.onSnapshot(shotsCol, snap => {
      shots = snap.docs.map(d => Object.assign({}, d.data(), { id: d.id })); emit();
    }, err => console.warn('[sync] shots snapshot error', err));
    return () => { un1(); un2(); };
  }
  const emit = () => cb(readLocal().slice().reverse());
  localListeners.add(emit);
  emit();
  let bc = null;
  try { bc = new BroadcastChannel(CHANNEL); bc.onmessage = emit; } catch (e) {}
  const onStorage = e => { if (e.key === LOCAL_KEY) emit(); };
  window.addEventListener('storage', onStorage);
  return () => {
    localListeners.delete(emit);
    try { bc && bc.close(); } catch (e) {}
    window.removeEventListener('storage', onStorage);
  };
}

// cb receives { 'YYYY-M-D': { count, hours:{0:n,...} }, ... } — persists even
// after deleteRecords(), so day/week/month/year trend charts stay correct
// after old photos are cleared.
export function subscribeStats(cb) {
  if (mode === 'firebase' && statsCol) {
    return fb.onSnapshot(statsCol, snap => {
      const obj = {};
      snap.docs.forEach(d => {
        const data = d.data();
        obj[data.dateKey || d.id] = { count: data.count || 0, hours: data.hours || {} };
      });
      cb(obj);
    }, err => console.warn('[sync] stats snapshot error', err));
  }
  const emit = () => cb(readStats());
  statsListeners.add(emit);
  emit();
  let bc = null;
  try { bc = new BroadcastChannel(STATS_CHANNEL); bc.onmessage = emit; } catch (e) {}
  const onStorage = e => { if (e.key === STATS_KEY) emit(); };
  window.addEventListener('storage', onStorage);
  return () => {
    statsListeners.delete(emit);
    try { bc && bc.close(); } catch (e) {}
    window.removeEventListener('storage', onStorage);
  };
}

// ── รูปตัวอย่าง (sample reference photos) ──────────────────────────────────
// หน้าออฟฟิศเป็นผู้อัปโหลด แอปมือถืออ่านมาแสดงอย่างเดียว. เก็บรูปตัวอย่างละ 1
// เอกสาร (id = 'bar' | 'back' | 'plate') ใน "<collection>_samples" เพื่อไม่ให้
// เอกสารเดียวชนลิมิต 1MiB. โหมด local เก็บใน localStorage + ข้ามแท็บผ่าน
// BroadcastChannel เหมือน record.
function readSamples() { try { return JSON.parse(localStorage.getItem(SAMPLES_KEY) || '{}'); } catch (e) { return {}; } }
function writeSamples(obj) { try { localStorage.setItem(SAMPLES_KEY, JSON.stringify(obj)); } catch (e) {} }
function notifySamples() {
  sampleListeners.forEach(fn => { try { fn(); } catch (e) {} });
  try { new BroadcastChannel(SAMPLES_CHANNEL).postMessage('update'); } catch (e) {}
}

// key: 'bar' | 'back' | 'plate' ; img: data-URL (or null to clear)
export async function setSample(key, img) {
  if (mode === 'firebase' && samplesCol) {
    if (img == null) { try { await fb.deleteDoc(fb.doc(samplesCol, key)); } catch (e) {} return; }
    await fb.setDoc(fb.doc(samplesCol, key), { img, updatedAt: Date.now() });
    return;
  }
  const obj = readSamples();
  if (img == null) delete obj[key]; else obj[key] = img;
  writeSamples(obj);
  notifySamples();
}

export async function deleteSample(key) { return setSample(key, null); }

// cb receives a map { bar, back, plate } of data-URLs (missing keys absent)
export function subscribeSamples(cb) {
  if (mode === 'firebase' && samplesCol) {
    return fb.onSnapshot(samplesCol, snap => {
      const obj = {};
      snap.docs.forEach(d => { const v = d.data() || {}; if (v.img) obj[d.id] = v.img; });
      cb(obj);
    }, err => console.warn('[sync] samples snapshot error', err));
  }
  const emit = () => cb(readSamples());
  sampleListeners.add(emit);
  emit();
  let bc = null;
  try { bc = new BroadcastChannel(SAMPLES_CHANNEL); bc.onmessage = emit; } catch (e) {}
  const onStorage = e => { if (e.key === SAMPLES_KEY) emit(); };
  window.addEventListener('storage', onStorage);
  return () => {
    sampleListeners.delete(emit);
    try { bc && bc.close(); } catch (e) {}
    window.removeEventListener('storage', onStorage);
  };
}

// Delete a batch of records (and their photo docs) from the cloud — use this
// after pulling a day's photos down to a local machine, to keep the free
// Firestore quota from filling up. Daily stats totals are untouched.
export async function deleteRecords(ids) {
  const idSet = new Set(ids.map(String));
  if (mode === 'firebase' && recordsCol) {
    for (const id of idSet) {
      try { await fb.deleteDoc(fb.doc(recordsCol, id)); } catch (e) {}
      try {
        const snap = await fb.getDocs(fb.query(shotsCol, fb.where('recordId', '==', id)));
        await Promise.all(snap.docs.map(d => fb.deleteDoc(d.ref)));
      } catch (e) {}
    }
    return;
  }
  const arr = readLocal().filter(r => !idSet.has(String(r.id)));
  writeLocal(arr);
  notifyLocal();
}
