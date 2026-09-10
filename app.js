'use strict';

/* ---------- Config / storage keys ---------- */

const LS_WEBHOOK = 'tt_webhook_url';
const LS_ACTIVE = 'tt_active_task';
const LS_LOG = 'tt_log';
const LS_RECENT_TASKS = 'tt_recent_tasks';
const LS_METRICS_CACHE = 'tt_metrics_cache';
const LS_REWARDS = 'tt_rewards';
const LS_SOUND = 'tt_sound_enabled';
const LS_GEAR = 'tt_gear';
const LOG_MAX = 50;

const DB_NAME = 'tt-db';
const DB_VERSION = 1;
const STORE_QUEUE = 'queue';

/* ---------- IndexedDB queue ---------- */
/* Falls back to a localStorage-backed array if IndexedDB is unavailable
   (older iOS WebViews / private-browsing modes can block it). */

let dbPromise = null;
let idbBroken = false;

function openDB() {
  if (idbBroken || !('indexedDB' in window)) return Promise.reject(new Error('no-idb'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function lsQueueRead() {
  try { return JSON.parse(localStorage.getItem('tt_queue_fallback') || '[]'); }
  catch { return []; }
}
function lsQueueWrite(arr) {
  localStorage.setItem('tt_queue_fallback', JSON.stringify(arr));
}

async function queueAdd(item) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readwrite');
      const req = tx.objectStore(STORE_QUEUE).add(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    idbBroken = true;
    const arr = lsQueueRead();
    const id = (arr.length ? Math.max(...arr.map(e => e.id)) : 0) + 1;
    arr.push({ id, ...item });
    lsQueueWrite(arr);
    return id;
  }
}

async function queueAll() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readonly');
      const req = tx.objectStore(STORE_QUEUE).getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => a.id - b.id));
      req.onerror = () => reject(req.error);
    });
  } catch {
    idbBroken = true;
    return lsQueueRead();
  }
}

async function queueRemove(id) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, 'readwrite');
      const req = tx.objectStore(STORE_QUEUE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    idbBroken = true;
    lsQueueWrite(lsQueueRead().filter(e => e.id !== id));
  }
}

/* ---------- Local activity log (display only) ---------- */

function readLog() {
  try { return JSON.parse(localStorage.getItem(LS_LOG) || '[]'); }
  catch { return []; }
}
function writeLog(entries) {
  localStorage.setItem(LS_LOG, JSON.stringify(entries.slice(0, LOG_MAX)));
}
function addLogEntry(entry) {
  const entries = readLog();
  entries.unshift(entry);
  writeLog(entries);
  renderLog();
}
function setLogStatus(qid, status) {
  const entries = readLog();
  const found = entries.find(e => e.qid === qid);
  if (found) { found.status = status; writeLog(entries); renderLog(); }
}

/* ---------- Recent task suggestions ---------- */

function rememberTask(task) {
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem(LS_RECENT_TASKS) || '[]'); } catch {}
  recent = [task, ...recent.filter(t => t !== task)].slice(0, 20);
  localStorage.setItem(LS_RECENT_TASKS, JSON.stringify(recent));
  renderTaskOptions(recent);
}
function renderTaskOptions(list) {
  const datalist = document.getElementById('task-options');
  datalist.innerHTML = '';
  list.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    datalist.appendChild(opt);
  });
}

/* ---------- Active task state ---------- */

function getActiveTask() {
  try { return JSON.parse(localStorage.getItem(LS_ACTIVE) || 'null'); }
  catch { return null; }
}
function setActiveTask(task) {
  if (task) localStorage.setItem(LS_ACTIVE, JSON.stringify(task));
  else localStorage.removeItem(LS_ACTIVE);
}

/* ---------- DOM refs ---------- */

const el = {
  navTracker: document.getElementById('nav-tracker'),
  navCharacter: document.getElementById('nav-character'),
  navMetrics: document.getElementById('nav-metrics'),
  viewTracker: document.getElementById('view-tracker'),
  viewCharacter: document.getElementById('view-character'),
  viewMetrics: document.getElementById('view-metrics'),
  statusDot: document.getElementById('status-dot'),
  pendingBadge: document.getElementById('pending-badge'),
  settingsToggle: document.getElementById('settings-toggle'),
  settingsCard: document.getElementById('settings-card'),
  webhookInput: document.getElementById('webhook-url'),
  toggleWebhookVisibility: document.getElementById('toggle-webhook-visibility'),
  saveWebhook: document.getElementById('save-webhook'),
  timerTask: document.getElementById('timer-task'),
  timerDisplay: document.getElementById('timer-display'),
  timerTab: document.getElementById('timer-tab'),
  form: document.getElementById('tracker-form'),
  taskInput: document.getElementById('task-input'),
  descriptionInput: document.getElementById('description-input'),
  tabInput: document.getElementById('tab-input'),
  toggleBtn: document.getElementById('toggle-btn'),
  toggleBtnWrap: document.querySelector('.toggle-btn-wrap'),
  streakFlame: document.getElementById('streak-flame'),
  streakValue: document.getElementById('streak-value'),
  levelValue: document.getElementById('level-value'),
  xpBarFill: document.getElementById('xp-bar-fill'),
  xpBarLabel: document.getElementById('xp-bar-label'),
  levelupBanner: document.getElementById('levelup-banner'),
  levelupSub: document.getElementById('levelup-sub'),
  sceneWrap: document.querySelector('.scene-wrap'),
  sceneCanvas: document.getElementById('scene-canvas'),
  monsterBanner: document.getElementById('monster-banner'),
  tierName: document.getElementById('tier-name'),
  tierDesc: document.getElementById('tier-desc'),
  gearStatus: document.getElementById('gear-status'),
  charCanvas: document.getElementById('char-canvas'),
  charTierName: document.getElementById('char-tier-name'),
  charStatLevel: document.getElementById('char-stat-level'),
  charStatStreak: document.getElementById('char-stat-streak'),
  generateSaveCode: document.getElementById('generate-save-code'),
  saveCodeField: document.getElementById('save-code-field'),
  saveCodeOutput: document.getElementById('save-code-output'),
  copySaveCode: document.getElementById('copy-save-code'),
  loadCodeInput: document.getElementById('load-code-input'),
  loadSaveCode: document.getElementById('load-save-code'),
  soundToggle: document.getElementById('sound-toggle'),
  installBtn: document.getElementById('install-btn'),
  retrySync: document.getElementById('retry-sync'),
  clearLog: document.getElementById('clear-log'),
  logList: document.getElementById('log-list'),
  logEmpty: document.getElementById('log-empty'),
  toast: document.getElementById('toast'),
  metricsUpdated: document.getElementById('metrics-updated'),
  refreshMetrics: document.getElementById('refresh-metrics'),
  statToday: document.getElementById('stat-today'),
  statWeek: document.getElementById('stat-week'),
  statMonth: document.getElementById('stat-month'),
  trendChart: document.getElementById('trend-chart'),
  topTasksList: document.getElementById('top-tasks-list'),
  topTasksEmpty: document.getElementById('top-tasks-empty'),
  tabBreakdownList: document.getElementById('tab-breakdown-list'),
  tabBreakdownEmpty: document.getElementById('tab-breakdown-empty'),
};

/* ---------- Toast ---------- */

let toastTimer = null;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2500);
}

/* ---------- Rendering ---------- */

function pad(n) { return String(n).padStart(2, '0'); }
function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function renderTimer() {
  const active = getActiveTask();
  if (active) {
    // Elapsed is always derived from the stored start timestamp (not a running
    // counter), so it stays correct even after the tab is backgrounded/suspended.
    const elapsed = Date.now() - new Date(active.startedAt).getTime();
    el.timerTask.textContent = active.task;
    el.timerDisplay.textContent = formatElapsed(elapsed);
    el.timerTab.textContent = active.tab;
    el.timerTab.hidden = false;
    el.toggleBtn.textContent = 'Stop';
    el.toggleBtn.classList.add('stop');
    el.taskInput.value = active.task;
    el.descriptionInput.value = active.description || '';
    el.tabInput.value = active.tab;
    el.taskInput.disabled = true;
    el.descriptionInput.disabled = true;
    el.tabInput.disabled = true;
  } else {
    el.timerTask.textContent = 'Not tracking';
    el.timerDisplay.textContent = '00:00:00';
    el.timerTab.hidden = true;
    el.toggleBtn.textContent = 'Start';
    el.toggleBtn.classList.remove('stop');
    el.taskInput.disabled = false;
    el.descriptionInput.disabled = false;
    el.tabInput.disabled = false;
  }
}

function renderLog() {
  const entries = readLog();
  el.logList.innerHTML = '';
  el.logEmpty.hidden = entries.length > 0;
  entries.forEach(e => {
    const li = document.createElement('li');

    const dot = document.createElement('span');
    dot.className = 'dot ' + e.status;

    const main = document.createElement('div');
    main.className = 'entry-main';
    const title = document.createElement('div');
    title.className = 'entry-title';
    title.textContent = `${e.action} · ${e.task}`;
    const sub = document.createElement('div');
    sub.className = 'entry-sub';
    const subParts = [e.tab, e.description, new Date(e.timestamp).toLocaleString()].filter(Boolean);
    sub.textContent = subParts.join(' · ');
    main.appendChild(title);
    main.appendChild(sub);

    const status = document.createElement('div');
    status.className = 'entry-status';
    status.textContent = e.status === 'synced' ? 'Synced' : 'Queued';

    li.appendChild(dot);
    li.appendChild(main);
    li.appendChild(status);
    el.logList.appendChild(li);
  });
}

async function renderPendingBadge() {
  const q = await queueAll();
  if (q.length > 0) {
    el.pendingBadge.hidden = false;
    el.pendingBadge.textContent = `${q.length} queued`;
  } else {
    el.pendingBadge.hidden = true;
  }
}

function renderStatusDot() {
  el.statusDot.classList.toggle('online', navigator.onLine);
}

/* ---------- Sync ---------- */

let isFlushing = false;

async function flushQueue() {
  if (isFlushing) return;
  if (!navigator.onLine) return;
  const webhookUrl = localStorage.getItem(LS_WEBHOOK);
  if (!webhookUrl) return;

  isFlushing = true;
  try {
    const items = await queueAll();
    for (const item of items) {
      try {
        // mode: 'no-cors' + Content-Type "text/plain" together avoid the CORS
        // preflight Apps Script doesn't handle, AND sidestep having to read the
        // response: Apps Script's actual (non-preflight) response doesn't
        // reliably carry Access-Control-Allow-Origin, so a normal cors fetch
        // can reject even though the webhook received and processed the
        // request fine. With no-cors we get back an opaque response we can't
        // inspect, but a *resolved* promise still reliably means the request
        // reached the server — which is what matters for dequeuing, and avoids
        // resending (and duplicating rows for) requests that actually succeeded.
        await fetch(webhookUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          // "tab" still has to travel here even though it's not written into the
          // row — it's the only way Code.gs knows which sheet to route the row to.
          body: JSON.stringify({ task: item.task, tab: item.tab, description: item.description, action: item.action, timestamp: item.timestamp }),
        });
        await queueRemove(item.id);
        setLogStatus(item.id, 'synced');
      } catch {
        // Network error (still offline, or connection dropped mid-sync).
        break;
      }
    }
  } finally {
    isFlushing = false;
    renderPendingBadge();
  }
}

/* ---------- Metrics: fetch + compute + render ---------- */

// Reads via <script src> (JSONP), not fetch(): a normal cross-origin fetch
// needs Access-Control-Allow-Origin on the actual response to be readable,
// which Apps Script doesn't reliably send (same issue we hit on the write
// path). A <script> load is never subject to CORS at all, so it sidesteps
// the question entirely — see Code.gs's respondWithData for the other side.
function fetchJSONP(baseUrl, params, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const cbName = `ttcb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const url = new URL(baseUrl);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    url.searchParams.set('callback', cbName);

    const script = document.createElement('script');
    let settled = false;
    const timer = setTimeout(() => finish(() => reject(new Error('Request timed out'))), timeoutMs);

    function finish(action) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      delete window[cbName];
      script.remove();
      action();
    }

    window[cbName] = (data) => finish(() => resolve(data));
    script.onerror = () => finish(() => reject(new Error('Failed to load')));
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function readMetricsCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_METRICS_CACHE) || 'null');
    return raw && raw.tabs ? raw : null;
  } catch { return null; }
}

async function appendPendingNote() {
  const q = await queueAll();
  if (q.length > 0) el.metricsUpdated.textContent += ` • ${q.length} pending sync`;
}

async function loadMetrics() {
  const cache = readMetricsCache();
  if (cache) {
    renderMetrics(computeMetrics(cache.tabs), cache.fetchedAt);
  } else {
    el.metricsUpdated.textContent = 'Loading…';
  }

  const webhookUrl = localStorage.getItem(LS_WEBHOOK);
  if (webhookUrl && navigator.onLine) {
    el.refreshMetrics.disabled = true;
    try {
      const data = await fetchJSONP(webhookUrl, { action: 'data' });
      if (!data || data.ok !== true || !data.tabs) throw new Error('Unexpected response');
      const fetchedAt = new Date().toISOString();
      localStorage.setItem(LS_METRICS_CACHE, JSON.stringify({ tabs: data.tabs, fetchedAt }));
      renderMetrics(computeMetrics(data.tabs), fetchedAt);
    } catch {
      if (cache) toast('Could not refresh metrics — showing last loaded data');
      else el.metricsUpdated.textContent = 'Could not load metrics.';
    } finally {
      el.refreshMetrics.disabled = false;
    }
  } else if (!cache) {
    el.metricsUpdated.textContent = !webhookUrl
      ? 'Set the webhook URL in settings first.'
      : "You're offline — connect to load metrics.";
  }

  await appendPendingNote();
}

function parseDurationToSeconds(str) {
  if (!str || typeof str !== 'string') return 0;
  const parts = str.split(':').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
  const [h, m, s] = parts;
  return h * 3600 + m * 60 + s;
}

function sessionSeconds(row) {
  if (row.status === 'Complete' && row.duration) return parseDurationToSeconds(row.duration);
  // A still-running session (Start synced, Stop hasn't happened/synced yet)
  // contributes its live elapsed time — safe to do since it's the same row
  // that later gets its real duration filled in, never counted twice.
  if (row.status === 'Running' && row.startTime) {
    return Math.max(0, (Date.now() - new Date(row.startTime).getTime()) / 1000);
  }
  return 0;
}

function startOfLocalDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function dayKey(d) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }

function computeMetrics(tabs) {
  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - dayOfWeek);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let totalToday = 0, totalWeek = 0, totalMonth = 0;
  const byTask = new Map();
  const byTab = new Map();

  const trend = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - i);
    trend.push({ date: d, key: dayKey(d), seconds: 0 });
  }
  const trendByKey = new Map(trend.map((d) => [d.key, d]));

  for (const [tabName, rows] of Object.entries(tabs)) {
    for (const row of rows) {
      const seconds = sessionSeconds(row);
      if (seconds <= 0) continue;
      const whenIso = row.startTime || row.date || row.stopTime;
      if (!whenIso) continue;
      const when = new Date(whenIso);

      if (when >= todayStart) totalToday += seconds;
      if (when >= weekStart) totalWeek += seconds;
      if (when >= monthStart) totalMonth += seconds;

      byTask.set(row.task, (byTask.get(row.task) || 0) + seconds);
      byTab.set(tabName, (byTab.get(tabName) || 0) + seconds);

      const bucket = trendByKey.get(dayKey(startOfLocalDay(when)));
      if (bucket) bucket.seconds += seconds;
    }
  }

  const topTasks = [...byTask.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const tabBreakdown = [...byTab.entries()].sort((a, b) => b[1] - a[1]);

  return { totalToday, totalWeek, totalMonth, topTasks, tabBreakdown, trend };
}

function renderMetrics(metrics, fetchedAtIso) {
  el.statToday.textContent = formatElapsed(metrics.totalToday * 1000);
  el.statWeek.textContent = formatElapsed(metrics.totalWeek * 1000);
  el.statMonth.textContent = formatElapsed(metrics.totalMonth * 1000);

  el.topTasksList.innerHTML = '';
  el.topTasksEmpty.hidden = metrics.topTasks.length > 0;
  const maxTask = metrics.topTasks[0] ? metrics.topTasks[0][1] : 0;
  metrics.topTasks.forEach(([task, seconds]) => {
    el.topTasksList.appendChild(buildBarListItem(task, seconds, maxTask));
  });

  el.tabBreakdownList.innerHTML = '';
  el.tabBreakdownEmpty.hidden = metrics.tabBreakdown.length > 0;
  const maxTab = metrics.tabBreakdown[0] ? metrics.tabBreakdown[0][1] : 0;
  metrics.tabBreakdown.forEach(([tabName, seconds]) => {
    el.tabBreakdownList.appendChild(buildBarListItem(tabName, seconds, maxTab));
  });

  el.trendChart.innerHTML = '';
  const maxTrend = Math.max(1, ...metrics.trend.map((d) => d.seconds));
  const todayKey = dayKey(startOfLocalDay(new Date()));
  metrics.trend.forEach((day) => {
    el.trendChart.appendChild(buildTrendBar(day, maxTrend, day.key === todayKey));
  });

  el.metricsUpdated.textContent = `Updated ${new Date(fetchedAtIso).toLocaleString()}`;
}

function buildBarListItem(label, seconds, max) {
  const li = document.createElement('li');

  const row = document.createElement('div');
  row.className = 'metrics-list-row';
  const name = document.createElement('span');
  name.className = 'metrics-list-name';
  name.textContent = label;
  const value = document.createElement('span');
  value.className = 'metrics-list-value';
  value.textContent = formatElapsed(seconds * 1000);
  row.appendChild(name);
  row.appendChild(value);

  const track = document.createElement('div');
  track.className = 'metrics-bar-track';
  const fill = document.createElement('div');
  fill.className = 'metrics-bar-fill';
  fill.style.width = max > 0 ? `${Math.max(4, (seconds / max) * 100)}%` : '0%';
  track.appendChild(fill);

  li.appendChild(row);
  li.appendChild(track);
  return li;
}

function buildTrendBar(day, max, isToday) {
  const col = document.createElement('div');
  col.className = 'trend-bar-col';

  const track = document.createElement('div');
  track.className = 'trend-bar-track';
  const bar = document.createElement('div');
  bar.className = 'trend-bar' + (isToday ? ' today' : '');
  bar.style.height = day.seconds > 0 ? `${Math.max(2, (day.seconds / max) * 100)}%` : '2px';
  track.appendChild(bar);

  const label = document.createElement('div');
  label.className = 'trend-bar-label';
  label.textContent = day.date.toLocaleDateString(undefined, { weekday: 'narrow' });

  col.appendChild(track);
  col.appendChild(label);
  return col;
}

/* ---------- Rewards: streak / XP / level, instant feedback on Stop ---------- */
/* Fires the moment a session is Stopped, independent of sync — the whole
   point is a dopamine hit that doesn't wait on a network round-trip. */

function readRewards() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_REWARDS) || 'null');
    if (raw && typeof raw.totalXp === 'number') return raw;
  } catch {}
  return { totalXp: 0, streakCount: 0, lastStreakDate: null };
}
function writeRewards(rewards) {
  localStorage.setItem(LS_REWARDS, JSON.stringify(rewards));
}

function localDateKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function xpForLevel(level) {
  // Each level takes ~25% more XP than the last, so progress stays
  // meaningful without ever fully "completing" the game.
  return Math.round(100 * Math.pow(1.25, level - 1));
}
function computeLevelState(totalXp) {
  let level = 1;
  let remaining = totalXp;
  let needed = xpForLevel(level);
  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = xpForLevel(level);
  }
  return { level, xpIntoLevel: remaining, xpNeeded: needed };
}

function renderRewards() {
  const rewards = readRewards();
  const { level, xpIntoLevel, xpNeeded } = computeLevelState(rewards.totalXp);
  el.streakValue.textContent = rewards.streakCount;
  el.levelValue.textContent = `LV ${level}`;
  el.xpBarFill.style.width = `${Math.min(100, (xpIntoLevel / xpNeeded) * 100)}%`;
  el.xpBarLabel.textContent = `${xpIntoLevel} / ${xpNeeded} XP`;
}

function soundEnabled() {
  return localStorage.getItem(LS_SOUND) !== 'false';
}

let audioCtx = null;
function tone(freq, start, dur, peak = 0.12) {
  if (!soundEnabled()) return;
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, audioCtx.currentTime + start);
  gain.gain.linearRampToValueAtTime(peak, audioCtx.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + start + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(audioCtx.currentTime + start);
  osc.stop(audioCtx.currentTime + start + dur + 0.02);
}
function playRewardSound(leveledUp) {
  tone(660, 0, 0.09);
  tone(880, 0.08, 0.12);
  if (leveledUp) {
    tone(660, 0.25, 0.08);
    tone(880, 0.33, 0.08);
    tone(1175, 0.41, 0.16);
  }
}

function showXpFloat(amount) {
  const span = document.createElement('span');
  span.className = 'xp-float';
  span.textContent = `+${amount} XP`;
  // Appended to the wrapper around #toggle-btn, not the button itself:
  // renderTimer() sets the button's textContent on every tick (and right
  // after this runs), which would silently wipe a child node appended
  // directly to the button.
  el.toggleBtnWrap.appendChild(span);
  setTimeout(() => span.remove(), 1300);
}

function bumpStreakFlame() {
  el.streakFlame.classList.remove('bump');
  void el.streakFlame.offsetWidth; // restart the animation
  el.streakFlame.classList.add('bump');
}

function showLevelUp(level) {
  el.levelupSub.textContent = `LEVEL ${level}`;
  el.levelupBanner.classList.remove('show');
  void el.levelupBanner.offsetWidth;
  el.levelupBanner.classList.add('show');
}

function grantReward(durationSeconds) {
  const rewards = readRewards();
  const gained = Math.min(100, 5 + Math.floor(durationSeconds / 60));

  const before = computeLevelState(rewards.totalXp).level;
  rewards.totalXp += gained;
  const after = computeLevelState(rewards.totalXp).level;
  const leveledUp = after > before;

  const today = localDateKey(new Date());
  if (rewards.lastStreakDate !== today) {
    const yesterday = localDateKey(new Date(Date.now() - 86400000));
    rewards.streakCount = rewards.lastStreakDate === yesterday ? rewards.streakCount + 1 : 1;
    rewards.lastStreakDate = today;
    bumpStreakFlame();
  }

  writeRewards(rewards);
  touchState(Date.now());
  pushGameState();
  renderRewards();
  showXpFloat(gained);
  playRewardSound(leveledUp);
  if (leveledUp) showLevelUp(after);
  startBattle();
}

/* ---------- Gear / monsters / battle scroller ---------- */
/* An 8-bit avatar that walks endlessly in the rewards card and fights a
   monster the instant a session is Stopped (see startBattle(), called from
   grantReward() below) — never on a timer, so the payoff stays tied to the
   behavior it's meant to reinforce. Fights always end in a win; what varies
   is whether a piece of gear drops. */

const SLOTS = ['sword', 'shield', 'helmet', 'cape'];

// Body colors are fixed (not customizable) — only equipment varies.
const BODY_COLORS = {
  H: '#a06b35', H_D: '#6b4520',
  S: '#f0b088', S_D: '#d4926a',
  T: '#29adff', T_D: '#1b7dbf',
  P: '#3a3a5a', P_D: '#22223a',
  B: '#1a1a22', B_D: '#0a0a10'
};

const BASE = [
  '......HH......',
  '.....HHHH.....',
  '.....SSSS.....',
  '.....SSSS.....',
  '......SS......',
  '.....TTTT.....',
  '...TTTTTTTT...',
  '...TTTTTTTT...',
  '...TTTTTTTT...',
  '.....TTTT.....'
];
const LEGS = [
  ['.....PPPP.....', '.....PPPP.....', '.....PP.PP....', '.....PP.PP....', '....BB..BB....', '....BB..BB....'],
  ['.....PPPP.....', '.....PPPP.....', '....PP...PP...', '....PP...PP...', '...BB....BB...', '...BB....BB...']
];
const ARM_SWING = [{ 9: [[3, 'T']] }, { 9: [[10, 'T']] }];

// Gear shapes: fixed position + role name per slot. Color comes from whichever
// item is equipped, so the same shape can be a Wooden Sword or an Enchanted
// Blade just by which colors get plugged into "blade".
const SWORD_SHAPE = { 3: [[11, 'blade']], 4: [[11, 'blade']], 5: [[11, 'blade']], 6: [[11, 'blade'], [12, 'accent']], 7: [[11, 'grip']], 8: [[11, 'grip']] };
const SHIELD_SHAPE = { 6: [[1, 'body'], [2, 'body']], 7: [[1, 'body'], [2, 'emblem']], 8: [[1, 'body'], [2, 'body']], 9: [[1, 'body'], [2, 'body']] };
const HELMET_SHAPE_ROWS = { 0: '......MM......', 1: '....MMMMMM....' };
const CAPE_SHAPE = {
  5: [[2, 'main'], [3, 'main'], [10, 'main'], [11, 'main']],
  6: [[1, 'main'], [2, 'main'], [11, 'main'], [12, 'main']],
  7: [[1, 'main'], [2, 'main'], [11, 'main'], [12, 'main']],
  8: [[1, 'main'], [2, 'main'], [11, 'main'], [12, 'main']],
  9: [[2, 'main'], [3, 'main'], [10, 'main'], [11, 'main']],
  10: [[3, 'main'], [4, 'main'], [9, 'main'], [10, 'main']],
  11: [[4, 'main'], [5, 'main'], [8, 'main'], [9, 'main']]
};

// Each slot's item catalog. "tier" is the minimum unlocked level-tier index
// it can drop from (see levelTierIndex). Colors list the primary role first —
// that's what a swatch samples to represent the item with a single chip.
const GEAR_ITEMS = {
  sword: [
    { id: 'wood_sword', name: 'Wooden Sword', tier: 0, colors: { blade: '#c4a274', blade_D: '#8a6238', accent: '#8a6238', accent_D: '#5c4020', grip: '#5c4020', grip_D: '#3a2810' } },
    { id: 'iron_sword', name: 'Iron Sword', tier: 2, colors: { blade: '#f0f0f8', blade_D: '#c4c4d4', accent: '#ffd700', accent_D: '#c9a500', grip: '#8a6238', grip_D: '#5c4020' } },
    { id: 'battle_axe', name: 'Battle Axe', tier: 3, colors: { blade: '#c4c4d4', blade_D: '#8a8a9a', accent: '#ffd700', accent_D: '#c9a500', grip: '#3a2810', grip_D: '#241a08' } },
    { id: 'war_hammer', name: 'War Hammer', tier: 5, colors: { blade: '#8a8a9a', blade_D: '#5a5a6a', accent: '#5a5a6a', accent_D: '#3a3a4a', grip: '#5c4020', grip_D: '#3a2810' } },
    { id: 'ench_blade', name: 'Enchanted Blade', tier: 7, colors: { blade: '#7ce7ff', blade_D: '#29adff', accent: '#ffd700', accent_D: '#c9a500', grip: '#8a6238', grip_D: '#5c4020' } }
  ],
  shield: [
    { id: 'wood_shield', name: 'Wooden Shield', tier: 1, colors: { body: '#8a6238', body_D: '#5c4020', emblem: '#c4a274', emblem_D: '#8a6238' } },
    { id: 'iron_shield', name: 'Iron Shield', tier: 3, colors: { body: '#c4c4d4', body_D: '#8a8a9a', emblem: '#ffd700', emblem_D: '#c9a500' } },
    { id: 'tower_shield', name: 'Tower Shield', tier: 4, colors: { body: '#5a5a6a', body_D: '#3a3a4a', emblem: '#ffd700', emblem_D: '#c9a500' } },
    { id: 'dragon_ward', name: "Dragon's Ward", tier: 7, colors: { body: '#ff4d4d', body_D: '#c02020', emblem: '#ffd700', emblem_D: '#c9a500' } }
  ],
  helmet: [
    { id: 'leather_cap', name: 'Leather Cap', tier: 2, colors: { main: '#8a6238', main_D: '#5c4020' } },
    { id: 'iron_helm', name: 'Iron Helm', tier: 4, colors: { main: '#dcdce8', main_D: '#a8a8ba' } },
    { id: 'horned_helm', name: 'Horned Helm', tier: 5, colors: { main: '#5a5a6a', main_D: '#3a3a4a' } },
    { id: 'dragon_crown', name: 'Dragon Crown', tier: 7, colors: { main: '#ffd700', main_D: '#c9a500' } }
  ],
  cape: [
    { id: 'torn_cloak', name: 'Torn Cloak', tier: 3, colors: { main: '#8a5a2b', main_D: '#5c3a1a' } },
    { id: 'knight_cape', name: "Knight's Cape", tier: 4, colors: { main: '#29adff', main_D: '#1b7dbf' } },
    { id: 'royal_cape', name: 'Royal Cape', tier: 5, colors: { main: '#b030d0', main_D: '#7a1f8f' } },
    { id: 'dragon_cape', name: 'Dragon-scale Cape', tier: 7, colors: { main: '#ff4d4d', main_D: '#c02020' } }
  ]
};

function itemById(slot, id) {
  const list = GEAR_ITEMS[slot];
  for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

const TIERS = [
  { minLevel: 1, name: 'ROOKIE', monster: 0, desc: 'Slimes only for now.' },
  { minLevel: 3, name: 'SQUIRE', monster: 1, desc: 'Giant rats join in at Level 3.' },
  { minLevel: 5, name: 'HUNTER', monster: 2, desc: 'Goblins at Level 5.' },
  { minLevel: 7, name: 'KNIGHT', monster: 3, desc: 'Wolves at Level 7.' },
  { minLevel: 9, name: 'SLAYER', monster: 4, desc: 'Skeletons at Level 9.' },
  { minLevel: 12, name: 'GUARDIAN', monster: 5, desc: 'Orcs at Level 12.' },
  { minLevel: 16, name: 'CHAMPION', monster: 6, desc: 'Trolls at Level 16.' },
  { minLevel: 20, name: 'LEGEND', monster: 7, desc: 'Dragons at Level 20 — the top of the food chain.' }
];

const STREAK_TIERS = [
  { minStreak: 0, name: 'None', glow: null },
  { minStreak: 3, name: 'Warming up', glow: { color: '41,182,255', blur: 14, pulse: false } },
  { minStreak: 7, name: 'On fire', glow: { color: '255,215,0', blur: 20, pulse: false } },
  { minStreak: 30, name: 'Unstoppable', glow: { color: '255,0,77', blur: 26, pulse: true } }
];

function drawSlime(ctx, x, y) {
  ctx.fillStyle = '#00e436';
  ctx.fillRect(x - 13, y - 14, 26, 14);
  ctx.fillRect(x - 9, y - 17, 18, 3);
  ctx.fillStyle = '#0d0d1a';
  ctx.fillRect(x - 7, y - 10, 4, 4);
  ctx.fillRect(x + 3, y - 10, 4, 4);
}
function drawRat(ctx, x, y) {
  ctx.fillStyle = '#8a7a6a';
  ctx.fillRect(x - 14, y - 12, 24, 10);
  ctx.fillRect(x + 6, y - 16, 10, 8);
  ctx.fillStyle = '#6a5a4a';
  ctx.fillRect(x - 18, y - 8, 6, 2);
  ctx.fillRect(x + 4, y - 18, 3, 3);
  ctx.fillRect(x + 11, y - 18, 3, 3);
  ctx.fillStyle = '#ff004d';
  ctx.fillRect(x + 12, y - 13, 2, 2);
  ctx.fillStyle = '#5c4c3c';
  ctx.fillRect(x - 12, y - 2, 4, 2);
  ctx.fillRect(x - 2, y - 2, 4, 2);
}
function drawGoblin(ctx, x, y) {
  ctx.fillStyle = '#5ab552';
  ctx.fillRect(x - 6, y - 30, 12, 10);
  ctx.fillRect(x - 10, y - 20, 20, 16);
  ctx.fillRect(x - 10, y - 4, 6, 4);
  ctx.fillRect(x + 4, y - 4, 6, 4);
  ctx.fillStyle = '#0d0d1a';
  ctx.fillRect(x - 4, y - 26, 3, 3);
  ctx.fillRect(x + 1, y - 26, 3, 3);
  ctx.fillStyle = '#6b4a2a';
  ctx.fillRect(x + 10, y - 22, 3, 18);
}
function drawWolf(ctx, x, y) {
  ctx.fillStyle = '#6b6b8a';
  ctx.fillRect(x - 20, y - 16, 32, 12);
  ctx.fillRect(x + 10, y - 22, 10, 10);
  ctx.fillRect(x + 8, y - 26, 4, 5);
  ctx.fillRect(x + 16, y - 26, 4, 5);
  ctx.fillRect(x - 20, y - 4, 5, 4);
  ctx.fillRect(x - 6, y - 4, 5, 4);
  ctx.fillRect(x + 6, y - 4, 5, 4);
  ctx.fillStyle = '#ff004d';
  ctx.fillRect(x + 13, y - 19, 2, 2);
}
function drawSkeleton(ctx, x, y) {
  ctx.fillStyle = '#e8e8dc';
  ctx.fillRect(x - 5, y - 32, 10, 10);
  ctx.fillRect(x - 8, y - 20, 16, 14);
  ctx.fillRect(x - 8, y - 4, 6, 4);
  ctx.fillRect(x + 2, y - 4, 6, 4);
  ctx.fillStyle = '#0d0d1a';
  ctx.fillRect(x - 3, y - 28, 2, 3);
  ctx.fillRect(x + 1, y - 28, 2, 3);
  ctx.fillStyle = '#8a8a9a';
  ctx.fillRect(x + 8, y - 22, 3, 20);
}
function drawOrc(ctx, x, y) {
  ctx.fillStyle = '#3d6b3d';
  ctx.fillRect(x - 8, y - 36, 16, 12);
  ctx.fillRect(x - 15, y - 24, 30, 22);
  ctx.fillRect(x - 15, y - 4, 8, 4);
  ctx.fillRect(x + 7, y - 4, 8, 4);
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(x - 5, y - 27, 2, 4);
  ctx.fillRect(x + 3, y - 27, 2, 4);
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(x - 22, y - 24, 5, 20);
  ctx.fillStyle = '#c7c7d6';
  ctx.fillRect(x - 26, y - 26, 10, 8);
}
function drawTroll(ctx, x, y) {
  ctx.fillStyle = '#5a7a5a';
  ctx.fillRect(x - 10, y - 40, 20, 14);
  ctx.fillRect(x - 20, y - 26, 40, 24);
  ctx.fillRect(x - 20, y - 4, 10, 4);
  ctx.fillRect(x + 10, y - 4, 10, 4);
  ctx.fillStyle = '#0d0d1a';
  ctx.fillRect(x - 5, y - 34, 3, 3);
  ctx.fillRect(x + 3, y - 34, 3, 3);
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(x - 7, y - 30, 2, 5);
  ctx.fillRect(x + 5, y - 30, 2, 5);
  ctx.fillStyle = '#3a5a3a';
  ctx.fillRect(x - 30, y - 26, 8, 24);
}
function drawDragon(ctx, x, y) {
  ctx.fillStyle = '#ff4d4d';
  ctx.fillRect(x - 22, y - 20, 44, 16);
  ctx.fillRect(x + 18, y - 28, 14, 12);
  ctx.fillRect(x - 34, y - 14, 14, 6);
  ctx.beginPath();
  ctx.moveTo(x - 4, y - 20); ctx.lineTo(x - 4, y - 40); ctx.lineTo(x + 12, y - 20);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#0d0d1a';
  ctx.fillRect(x + 26, y - 24, 3, 3);
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(x - 8, y - 4, 6, 4);
  ctx.fillRect(x + 6, y - 4, 6, 4);
}

const MONSTERS = [
  { tier: 0, name: 'Slime', draw: drawSlime },
  { tier: 1, name: 'Giant Rat', draw: drawRat },
  { tier: 2, name: 'Goblin', draw: drawGoblin },
  { tier: 3, name: 'Wolf', draw: drawWolf },
  { tier: 4, name: 'Skeleton', draw: drawSkeleton },
  { tier: 5, name: 'Orc', draw: drawOrc },
  { tier: 6, name: 'Troll', draw: drawTroll },
  { tier: 7, name: 'Dragon', draw: drawDragon }
];

function tierForLevel(lvl) {
  let t = TIERS[0];
  for (let i = 0; i < TIERS.length; i++) if (lvl >= TIERS[i].minLevel) t = TIERS[i];
  return t;
}
function tierForStreak(s) {
  let t = STREAK_TIERS[0];
  for (let i = 0; i < STREAK_TIERS.length; i++) if (s >= STREAK_TIERS[i].minStreak) t = STREAK_TIERS[i];
  return t;
}
function levelTierIndex(lvl) {
  let idx = 0;
  TIERS.forEach((t, i) => { if (lvl >= t.minLevel) idx = i; });
  return idx;
}

function currentLevel() { return computeLevelState(readRewards().totalXp).level; }
function currentStreak() { return readRewards().streakCount; }

/* ---------- Gear persistence ---------- */

function readGear() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_GEAR) || 'null');
    if (raw && raw.foundItems && raw.equipped) return raw;
  } catch {}
  return { foundItems: { sword: [], shield: [], helmet: [], cape: [] }, equipped: { sword: null, shield: null, helmet: null, cape: null } };
}
function writeGear(gear) {
  localStorage.setItem(LS_GEAR, JSON.stringify(gear));
}

let gearState = readGear();

/* ---------- Battle: level gates the monster tier, victory rolls for gear ---------- */

function pickMonster() {
  const maxTier = levelTierIndex(currentLevel());
  const weights = [];
  for (let i = 0; i <= maxTier; i++) weights.push(i === maxTier ? 3 : 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i <= maxTier; i++) { r -= weights[i]; if (r <= 0) return MONSTERS[i]; }
  return MONSTERS[maxTier];
}

function rollLoot() {
  // Eligible items are gated by the player's unlocked level tier, not the
  // specific monster faced this encounter — pickMonster() sometimes picks a
  // weaker monster for flavor/variety, and gating loot to *that* tier meant
  // those fights could never drop anything once its few items were already
  // found (an empty candidate pool with no chance to roll at all).
  const maxTier = levelTierIndex(currentLevel());
  const candidates = [];
  SLOTS.forEach((slot) => {
    GEAR_ITEMS[slot].forEach((item) => {
      if (item.tier <= maxTier && gearState.foundItems[slot].indexOf(item.id) === -1) candidates.push({ slot, item });
    });
  });
  if (candidates.length > 0 && Math.random() < 0.55) {
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    gearState.foundItems[pick.slot].push(pick.item.id);
    if (!gearState.equipped[pick.slot]) gearState.equipped[pick.slot] = pick.item.id;
    writeGear(gearState);
    touchState(Date.now());
    pushGameState();
    return { type: 'gear', slot: pick.slot, item: pick.item };
  }
  return { type: 'xp' };
}

const PHASE_MS = { approach: 650, clash: 320, victory: 550, loot: 1300 };
let battle = null;

function startBattle() {
  if (battle) return;
  const monster = pickMonster();
  if (prefersReducedMotion) {
    showLootFloat(rollLoot());
    renderSceneStatic();
    return;
  }
  battle = { phase: 'approach', phaseStart: null, monster, monsterX: SCENE_W + 24, loot: null };
  el.monsterBanner.textContent = 'A WILD ' + monster.name.toUpperCase() + ' APPROACHES!';
  el.monsterBanner.classList.add('show');
}

function nextBattlePhase(phase, t) { battle.phase = phase; battle.phaseStart = t; }

function advanceBattle(t) {
  if (battle.phaseStart === null) battle.phaseStart = t;
  const elapsed = t - battle.phaseStart;
  if (battle.phase === 'approach') {
    const progress = Math.min(1, elapsed / PHASE_MS.approach);
    battle.monsterX = (SCENE_W + 24) - progress * (SCENE_W + 24 - (SPRITE_X + 58));
    if (progress >= 1) nextBattlePhase('clash', t);
  } else if (battle.phase === 'clash') {
    if (elapsed >= PHASE_MS.clash) {
      battle.loot = rollLoot();
      el.monsterBanner.classList.remove('show');
      nextBattlePhase('victory', t);
    }
  } else if (battle.phase === 'victory') {
    if (elapsed >= PHASE_MS.victory) { showLootFloat(battle.loot); nextBattlePhase('loot', t); }
  } else if (battle.phase === 'loot') {
    if (elapsed >= PHASE_MS.loot) battle = null;
  }
}

function drawBattle(ctx, t) {
  const m = battle.monster;
  if (battle.phase === 'clash') {
    const shake = Math.sin(t * 0.09) * 3;
    ctx.save();
    ctx.translate(shake, 0);
  }
  const scale = battle.phase === 'victory' ? Math.max(0, 1 - (t - battle.phaseStart) / PHASE_MS.victory) : 1;
  ctx.save();
  ctx.globalAlpha = scale;
  ctx.translate(battle.monsterX, 0);
  ctx.scale(scale || 0.001, scale || 0.001);
  ctx.translate(-battle.monsterX, 0);
  m.draw(ctx, battle.monsterX, GROUND_Y);
  ctx.restore();
  if (battle.phase === 'clash') ctx.restore();
}

function showLootFloat(loot) {
  const span = document.createElement('span');
  span.className = 'loot-float';
  span.textContent = loot.type === 'gear' ? ('+' + loot.item.name.toUpperCase() + '!') : '+XP (NO DROP)';
  el.sceneWrap.appendChild(span);
  setTimeout(() => span.remove(), 1600);
  renderGearStatus();
  renderCharacterScreen();
}

function renderGearStatus() {
  const total = SLOTS.reduce((sum, slot) => sum + gearState.foundItems[slot].length, 0);
  el.gearStatus.textContent = total > 0 ? `${total} ITEM${total === 1 ? '' : 'S'} FOUND` : 'NO GEAR FOUND YET';
}

/* ---------- Sprite rendering: equipped items resolve their own colors ---------- */

function forEachSpritePixel(equippedState, frame, cb) {
  const f = frame ? 1 : 0;

  const capeItem = equippedState.cape ? itemById('cape', equippedState.cape) : null;
  if (capeItem) emitShape(CAPE_SHAPE, capeItem.colors, cb);

  const helmetItem = equippedState.helmet ? itemById('helmet', equippedState.helmet) : null;
  for (let r = 0; r < BASE.length; r++) {
    if (helmetItem && HELMET_SHAPE_ROWS[r] !== undefined) {
      const hrow = HELMET_SHAPE_ROWS[r];
      for (let hc = 0; hc < hrow.length; hc++) if (hrow[hc] !== '.') cb(r, hc, helmetItem.colors.main, helmetItem.colors.main_D);
    } else {
      const brow = BASE[r];
      for (let bc = 0; bc < brow.length; bc++) { const bk = brow[bc]; if (bk !== '.') cb(r, bc, BODY_COLORS[bk], BODY_COLORS[bk + '_D']); }
    }
  }

  const legRows = LEGS[f];
  for (let li = 0; li < legRows.length; li++) {
    const rowIdx = BASE.length + li;
    const lrow = legRows[li];
    for (let lc = 0; lc < lrow.length; lc++) { const lk = lrow[lc]; if (lk !== '.') cb(rowIdx, lc, BODY_COLORS[lk], BODY_COLORS[lk + '_D']); }
  }
  const arm = ARM_SWING[f];
  Object.keys(arm).forEach((r) => { arm[r].forEach((cell) => { cb(+r, cell[0], BODY_COLORS[cell[1]], BODY_COLORS[cell[1] + '_D']); }); });

  const swordItem = equippedState.sword ? itemById('sword', equippedState.sword) : null;
  if (swordItem) emitShape(SWORD_SHAPE, swordItem.colors, cb);
  const shieldItem = equippedState.shield ? itemById('shield', equippedState.shield) : null;
  if (shieldItem) emitShape(SHIELD_SHAPE, shieldItem.colors, cb);
}

function emitShape(shape, colors, cb) {
  Object.keys(shape).forEach((r) => {
    shape[r].forEach((cell) => {
      const role = cell[1];
      cb(+r, cell[0], colors[role], colors[role + '_D']);
    });
  });
}

// Shading: light on the left half of the sprite, dark on the right, simulating
// a light source from the upper-left.
function paintSpriteOnto(ctx, equippedState, frame, originX, originY, scale) {
  const cells = [];
  forEachSpritePixel(equippedState, frame, (row, col, light, dark) => { cells.push([row, col, light, dark]); });
  cells.forEach((cell) => {
    ctx.fillStyle = cell[1] >= 7 ? cell[3] : cell[2];
    ctx.fillRect(originX + cell[1] * scale, originY + cell[0] * scale, scale, scale);
  });
}

/* ---------- Scene: scrolling background + walking sprite ---------- */

const SCENE_W = 360, SCENE_H = 200, GROUND_Y = 150, SPRITE_SCALE = 6, SPRITE_X = 68;
const SPRITE_H = 16 * SPRITE_SCALE;
const sceneCtx = el.sceneCanvas.getContext('2d');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function drawTiled(repeatW, speed, scrollX, drawTile) {
  const offset = (scrollX * speed) % repeatW;
  for (let x = -offset - repeatW; x < SCENE_W + repeatW; x += repeatW) drawTile(x);
}

function drawScene(scrollX, bobY, t) {
  const ctx = sceneCtx;
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, '#1a1a3e');
  sky.addColorStop(1, '#2d2d5e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);

  ctx.fillStyle = '#3a3a6a';
  drawTiled(90, 0.15, scrollX, (x) => { ctx.fillRect(x, 24, 28, 8); ctx.fillRect(x + 6, 18, 16, 8); });

  ctx.fillStyle = '#3d2d5e';
  drawTiled(110, 0.4, scrollX, (x) => {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y); ctx.lineTo(x + 30, GROUND_Y - 40); ctx.lineTo(x + 70, GROUND_Y);
    ctx.closePath(); ctx.fill();
  });

  ctx.fillStyle = '#14142a';
  ctx.fillRect(0, GROUND_Y, SCENE_W, SCENE_H - GROUND_Y);

  ctx.fillStyle = '#00e436';
  drawTiled(18, 1, scrollX, (x) => { ctx.fillRect(x, GROUND_Y - 3, 3, 3); ctx.fillRect(x + 8, GROUND_Y - 5, 3, 5); });

  if (battle) {
    advanceBattle(t);
    if (battle) drawBattle(ctx, t);
  }

  const streakTier = tierForStreak(currentStreak());
  if (streakTier && streakTier.glow) {
    const g = streakTier.glow;
    let blur = g.blur * 0.55;
    if (g.pulse) blur += Math.sin(scrollX * 0.05) * (g.blur * 0.2);
    ctx.shadowColor = 'rgba(' + g.color + ',0.9)';
    ctx.shadowBlur = blur;
  }
  const walkFrame = battle ? 0 : Math.floor(t / 220) % 2;
  paintSpriteOnto(ctx, gearState.equipped, walkFrame, SPRITE_X, GROUND_Y - SPRITE_H + bobY, SPRITE_SCALE);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  return tierForLevel(currentLevel());
}

let sceneRafId = null, sceneScrollX = 0, sceneLastT = 0;

function sceneTick(t) {
  const dt = sceneLastT ? Math.min(48, t - sceneLastT) : 16;
  sceneLastT = t;
  if (!battle) sceneScrollX += dt * 0.07;
  const bobY = Math.sin(t * 0.006) * 3;
  const tier = drawScene(sceneScrollX, bobY, t);
  updateSceneLabels(tier);
  sceneRafId = requestAnimationFrame(sceneTick);
}
function startSceneLoop() { if (sceneRafId === null && !prefersReducedMotion) { sceneLastT = 0; sceneRafId = requestAnimationFrame(sceneTick); } }
function stopSceneLoop() { if (sceneRafId !== null) { cancelAnimationFrame(sceneRafId); sceneRafId = null; } }
function renderSceneStatic() {
  if (!prefersReducedMotion) return;
  const tier = drawScene(sceneScrollX, 0, performance.now());
  updateSceneLabels(tier);
}

function updateSceneLabels(tier) {
  el.tierName.textContent = tier.name;
  el.tierDesc.textContent = tier.desc;
}

/* ---------- Character screen ---------- */

function renderCharacterScreen() {
  const scale = 14;
  el.charCanvas.width = 14 * scale;
  el.charCanvas.height = 16 * scale;
  const ctx = el.charCanvas.getContext('2d');
  ctx.clearRect(0, 0, el.charCanvas.width, el.charCanvas.height);
  paintSpriteOnto(ctx, gearState.equipped, 0, 0, 0, scale);

  const level = currentLevel();
  el.charTierName.textContent = tierForLevel(level).name;
  el.charStatLevel.textContent = `LV ${level}`;
  el.charStatStreak.textContent = `${currentStreak()} DAY STREAK`;

  SLOTS.forEach((slot) => {
    const equippedId = gearState.equipped[slot];
    const equippedItem = equippedId ? itemById(slot, equippedId) : null;
    document.getElementById('equipped-' + slot).textContent = equippedItem ? equippedItem.name.toUpperCase() : 'NOTHING EQUIPPED';

    const row = document.getElementById('swatches-' + slot);
    row.innerHTML = '';
    const found = gearState.foundItems[slot];
    if (found.length === 0) {
      const locked = document.createElement('span');
      locked.className = 'swatch-locked';
      locked.textContent = 'NOTHING FOUND YET';
      row.appendChild(locked);
      return;
    }
    found.forEach((id) => {
      const item = itemById(slot, id);
      const primaryRole = Object.keys(item.colors)[0];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch' + (gearState.equipped[slot] === id ? ' equipped' : '');
      const chip = document.createElement('span');
      chip.className = 'swatch-color';
      chip.style.background = item.colors[primaryRole];
      const name = document.createElement('span');
      name.className = 'swatch-name';
      name.textContent = item.name;
      btn.appendChild(chip); btn.appendChild(name);
      btn.addEventListener('click', () => {
        gearState.equipped[slot] = id;
        writeGear(gearState);
        touchState(Date.now());
        pushGameState();
        renderCharacterScreen();
        renderSceneStatic();
      });
      row.appendChild(btn);
    });
  });
}

/* ---------- Progression sync: the Google Sheet as the source of truth ---------- */
/* Level/streak/gear push to a hidden "_GameState" tab (via Code.gs) on every
   change, and pull on load/reconnect — so opening the app on a different
   browser picks up wherever the other one left off, the same way the task
   log already does. Never trusted blindly in either direction: every pull is
   merged with whatever's already local (see mergeStatePayloads), so a stale
   read can't roll a device backwards. A manual save code covers the gap
   before a webhook is set up on the new device, or for transferring without
   a network round-trip at all — it's not encryption, since there's nothing
   here worth protecting with a secret (no credentials, no task data, just
   level/streak/gear numbers) and no server to hold a key; a checksum-verified
   base64 blob does the job that's actually needed: catch a mistyped or
   truncated paste. */

const LS_STATE_TS = 'tt_state_updated_at';
const SAVE_CODE_VERSION = 1;

function readStateTs() {
  return Number(localStorage.getItem(LS_STATE_TS)) || 0;
}
function touchState(ts) {
  localStorage.setItem(LS_STATE_TS, String(ts || Date.now()));
}

function currentStatePayload() {
  const rewards = readRewards();
  return {
    xp: rewards.totalXp,
    sc: rewards.streakCount,
    lsd: rewards.lastStreakDate,
    f: gearState.foundItems,
    e: gearState.equipped,
    updatedAt: readStateTs(),
  };
}

// lastStreakDate keys look like "2026-9-9" (localDateKey: unpadded month/day),
// which doesn't sort correctly as a plain string ("2026-10-1" < "2026-9-9"
// lexically) — parse back into a real Date for comparison.
function dateKeyToDate(key) {
  if (!key) return null;
  const parts = String(key).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1], parts[2]);
}

// Combines two state snapshots (local + remote, either order) without ever
// letting one side regress the other: XP only ever goes up, found gear is a
// union (once found, always kept), and the streak pair / equipped loadout
// follow whichever side was actually touched more recently.
function mergeStatePayloads(a, b) {
  const newer = (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a;

  const dateA = dateKeyToDate(a.lsd), dateB = dateKeyToDate(b.lsd);
  let streakSource = a;
  if (dateB && (!dateA || dateB > dateA)) streakSource = b;

  const foundItems = {};
  SLOTS.forEach((slot) => {
    const setA = (a.f && a.f[slot]) || [];
    const setB = (b.f && b.f[slot]) || [];
    foundItems[slot] = Array.from(new Set([...setA, ...setB]));
  });

  return {
    xp: Math.max(a.xp || 0, b.xp || 0),
    sc: streakSource.sc || 0,
    lsd: streakSource.lsd || null,
    f: foundItems,
    e: newer.e || {},
    updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0),
  };
}

function applyStatePayload(payload) {
  writeRewards({ totalXp: payload.xp, streakCount: payload.sc, lastStreakDate: payload.lsd || null });

  const foundItems = { sword: [], shield: [], helmet: [], cape: [] };
  const equipped = { sword: null, shield: null, helmet: null, cape: null };
  SLOTS.forEach((slot) => {
    if (Array.isArray(payload.f[slot])) foundItems[slot] = payload.f[slot].filter((id) => !!itemById(slot, id));
    if (payload.e[slot] && itemById(slot, payload.e[slot])) equipped[slot] = payload.e[slot];
  });
  gearState = { foundItems, equipped };
  writeGear(gearState);
  touchState(payload.updatedAt || Date.now());

  renderRewards();
  renderGearStatus();
  renderCharacterScreen();
  renderSceneStatic();
}

/* ---------- Sheet sync: push on change, pull on load/reconnect ---------- */

async function pushGameState() {
  const webhookUrl = localStorage.getItem(LS_WEBHOOK);
  if (!webhookUrl || !navigator.onLine) return;
  try {
    // Same fire-and-forget no-cors write as the task-log queue (see
    // flushQueue) — we can't read the response, but that's fine: this always
    // sends the full current snapshot, so a dropped push just gets superseded
    // by the next state change instead of losing anything.
    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'saveState', ...currentStatePayload() }),
    });
  } catch {
    // Offline or the request failed — the next state change (or reconnect)
    // retries with the current snapshot.
  }
}

async function pullGameState() {
  const webhookUrl = localStorage.getItem(LS_WEBHOOK);
  if (!webhookUrl || !navigator.onLine) return;
  try {
    const res = await fetchJSONP(webhookUrl, { action: 'state' });
    if (!res || res.ok !== true || !res.state) return;
    const merged = mergeStatePayloads(currentStatePayload(), res.state);
    applyStatePayload(merged);
    pushGameState(); // write the merged result back so both sides converge
  } catch {
    // Offline or the request failed — local state stays authoritative until
    // the next successful pull.
  }
}

function saveCodeChecksum(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = ((hash * 33) ^ str.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

function encodeSaveCode() {
  const payload = { v: SAVE_CODE_VERSION, ...currentStatePayload() };
  const body = btoa(JSON.stringify(payload));
  return `PPC1-${body}-${saveCodeChecksum(body)}`;
}

function decodeSaveCode(code) {
  const cleaned = code.trim().replace(/\s+/g, '');
  const match = /^PPC1-([A-Za-z0-9+/=]+)-([a-z0-9]+)$/.exec(cleaned);
  if (!match) throw new Error("That doesn't look like a save code");
  const [, body, sum] = match;
  if (saveCodeChecksum(body) !== sum) throw new Error('Code looks corrupted — check for missing characters');
  let payload;
  try { payload = JSON.parse(atob(body)); } catch { throw new Error('Could not read that code'); }
  if (!payload || typeof payload.xp !== 'number' || typeof payload.sc !== 'number' || !payload.f || !payload.e) {
    throw new Error('That code is missing required data');
  }
  return payload;
}

/* ---------- Actions ---------- */

async function handleSubmit(ev) {
  ev.preventDefault();
  const active = getActiveTask();
  const timestamp = new Date().toISOString();

  if (!active) {
    const task = el.taskInput.value.trim();
    const description = el.descriptionInput.value.trim();
    const tab = el.tabInput.value.trim() || 'Work';
    if (!task) return;

    const item = { task, description, tab, action: 'Start', timestamp };
    const id = await queueAdd(item);
    addLogEntry({ qid: id, ...item, status: 'pending' });
    setActiveTask({ task, description, tab, startedAt: timestamp });
    rememberTask(task);
  } else {
    const item = { task: active.task, description: active.description, tab: active.tab, action: 'Stop', timestamp };
    const id = await queueAdd(item);
    addLogEntry({ qid: id, ...item, status: 'pending' });
    setActiveTask(null);

    const durationSeconds = (new Date(timestamp).getTime() - new Date(active.startedAt).getTime()) / 1000;
    grantReward(durationSeconds);
  }

  renderTimer();
  renderPendingBadge();
  flushQueue();
}

/* ---------- Wiring ---------- */

function switchView(view) {
  const showTracker = view === 'tracker';
  const showCharacter = view === 'character';
  const showMetrics = view === 'metrics';
  el.viewTracker.hidden = !showTracker;
  el.viewCharacter.hidden = !showCharacter;
  el.viewMetrics.hidden = !showMetrics;
  el.navTracker.classList.toggle('active', showTracker);
  el.navCharacter.classList.toggle('active', showCharacter);
  el.navMetrics.classList.toggle('active', showMetrics);
  if (showMetrics) loadMetrics();
  if (showCharacter) renderCharacterScreen();
}

function init() {
  el.webhookInput.value = localStorage.getItem(LS_WEBHOOK) || '';
  el.settingsCard.hidden = !!localStorage.getItem(LS_WEBHOOK);

  try { renderTaskOptions(JSON.parse(localStorage.getItem(LS_RECENT_TASKS) || '[]')); } catch {}

  renderTimer();
  renderLog();
  renderPendingBadge();
  renderStatusDot();
  renderRewards();
  el.soundToggle.checked = soundEnabled();
  renderGearStatus();
  renderCharacterScreen();
  if (prefersReducedMotion) renderSceneStatic(); else startSceneLoop();

  setInterval(renderTimer, 1000);
  // Fallback in case the 'online' event doesn't fire reliably on some
  // mobile browsers (notably iOS Safari after backgrounding).
  setInterval(() => { if (navigator.onLine) flushQueue(); }, 20000);

  el.form.addEventListener('submit', handleSubmit);

  el.navTracker.addEventListener('click', () => switchView('tracker'));
  el.navCharacter.addEventListener('click', () => switchView('character'));
  el.navMetrics.addEventListener('click', () => switchView('metrics'));
  el.refreshMetrics.addEventListener('click', () => loadMetrics());

  el.settingsToggle.addEventListener('click', () => {
    el.settingsCard.hidden = !el.settingsCard.hidden;
  });

  el.soundToggle.addEventListener('change', () => {
    localStorage.setItem(LS_SOUND, el.soundToggle.checked ? 'true' : 'false');
  });

  el.toggleWebhookVisibility.addEventListener('click', () => {
    const showing = el.webhookInput.type === 'text';
    el.webhookInput.type = showing ? 'password' : 'text';
    el.toggleWebhookVisibility.textContent = showing ? '👁' : '🙈';
    el.toggleWebhookVisibility.setAttribute('aria-label', showing ? 'Show URL' : 'Hide URL');
  });

  el.saveWebhook.addEventListener('click', () => {
    const url = el.webhookInput.value.trim();
    if (!url) { toast('Enter a Web App URL first'); return; }
    localStorage.setItem(LS_WEBHOOK, url);
    toast('Webhook URL saved');
    flushQueue();
  });

  el.retrySync.addEventListener('click', () => {
    if (!navigator.onLine) { toast("You're offline"); return; }
    if (!localStorage.getItem(LS_WEBHOOK)) { toast('Set the webhook URL in settings first'); return; }
    toast('Syncing…');
    flushQueue();
  });

  el.clearLog.addEventListener('click', async () => {
    const q = await queueAll();
    const warning = q.length > 0
      ? `Clear all activity? This also discards ${q.length} entr${q.length === 1 ? 'y' : 'ies'} still queued and not yet synced.`
      : 'Clear all activity?';
    if (!confirm(warning)) return;
    writeLog([]);
    for (const item of q) await queueRemove(item.id);
    renderLog();
    renderPendingBadge();
    toast('Activity cleared');
  });

  el.generateSaveCode.addEventListener('click', () => {
    el.saveCodeOutput.value = encodeSaveCode();
    el.saveCodeField.hidden = false;
    el.saveCodeOutput.select();
  });

  el.copySaveCode.addEventListener('click', async () => {
    if (!el.saveCodeOutput.value) return;
    try {
      await navigator.clipboard.writeText(el.saveCodeOutput.value);
      toast('Save code copied');
    } catch {
      el.saveCodeOutput.select();
      toast('Copy failed — code is selected, copy it manually');
    }
  });

  el.loadSaveCode.addEventListener('click', () => {
    const raw = el.loadCodeInput.value;
    if (!raw.trim()) { toast('Paste a save code first'); return; }
    let payload;
    try {
      payload = decodeSaveCode(raw);
    } catch (err) {
      toast(err.message);
      return;
    }
    // Merged, not overwritten — this can only move progress forward (see
    // mergeStatePayloads), so there's nothing here that needs a confirm().
    applyStatePayload(mergeStatePayloads(currentStatePayload(), payload));
    pushGameState();
    el.loadCodeInput.value = '';
    toast('Save code loaded');
  });

  window.addEventListener('online', () => { renderStatusDot(); flushQueue(); pullGameState(); });
  window.addEventListener('offline', renderStatusDot);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      renderTimer();
      if (navigator.onLine) { flushQueue(); pullGameState(); }
      startSceneLoop();
    } else {
      stopSceneLoop();
    }
  });

  // Custom "Add to Home Screen" prompt (Android/Chromium; Safari has no such event).
  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    el.installBtn.hidden = false;
  });
  el.installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    el.installBtn.hidden = true;
  });
  window.addEventListener('appinstalled', () => { el.installBtn.hidden = true; });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  if (navigator.onLine) { flushQueue(); pullGameState(); }
}

document.addEventListener('DOMContentLoaded', init);
