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
  settingsModal: document.getElementById('settings-modal'),
  settingsModalClose: document.getElementById('settings-modal-close'),
  replayTutorial: document.getElementById('replay-tutorial'),
  tutorialModal: document.getElementById('tutorial-modal'),
  tutorialSkip: document.getElementById('tutorial-skip'),
  tutorialStepCounter: document.getElementById('tutorial-step-counter'),
  tutorialStepTitle: document.getElementById('tutorial-step-title'),
  tutorialStepBody: document.getElementById('tutorial-step-body'),
  tutorialBack: document.getElementById('tutorial-back'),
  tutorialNext: document.getElementById('tutorial-next'),
  tutorialCopyCode: document.getElementById('tutorial-copy-code'),
  copyCodeGs: document.getElementById('copy-code-gs'),
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
  sceneModeTag: document.getElementById('scene-mode-tag'),
  eventMeter: document.getElementById('event-meter'),
  eventMeterLabel: document.getElementById('event-meter-label'),
  eventMeterFill: document.getElementById('event-meter-fill'),
  charCanvas: document.getElementById('char-canvas'),
  charTierName: document.getElementById('char-tier-name'),
  charStatLevel: document.getElementById('char-stat-level'),
  charStatStreak: document.getElementById('char-stat-streak'),
  syncGameState: document.getElementById('sync-game-state'),
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

  // The event meter is independent of leveling — it fills a notch per Stop
  // once at least one environment is unlocked, and swaps the next battle for
  // that environment's special event instead of a normal fight when full.
  const envs = unlockedEnvironments();
  let eventEnvId = null;
  if (envs.length > 0) {
    gearState.eventProgress = (gearState.eventProgress || 0) + 1;
    if (gearState.eventProgress >= EVENT_METER_TARGET) {
      gearState.eventProgress = 0;
      eventEnvId = envs[Math.floor(Math.random() * envs.length)].id;
    }
    writeGear(gearState);
  }

  touchState(Date.now());
  pushGameState();
  renderRewards();
  renderEventMeter();
  showXpFloat(gained);
  playRewardSound(leveledUp);
  if (leveledUp) showLevelUp(after);
  startBattle(eventEnvId);
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
    { id: 'ench_blade', name: 'Enchanted Blade', tier: 7, colors: { blade: '#7ce7ff', blade_D: '#29adff', accent: '#ffd700', accent_D: '#c9a500', grip: '#8a6238', grip_D: '#5c4020' } },
    // Set-exclusive: never rolled by rollLoot() (see its !item.set filter) —
    // only dropped by that environment's event battle (see rollEventLoot).
    { id: 'rusted_cleaver', name: 'Rusted Cleaver', tier: 99, set: 'dungeon_delver', colors: { blade: '#8a9a6a', blade_D: '#5a6a3a', accent: '#4a3a2a', accent_D: '#2a1e18', grip: '#3a2a1a', grip_D: '#241a10' } },
    { id: 'guards_longsword', name: "Guard's Longsword", tier: 99, set: 'castle_guard', colors: { blade: '#dce4f0', blade_D: '#a8b8d0', accent: '#ffd700', accent_D: '#c9a500', grip: '#2a3a6a', grip_D: '#1a2648' } }
  ],
  shield: [
    { id: 'wood_shield', name: 'Wooden Shield', tier: 1, colors: { body: '#8a6238', body_D: '#5c4020', emblem: '#c4a274', emblem_D: '#8a6238' } },
    { id: 'iron_shield', name: 'Iron Shield', tier: 3, colors: { body: '#c4c4d4', body_D: '#8a8a9a', emblem: '#ffd700', emblem_D: '#c9a500' } },
    { id: 'tower_shield', name: 'Tower Shield', tier: 4, colors: { body: '#5a5a6a', body_D: '#3a3a4a', emblem: '#ffd700', emblem_D: '#c9a500' } },
    { id: 'dragon_ward', name: "Dragon's Ward", tier: 7, colors: { body: '#ff4d4d', body_D: '#c02020', emblem: '#ffd700', emblem_D: '#c9a500' } },
    { id: 'cracked_buckler', name: 'Cracked Buckler', tier: 99, set: 'dungeon_delver', colors: { body: '#5a4a3a', body_D: '#3a2e20', emblem: '#8a9a6a', emblem_D: '#5a6a3a' } },
    { id: 'crest_shield', name: 'Crest Shield', tier: 99, set: 'castle_guard', colors: { body: '#2a3a6a', body_D: '#1a2648', emblem: '#ffd700', emblem_D: '#c9a500' } }
  ],
  helmet: [
    { id: 'leather_cap', name: 'Leather Cap', tier: 2, colors: { main: '#8a6238', main_D: '#5c4020' } },
    { id: 'iron_helm', name: 'Iron Helm', tier: 4, colors: { main: '#dcdce8', main_D: '#a8a8ba' } },
    { id: 'horned_helm', name: 'Horned Helm', tier: 5, colors: { main: '#5a5a6a', main_D: '#3a3a4a' } },
    { id: 'dragon_crown', name: 'Dragon Crown', tier: 7, colors: { main: '#ffd700', main_D: '#c9a500' } },
    { id: 'lantern_helm', name: "Miner's Lantern Helm", tier: 99, set: 'dungeon_delver', colors: { main: '#7a6a4a', main_D: '#4a3e28' } },
    { id: 'plumed_helm', name: 'Plumed Helm', tier: 99, set: 'castle_guard', colors: { main: '#8a8a9a', main_D: '#5a5a6a' } }
  ],
  cape: [
    { id: 'torn_cloak', name: 'Torn Cloak', tier: 3, colors: { main: '#8a5a2b', main_D: '#5c3a1a' } },
    { id: 'knight_cape', name: "Knight's Cape", tier: 4, colors: { main: '#29adff', main_D: '#1b7dbf' } },
    { id: 'royal_cape', name: 'Royal Cape', tier: 5, colors: { main: '#b030d0', main_D: '#7a1f8f' } },
    { id: 'dragon_cape', name: 'Dragon-scale Cape', tier: 7, colors: { main: '#ff4d4d', main_D: '#c02020' } },
    { id: 'delver_cloak', name: "Tattered Delver's Cloak", tier: 99, set: 'dungeon_delver', colors: { main: '#4a5a3a', main_D: '#2a3a1e' } },
    { id: 'sentinel_cape', name: "Sentinel's Cape", tier: 99, set: 'castle_guard', colors: { main: '#2a3a6a', main_D: '#1a2648' } }
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

function drawBat(ctx, x, y) {
  ctx.fillStyle = '#2a1a3a';
  ctx.fillRect(x - 20, y - 24, 16, 6);
  ctx.fillRect(x + 4, y - 24, 16, 6);
  ctx.fillStyle = '#4a3a5a';
  ctx.fillRect(x - 5, y - 22, 10, 9);
  ctx.fillStyle = '#ff004d';
  ctx.fillRect(x - 3, y - 19, 2, 2);
  ctx.fillRect(x + 1, y - 19, 2, 2);
}
function drawSpider(ctx, x, y) {
  ctx.fillStyle = '#1a1a22';
  ctx.fillRect(x - 10, y - 16, 20, 12);
  ctx.fillRect(x - 5, y - 22, 10, 8);
  ctx.fillRect(x - 18, y - 15, 8, 2);
  ctx.fillRect(x - 17, y - 9, 8, 2);
  ctx.fillRect(x + 10, y - 15, 8, 2);
  ctx.fillRect(x + 9, y - 9, 8, 2);
  ctx.fillStyle = '#ff004d';
  ctx.fillRect(x - 3, y - 20, 2, 2);
  ctx.fillRect(x + 1, y - 20, 2, 2);
}
function drawDungeonZombie(ctx, x, y) {
  ctx.fillStyle = '#5a7a5a';
  ctx.fillRect(x - 5, y - 30, 10, 10);
  ctx.fillRect(x - 9, y - 20, 18, 16);
  ctx.fillRect(x - 9, y - 4, 6, 4);
  ctx.fillRect(x + 3, y - 4, 6, 4);
  ctx.fillStyle = '#0d0d1a';
  ctx.fillRect(x - 3, y - 26, 2, 3);
  ctx.fillRect(x + 1, y - 26, 2, 3);
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(x - 15, y - 18, 6, 14);
}
function drawRoyalGuard(ctx, x, y) {
  ctx.fillStyle = '#2a3a6a';
  ctx.fillRect(x - 8, y - 34, 16, 12);
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(x - 3, y - 40, 6, 8);
  ctx.fillStyle = '#8a8a9a';
  ctx.fillRect(x - 12, y - 22, 24, 20);
  ctx.fillStyle = '#2a3a6a';
  ctx.fillRect(x - 12, y - 4, 8, 4);
  ctx.fillRect(x + 4, y - 4, 8, 4);
  ctx.fillStyle = '#c9a500';
  ctx.fillRect(x + 13, y - 26, 3, 24);
}
function drawDarkKnight(ctx, x, y) {
  ctx.fillStyle = '#1a1a22';
  ctx.fillRect(x - 8, y - 34, 16, 12);
  ctx.fillStyle = '#ff004d';
  ctx.fillRect(x - 3, y - 30, 2, 3);
  ctx.fillRect(x + 1, y - 30, 2, 3);
  ctx.fillStyle = '#2a2a35';
  ctx.fillRect(x - 14, y - 22, 28, 22);
  ctx.fillStyle = '#1a1a22';
  ctx.fillRect(x - 14, y - 4, 8, 4);
  ctx.fillRect(x + 6, y - 4, 8, 4);
  ctx.fillStyle = '#5a0a2a';
  ctx.fillRect(x + 15, y - 26, 4, 24);
}
function drawCourtWizard(ctx, x, y) {
  ctx.fillStyle = '#5a1a8a';
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 26); ctx.lineTo(x, y - 42); ctx.lineTo(x + 8, y - 26);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f0d8b0';
  ctx.fillRect(x - 4, y - 26, 8, 6);
  ctx.fillStyle = '#5a1a8a';
  ctx.fillRect(x - 10, y - 20, 20, 18);
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(x - 10, y - 4, 6, 4);
  ctx.fillRect(x + 4, y - 4, 6, 4);
  ctx.fillStyle = '#3a3a5a';
  ctx.fillRect(x - 17, y - 24, 3, 22);
  ctx.fillStyle = '#7ce7ff';
  ctx.fillRect(x - 19, y - 28, 7, 6);
}

const ENVIRONMENT_MONSTERS = {
  dungeon: [
    { name: 'Cave Bat', draw: drawBat },
    { name: 'Giant Spider', draw: drawSpider },
    { name: 'Dungeon Zombie', draw: drawDungeonZombie },
  ],
  castle: [
    { name: 'Royal Guard', draw: drawRoyalGuard },
    { name: 'Dark Knight', draw: drawDarkKnight },
    { name: 'Court Wizard', draw: drawCourtWizard },
  ],
};

// Dungeon/Castle aren't places the avatar lives — they only appear for the
// duration of their own special event battle (see startBattle), triggered by
// the event meter below, then the scene reverts to the plains. Each has its
// own 4-piece gear set that never drops from a normal fight (see rollLoot's
// !item.set filter) — only from that environment's event (see rollEventLoot).
const ENVIRONMENTS = [
  { id: 'dungeon', name: 'Dungeon', eventName: 'Dungeon Raid', minLevel: 7, setId: 'dungeon_delver' },
  { id: 'castle', name: 'Castle', eventName: 'Castle Siege', minLevel: 12, setId: 'castle_guard' },
];

// A complete matching set (all 4 slots from the same set) boosts loot odds on
// every future fight and overrides the streak glow with its own color while
// worn — see activeSetBonus().
const SET_BONUSES = {
  dungeon_delver: { name: 'Dungeon Delver', lootBonus: 0.15, glow: { color: '90,180,70', blur: 20, pulse: false } },
  castle_guard: { name: 'Castle Guard', lootBonus: 0.15, glow: { color: '176,48,208', blur: 22, pulse: false } },
};

const EVENT_METER_TARGET = 5;

function unlockedEnvironments() {
  const lvl = currentLevel();
  return ENVIRONMENTS.filter((e) => lvl >= e.minLevel);
}
function pickEventMonster(envId) {
  const pool = ENVIRONMENT_MONSTERS[envId];
  return pool[Math.floor(Math.random() * pool.length)];
}

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
    if (raw && raw.foundItems && raw.equipped) return { eventProgress: 0, ...raw };
  } catch {}
  return { foundItems: { sword: [], shield: [], helmet: [], cape: [] }, equipped: { sword: null, shield: null, helmet: null, cape: null }, eventProgress: 0 };
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

/* ---------- Skirmish: ambient fighting while a session is actively tracked ---------- */
/* A translucent, reward-free loop of clashes that plays only while the timer
   is running — makes "something is happening" visible during real work,
   distinct from the idle vignettes (which are reserved for between sessions,
   see sceneTick). Never touches rollLoot()/grantReward(); the only fight that
   ever grants anything is the real one startBattle() resolves on Stop —
   which picks up whichever ghost is on screen at that moment, if any. */

const GHOST_MS = { approach: 500, clash: 250, fade: 350 };
let ghost = null; // { monster, phase, phaseStart, x }

function startGhostCycle(t) {
  ghost = { monster: pickMonster(), phase: 'approach', phaseStart: t, x: SCENE_W + 24 };
}

function advanceGhost(t) {
  const elapsed = t - ghost.phaseStart;
  if (ghost.phase === 'approach') {
    const progress = Math.min(1, elapsed / GHOST_MS.approach);
    ghost.x = (SCENE_W + 24) - progress * (SCENE_W + 24 - MONSTER_REST_X);
    if (progress >= 1) { ghost.phase = 'clash'; ghost.phaseStart = t; }
  } else if (ghost.phase === 'clash') {
    if (elapsed >= GHOST_MS.clash) { ghost.phase = 'fade'; ghost.phaseStart = t; }
  } else if (ghost.phase === 'fade') {
    if (elapsed >= GHOST_MS.fade) { ghost = null; }
  }
}

function drawGhost(ctx, t) {
  let alpha = 0.45;
  if (ghost.phase === 'fade') alpha *= Math.max(0, 1 - (t - ghost.phaseStart) / GHOST_MS.fade);
  const shake = ghost.phase === 'clash' ? Math.sin(t * 0.09) * 2 : 0;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(shake, 0);
  scaleMonsterAt(ctx, ghost.x, GROUND_Y, () => drawMonsterWithOutline(ctx, ghost.monster, ghost.x, GROUND_Y));
  ctx.restore();
}

// A complete matching set equipped across all 4 slots — see SET_BONUSES.
function activeSetBonus() {
  const eq = gearState.equipped;
  if (!eq.sword || !eq.shield || !eq.helmet || !eq.cape) return null;
  const items = SLOTS.map((slot) => itemById(slot, eq[slot]));
  if (items.some((it) => !it || !it.set)) return null;
  const setId = items[0].set;
  if (!items.every((it) => it.set === setId)) return null;
  return SET_BONUSES[setId] || null;
}

function rollLoot() {
  // Eligible items are gated by the player's unlocked level tier, not the
  // specific monster faced this encounter — pickMonster() sometimes picks a
  // weaker monster for flavor/variety, and gating loot to *that* tier meant
  // those fights could never drop anything once its few items were already
  // found (an empty candidate pool with no chance to roll at all). Set-
  // exclusive items (item.set) are excluded here entirely — those only come
  // from an environment's event battle, see rollEventLoot.
  const maxTier = levelTierIndex(currentLevel());
  const candidates = [];
  SLOTS.forEach((slot) => {
    GEAR_ITEMS[slot].forEach((item) => {
      if (!item.set && item.tier <= maxTier && gearState.foundItems[slot].indexOf(item.id) === -1) candidates.push({ slot, item });
    });
  });
  const bonus = activeSetBonus();
  const dropChance = 0.55 + (bonus ? bonus.lootBonus : 0);
  if (candidates.length > 0 && Math.random() < dropChance) {
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

// Event battles roll against that environment's own exclusive set only —
// guaranteed to drop something until the whole set is found (a raid you
// fought your way into should pay off), then falls back to XP-only.
function rollEventLoot(envId) {
  const env = ENVIRONMENTS.find((e) => e.id === envId);
  const candidates = [];
  SLOTS.forEach((slot) => {
    GEAR_ITEMS[slot].forEach((item) => {
      if (item.set === env.setId && gearState.foundItems[slot].indexOf(item.id) === -1) candidates.push({ slot, item });
    });
  });
  if (candidates.length === 0) return { type: 'xp' };
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  gearState.foundItems[pick.slot].push(pick.item.id);
  if (!gearState.equipped[pick.slot]) gearState.equipped[pick.slot] = pick.item.id;
  writeGear(gearState);
  touchState(Date.now());
  pushGameState();
  return { type: 'gear', slot: pick.slot, item: pick.item };
}

const PHASE_MS = { approach: 650, clash: 320, victory: 550, loot: 1300 };
let battle = null;

function startBattle(eventEnvId) {
  if (battle) return;
  // A real fight always takes priority over ambient flavor.
  if (activeVignette) { activeVignette = null; el.monsterBanner.classList.remove('show'); }
  const isEvent = !!eventEnvId;
  // A normal (non-event) fight picks up whatever skirmish ghost is already on
  // screen instead of starting fresh — "the skirmish becomes real" rather
  // than a brand-new monster appearing out of nowhere. Events always start
  // clean; they're meant to read as their own distinct, bigger moment.
  const usingGhost = !isEvent && ghost && (ghost.phase === 'approach' || ghost.phase === 'clash');
  const monster = isEvent ? pickEventMonster(eventEnvId) : (usingGhost ? ghost.monster : pickMonster());
  const startX = usingGhost ? ghost.x : SCENE_W + 24;
  const startPhase = usingGhost ? 'clash' : 'approach';
  ghost = null;
  if (prefersReducedMotion) {
    showLootFloat(isEvent ? rollEventLoot(eventEnvId) : rollLoot());
    renderSceneStatic();
    return;
  }
  battle = { phase: startPhase, phaseStart: null, monster, monsterX: startX, loot: null, envId: eventEnvId || null };
  const env = isEvent ? ENVIRONMENTS.find((e) => e.id === eventEnvId) : null;
  el.monsterBanner.textContent = isEvent
    ? `${env.eventName.toUpperCase()}! ${monster.name.toUpperCase()} APPEARS!`
    : usingGhost
      ? monster.name.toUpperCase() + '!'
      : 'A WILD ' + monster.name.toUpperCase() + ' APPROACHES!';
  el.monsterBanner.classList.add('show');
}

function nextBattlePhase(phase, t) { battle.phase = phase; battle.phaseStart = t; }

function advanceBattle(t) {
  if (battle.phaseStart === null) battle.phaseStart = t;
  const elapsed = t - battle.phaseStart;
  if (battle.phase === 'approach') {
    const progress = Math.min(1, elapsed / PHASE_MS.approach);
    battle.monsterX = (SCENE_W + 24) - progress * (SCENE_W + 24 - MONSTER_REST_X);
    if (progress >= 1) nextBattlePhase('clash', t);
  } else if (battle.phase === 'clash') {
    if (elapsed >= PHASE_MS.clash) {
      battle.loot = battle.envId ? rollEventLoot(battle.envId) : rollLoot();
      el.monsterBanner.classList.remove('show');
      nextBattlePhase('victory', t);
    }
  } else if (battle.phase === 'victory') {
    if (elapsed >= PHASE_MS.victory) { showLootFloat(battle.loot); nextBattlePhase('loot', t); }
  } else if (battle.phase === 'loot') {
    if (elapsed >= PHASE_MS.loot) battle = null;
  }
}

// Monsters are drawn at their original hand-picked pixel sizes (see
// drawSlime etc.) which reads small next to the avatar's 90x96 footprint —
// this scales any monster up around its own ground-contact point (so bigger
// monsters grow from their feet, not from the canvas corner) without having
// to touch each draw function's coordinates individually.
const MONSTER_SCALE = 1.7;

function scaleMonsterAt(ctx, x, y, drawFn) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(MONSTER_SCALE, MONSTER_SCALE);
  ctx.translate(-x, -y);
  drawFn();
  ctx.restore();
}

// A thin 1px dark outline behind each monster — some environment palettes
// put a similarly-toned background right behind a monster's own colors
// (e.g. a green slime against mossy dungeon stone), and a dark edge keeps
// the silhouette readable regardless of what's behind it. Rendered once per
// monster into an off-screen buffer and cached, since every monster's shape
// is a fixed set of fillRect/path calls with no time-dependent drawing.
const MONSTER_OUTLINE_COLOR = '#000000';
const OUTLINE_BUF_W = 120, OUTLINE_BUF_H = 90;
const OUTLINE_ANCHOR_X = 60, OUTLINE_ANCHOR_Y = 50;
const monsterOutlineCache = new Map();

function getMonsterOutline(monster) {
  let canvas = monsterOutlineCache.get(monster);
  if (canvas) return canvas;
  canvas = document.createElement('canvas');
  canvas.width = OUTLINE_BUF_W;
  canvas.height = OUTLINE_BUF_H;
  const octx = canvas.getContext('2d');
  monster.draw(octx, OUTLINE_ANCHOR_X, OUTLINE_ANCHOR_Y);
  octx.globalCompositeOperation = 'source-in';
  octx.fillStyle = MONSTER_OUTLINE_COLOR;
  octx.fillRect(0, 0, OUTLINE_BUF_W, OUTLINE_BUF_H);
  monsterOutlineCache.set(monster, canvas);
  return canvas;
}

function drawMonsterWithOutline(ctx, monster, x, y) {
  const outline = getMonsterOutline(monster);
  const ox = x - OUTLINE_ANCHOR_X, oy = y - OUTLINE_ANCHOR_Y;
  ctx.drawImage(outline, ox - 1, oy);
  ctx.drawImage(outline, ox + 1, oy);
  ctx.drawImage(outline, ox, oy - 1);
  ctx.drawImage(outline, ox, oy + 1);
  monster.draw(ctx, x, y);
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
  scaleMonsterAt(ctx, battle.monsterX, GROUND_Y, () => drawMonsterWithOutline(ctx, m, battle.monsterX, GROUND_Y));
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

// Hidden until at least one environment is unlocked (see unlockedEnvironments)
// — below that level there's nothing to count toward yet.
function renderEventMeter() {
  const envs = unlockedEnvironments();
  if (envs.length === 0) { el.eventMeter.hidden = true; return; }
  el.eventMeter.hidden = false;
  const progress = Math.min(EVENT_METER_TARGET, gearState.eventProgress || 0);
  const remaining = EVENT_METER_TARGET - progress;
  const label = envs.length === 1 ? envs[0].eventName : 'Next Event';
  el.eventMeterLabel.textContent = remaining === 0 ? `${label.toUpperCase()} READY!` : `${remaining} MORE TO ${label.toUpperCase()}`;
  el.eventMeterFill.style.width = `${(progress / EVENT_METER_TARGET) * 100}%`;
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
// Where a monster settles once it's finished approaching, for both the real
// battle and the skirmish ghost — pushed out from the avatar's own SPRITE_X
// footprint so a monster scaled up by MONSTER_SCALE reads as standing next
// to the avatar during a clash instead of mostly hiding behind it.
const MONSTER_REST_X = SPRITE_X + 100;
let sceneCtx = el.sceneCanvas.getContext('2d');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function drawTiled(repeatW, speed, scrollX, drawTile) {
  const offset = (scrollX * speed) % repeatW;
  for (let x = -offset - repeatW; x < SCENE_W + repeatW; x += repeatW) drawTile(x);
}

function drawSkyGradient(top, bottom) {
  const ctx = sceneCtx;
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, top);
  sky.addColorStop(1, bottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
}
function drawGroundBase(color) {
  const ctx = sceneCtx;
  ctx.fillStyle = color;
  ctx.fillRect(0, GROUND_Y, SCENE_W, SCENE_H - GROUND_Y);
}

// Plains is the avatar's normal home — Dungeon/Castle only appear for the
// duration of their own event battle (see startBattle), selected by whatever
// battle.envId currently is. While just walking, the background cycles
// through these palettes on its own (see drawWalkingBackground) — no pose
// change, no banner, just ambient variety, distinct from the Vignettes below.
const SCENERY = {
  dusk: {
    name: 'Dusk Plains',
    draw: (scrollX) => {
      const ctx = sceneCtx;
      drawSkyGradient('#1a1a3e', '#2d2d5e');
      ctx.fillStyle = '#3a3a6a';
      drawTiled(90, 0.15, scrollX, (x) => { ctx.fillRect(x, 24, 28, 8); ctx.fillRect(x + 6, 18, 16, 8); });
      ctx.fillStyle = '#3d2d5e';
      drawTiled(110, 0.4, scrollX, (x) => {
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y); ctx.lineTo(x + 30, GROUND_Y - 40); ctx.lineTo(x + 70, GROUND_Y);
        ctx.closePath(); ctx.fill();
      });
      drawGroundBase('#14142a');
      ctx.fillStyle = '#00e436';
      drawTiled(18, 1, scrollX, (x) => { ctx.fillRect(x, GROUND_Y - 3, 3, 3); ctx.fillRect(x + 8, GROUND_Y - 5, 3, 5); });
    }
  },
  meadow: {
    name: 'Sunny Meadow',
    draw: (scrollX) => {
      const ctx = sceneCtx;
      drawSkyGradient('#5ec8f0', '#a6e6ea');
      ctx.fillStyle = '#f5f5f5';
      drawTiled(120, 0.15, scrollX, (x) => { ctx.fillRect(x, 20, 26, 7); ctx.fillRect(x + 8, 15, 14, 7); ctx.fillRect(x + 16, 20, 20, 6); });
      ctx.fillStyle = '#4a8a4a';
      drawTiled(100, 0.35, scrollX, (x) => {
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y); ctx.lineTo(x + 26, GROUND_Y - 30); ctx.lineTo(x + 60, GROUND_Y);
        ctx.closePath(); ctx.fill();
      });
      drawGroundBase('#2a5a2a');
      ctx.fillStyle = '#ffd700';
      drawTiled(46, 1.1, scrollX, (x) => { ctx.fillRect(x, GROUND_Y - 5, 2, 2); });
      ctx.fillStyle = '#ff8ab0';
      drawTiled(70, 1.2, scrollX, (x) => { ctx.fillRect(x, GROUND_Y - 5, 2, 2); });
    }
  },
  autumn: {
    name: 'Autumn Grove',
    draw: (scrollX) => {
      const ctx = sceneCtx;
      drawSkyGradient('#4a2e1e', '#8a5a3a');
      ctx.fillStyle = '#4a2a14';
      drawTiled(80, 0.2, scrollX, (x) => { ctx.fillRect(x, 34, 7, 50); });
      ctx.fillStyle = '#c9642a';
      drawTiled(80, 0.2, scrollX, (x) => { ctx.fillRect(x - 13, 22, 33, 20); });
      drawGroundBase('#2a1a12');
      ctx.fillStyle = '#c9642a';
      drawTiled(22, 1, scrollX, (x) => { ctx.fillRect(x, GROUND_Y - 3, 3, 3); });
      ctx.fillStyle = '#e0a030';
      drawTiled(34, 1.15, scrollX, (x) => { ctx.fillRect(x, GROUND_Y - 5, 3, 3); });
    }
  },
  mist: {
    name: 'Misty Woods',
    draw: (scrollX) => {
      const ctx = sceneCtx;
      drawSkyGradient('#3a4038', '#5a655c');
      ctx.fillStyle = '#3a453e';
      drawTiled(50, 0.25, scrollX, (x) => { ctx.fillRect(x, 20, 5, 60); ctx.fillRect(x - 8, 14, 21, 20); });
      drawGroundBase('#20261f');
      ctx.fillStyle = 'rgba(200,215,205,0.18)';
      ctx.fillRect(0, GROUND_Y - 30, SCENE_W, 30);
      ctx.fillStyle = 'rgba(200,215,205,0.12)';
      ctx.fillRect(0, GROUND_Y - 55, SCENE_W, 20);
    }
  },
  night: {
    name: 'Starry Night',
    draw: (scrollX, t) => {
      const ctx = sceneCtx;
      drawSkyGradient('#05050f', '#12122a');
      ctx.fillStyle = '#20203a';
      drawTiled(120, 0.3, scrollX, (x) => {
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y); ctx.lineTo(x + 30, GROUND_Y - 36); ctx.lineTo(x + 70, GROUND_Y);
        ctx.closePath(); ctx.fill();
      });
      drawGroundBase('#0a0a16');
      const blink = (Math.sin((t || 0) * 0.006) + 1) / 2;
      ctx.fillStyle = `rgba(255,215,110,${(0.4 + blink * 0.5).toFixed(2)})`;
      drawTiled(64, 1, scrollX, (x) => { ctx.fillRect(x, GROUND_Y - 20, 2, 2); });
      ctx.fillStyle = '#f5f5f5';
      drawTiled(34, 0.05, scrollX, (x) => { ctx.fillRect(x, (x * 53) % 80, 2, 2); });
    }
  }
};

// Off-screen buffers used only while a scenery transition is playing: the
// outgoing and incoming palettes each render in full to their own buffer,
// then get composited onto the real canvas with a crossfade. Every
// SCENERY.draw() (and the drawTiled/drawGroundBase helpers it calls) targets
// whichever canvas the shared sceneCtx variable currently points to, so
// redirecting it before the call is enough to render off-screen without
// duplicating any drawing code.
const fadeCanvasA = document.createElement('canvas');
fadeCanvasA.width = SCENE_W; fadeCanvasA.height = SCENE_H;
const fadeCanvasB = document.createElement('canvas');
fadeCanvasB.width = SCENE_W; fadeCanvasB.height = SCENE_H;

function renderSceneryTo(targetCanvas, key, scrollX, t) {
  const saved = sceneCtx;
  sceneCtx = targetCanvas.getContext('2d');
  SCENERY[key].draw(scrollX, t);
  sceneCtx = saved;
}

let currentScenery = 'dusk';
let sceneryTransition = null; // { from, to, start }
const SCENERY_TRANSITION_MS = 1800;
const SCENERY_MIN_MS = 5 * 60000, SCENERY_MAX_MS = 10 * 60000;

function randomRange(min, max) { return min + Math.random() * (max - min); }
function pickNextScenery() {
  const keys = Object.keys(SCENERY).filter((k) => k !== currentScenery);
  return keys[Math.floor(Math.random() * keys.length)];
}

// A hard cut between two very different palettes (a bright meadow to a
// starry night, say) reads as broken rather than "time passed" — this
// crossfades the old and new backgrounds over SCENERY_TRANSITION_MS instead.
function drawWalkingBackground(scrollX, t) {
  if (!sceneryTransition) {
    SCENERY[currentScenery].draw(scrollX, t);
    return;
  }
  if (sceneryTransition.start === null) sceneryTransition.start = t;
  const progress = Math.min(1, (t - sceneryTransition.start) / SCENERY_TRANSITION_MS);

  renderSceneryTo(fadeCanvasA, sceneryTransition.from, scrollX, t);
  renderSceneryTo(fadeCanvasB, sceneryTransition.to, scrollX, t);
  const ctx = sceneCtx;
  ctx.globalAlpha = 1;
  ctx.drawImage(fadeCanvasA, 0, 0);
  ctx.globalAlpha = progress;
  ctx.drawImage(fadeCanvasB, 0, 0);
  ctx.globalAlpha = 1;

  if (progress >= 1) {
    currentScenery = sceneryTransition.to;
    sceneryTransition = null;
  }
}

/* ---------- Vignettes: ambient idle moments, no XP, no loot ---------- */
/* Fire only while walking — never during a normal fight or a Dungeon/Castle
   event, and a real battle always cancels one in progress (see startBattle).
   Purely cosmetic: nothing here is tracked, synced, or affects any roll. */

const VIGNETTE_DURATION_MS = 5500;
const VIGNETTE_MIN_MS = 60000, VIGNETTE_MAX_MS = 180000;

const VIGNETTES = {
  town: {
    label: 'WANDERING THROUGH TOWN...',
    tag: 'TOWN',
    draw: (scrollX) => {
      const ctx = sceneCtx;
      drawSkyGradient('#4a3550', '#7a5a6e');
      ctx.fillStyle = '#5a4a5a';
      drawTiled(140, 0.2, scrollX, (x) => {
        ctx.fillRect(x, 90, 46, 40);
        ctx.beginPath();
        ctx.moveTo(x - 6, 90); ctx.lineTo(x + 23, 66); ctx.lineTo(x + 52, 90);
        ctx.closePath(); ctx.fill();
      });
      ctx.fillStyle = '#ffd76a';
      drawTiled(140, 0.2, scrollX, (x) => { ctx.fillRect(x + 8, 102, 10, 10); ctx.fillRect(x + 28, 102, 10, 10); });
      ctx.fillStyle = '#3a2a1a';
      drawTiled(200, 0.25, scrollX, (x) => { ctx.fillRect(x, 96, 4, 34); ctx.fillRect(x - 6, 90, 16, 5); });
      drawGroundBase('#2a2432');
      ctx.fillStyle = '#4a4256';
      drawTiled(26, 1, scrollX, (x) => { ctx.fillRect(x, GROUND_Y + 3, 16, 2); });
    }
  },
  camp: {
    label: 'SETTING UP CAMP...',
    tag: 'CAMPFIRE',
    draw: (scrollX, t) => {
      const ctx = sceneCtx;
      drawSkyGradient('#0d0d1e', '#1c1c38');
      ctx.fillStyle = '#f5f5f5';
      drawTiled(60, 0.05, scrollX, (x) => { ctx.fillRect(x, (x * 37) % 60, 2, 2); });
      ctx.fillStyle = '#3a5a3a';
      drawTiled(150, 0.3, scrollX, (x) => {
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y); ctx.lineTo(x + 16, GROUND_Y - 26); ctx.lineTo(x + 32, GROUND_Y);
        ctx.closePath(); ctx.fill();
      });
      drawGroundBase('#161428');
      const fx = SPRITE_X + 118, fy = GROUND_Y - 4;
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(fx - 8, fy - 2, 16, 3);
      const flicker = Math.sin(t * 0.02) * 2;
      ctx.fillStyle = '#ff8a1e';
      ctx.fillRect(fx - 4, fy - 12 - flicker, 8, 10 + flicker);
      ctx.fillStyle = '#ffd76a';
      ctx.fillRect(fx - 2, fy - 8 - flicker, 4, 6);
      ctx.save();
      ctx.shadowColor = 'rgba(255,138,30,0.9)';
      ctx.shadowBlur = 16;
      ctx.fillStyle = 'rgba(255,138,30,0.35)';
      ctx.fillRect(fx - 4, fy - 12 - flicker, 8, 10 + flicker);
      ctx.restore();
    },
    // A custom reclined pose (not the standing walk-sprite) — resting on a
    // bedroll near the fire, head on a pack, instead of "sitting" in a way
    // that reads as floating.
    avatar: (t) => {
      const ctx = sceneCtx;
      const bob = Math.sin(t * 0.0025) * 1;
      const bx = SPRITE_X - 4, by = GROUND_Y - 16 + bob;

      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(bx, by - 2, 18, 14);

      ctx.fillStyle = '#f0b088';
      ctx.fillRect(bx + 3, by - 12, 15, 11);
      ctx.fillStyle = '#a06b35';
      ctx.fillRect(bx + 1, by - 14, 19, 5);

      ctx.fillStyle = '#8a3a2a';
      ctx.fillRect(bx + 18, by, 66, 16);
      ctx.fillStyle = '#c9503a';
      ctx.fillRect(bx + 18, by, 66, 4);
      ctx.fillStyle = '#6a2a1e';
      ctx.fillRect(bx + 18, by + 12, 66, 4);
    },
    sitting: true
  },
  market: {
    label: 'BROWSING A MARKET STALL...',
    tag: 'MARKET',
    draw: (scrollX) => {
      const ctx = sceneCtx;
      drawSkyGradient('#2a2a46', '#4a3f5e');
      ctx.fillStyle = '#8a1a2a';
      drawTiled(150, 0.2, scrollX, (x) => { ctx.fillRect(x, 60, 60, 8); });
      ctx.fillStyle = '#c9a54a';
      drawTiled(150, 0.2, scrollX, (x) => { ctx.fillRect(x, 68, 60, 4); ctx.fillRect(x - 4, 68, 68, 30); });
      ctx.fillStyle = '#3a2a1a';
      drawTiled(150, 0.2, scrollX, (x) => { ctx.fillRect(x, 98, 4, 30); ctx.fillRect(x + 56, 98, 4, 30); });
      ctx.fillStyle = '#ff004d';
      drawTiled(150, 0.2, scrollX, (x) => { ctx.fillRect(x + 10, 84, 6, 6); });
      ctx.fillStyle = '#00e436';
      drawTiled(150, 0.2, scrollX, (x) => { ctx.fillRect(x + 24, 86, 6, 6); });
      ctx.fillStyle = '#ffd700';
      drawTiled(150, 0.2, scrollX, (x) => { ctx.fillRect(x + 38, 84, 6, 6); });
      drawGroundBase('#241f30');
      ctx.fillStyle = '#3a3348';
      drawTiled(26, 1, scrollX, (x) => { ctx.fillRect(x, GROUND_Y + 3, 16, 2); });
    }
  },
  pond: {
    label: 'FISHING BY THE POND...',
    tag: 'FISHING',
    draw: (scrollX, t) => {
      const ctx = sceneCtx;
      drawSkyGradient('#1a1a3e', '#2d2d5e');
      ctx.fillStyle = '#3a3a6a';
      drawTiled(90, 0.15, scrollX, (x) => { ctx.fillRect(x, 24, 28, 8); ctx.fillRect(x + 6, 18, 16, 8); });
      drawGroundBase('#14142a');

      // Pond sits off to the side, clearly separate from where the avatar
      // stands — not underfoot.
      const px = SPRITE_X + 110, pw = SCENE_W - px;
      const wobble = Math.sin(t * 0.004) * 2;
      ctx.fillStyle = '#1b7dbf';
      ctx.fillRect(px, GROUND_Y, pw, SCENE_H - GROUND_Y);
      ctx.fillStyle = '#29adff';
      for (let i = 0; i < 3; i++) {
        const ry = GROUND_Y + 5 + i * 10;
        ctx.fillRect(px + 8 + wobble, ry, 20, 2);
        ctx.fillRect(px + 38 - wobble, ry + 3, 24, 2);
      }

      // Rod held at the avatar's side, angled up and out over the gap; the
      // line drops from the tip down to a bobber on the water.
      const handX = SPRITE_X + 84, handY = GROUND_Y - 52;
      const tipX = SPRITE_X + 130, tipY = GROUND_Y - 86;
      const bobX = px + 16, bobY = GROUND_Y + 3 + wobble;
      ctx.strokeStyle = '#8a6238';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(handX, handY); ctx.lineTo(tipX, tipY); ctx.stroke();
      ctx.strokeStyle = '#dcdce8';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(bobX, bobY); ctx.stroke();
      ctx.fillStyle = '#ff004d';
      ctx.fillRect(bobX - 1, bobY - 1, 3, 3);
    }
  }
};

let activeVignette = null; // { key, start }
let nextVignetteAt = Date.now() + randomRange(VIGNETTE_MIN_MS, VIGNETTE_MAX_MS);
let nextSceneryAt = Date.now() + randomRange(SCENERY_MIN_MS, SCENERY_MAX_MS);

function startVignette(t) {
  const keys = Object.keys(VIGNETTES);
  const key = keys[Math.floor(Math.random() * keys.length)];
  activeVignette = { key, start: t };
  el.monsterBanner.textContent = VIGNETTES[key].label;
  el.monsterBanner.classList.add('show');
}
function endVignette() {
  activeVignette = null;
  el.monsterBanner.classList.remove('show');
  nextVignetteAt = Date.now() + randomRange(VIGNETTE_MIN_MS, VIGNETTE_MAX_MS);
}

function drawDungeonBackground(scrollX) {
  const ctx = sceneCtx;
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, '#0d0d14');
  sky.addColorStop(1, '#26221e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);

  ctx.fillStyle = '#3a342c';
  drawTiled(40, 0.2, scrollX, (x) => { ctx.fillRect(x, 10, 34, 14); });
  ctx.fillStyle = '#2a251f';
  drawTiled(40, 0.2, scrollX, (x) => { ctx.fillRect(x, 26, 34, 12); });

  ctx.fillStyle = '#ff8a1e';
  drawTiled(100, 0.4, scrollX, (x) => { ctx.fillRect(x, 30, 4, 8); ctx.fillRect(x - 1, 36, 6, 3); });
  ctx.fillStyle = '#ffd76a';
  drawTiled(100, 0.4, scrollX, (x) => { ctx.fillRect(x + 1, 32, 2, 4); });

  ctx.fillStyle = '#1c1914';
  ctx.fillRect(0, GROUND_Y, SCENE_W, SCENE_H - GROUND_Y);
  ctx.fillStyle = '#302a22';
  drawTiled(30, 1, scrollX, (x) => { ctx.fillRect(x, GROUND_Y + 2, 24, 2); });
}

function drawCastleBackground(scrollX) {
  const ctx = sceneCtx;
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, '#3a3550');
  sky.addColorStop(1, '#544d6e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);

  ctx.fillStyle = '#6a6288';
  drawTiled(90, 0.2, scrollX, (x) => { ctx.fillRect(x, 14, 20, 26); });
  ctx.fillStyle = '#7ce7ff';
  drawTiled(90, 0.2, scrollX, (x) => { ctx.fillRect(x + 4, 18, 12, 10); });
  ctx.fillStyle = '#ffd700';
  drawTiled(90, 0.2, scrollX, (x) => { ctx.fillRect(x + 4, 30, 12, 6); });

  ctx.fillStyle = '#8a1a2a';
  drawTiled(140, 0.35, scrollX, (x) => { ctx.fillRect(x, 4, 10, 36); });
  ctx.fillStyle = '#ffd700';
  drawTiled(140, 0.35, scrollX, (x) => { ctx.fillRect(x + 3, 10, 4, 4); });

  ctx.fillStyle = '#403a56';
  ctx.fillRect(0, GROUND_Y, SCENE_W, SCENE_H - GROUND_Y);
  ctx.fillStyle = '#524a6e';
  drawTiled(24, 1, scrollX, (x) => { ctx.fillRect(x, GROUND_Y, 12, SCENE_H - GROUND_Y); });
}

function drawBackground(envId, scrollX, t) {
  if (envId === 'dungeon') return drawDungeonBackground(scrollX);
  if (envId === 'castle') return drawCastleBackground(scrollX);
  return drawWalkingBackground(scrollX, t);
}

function drawScene(scrollX, bobY, t) {
  const ctx = sceneCtx;
  if (battle) {
    drawBackground(battle.envId, scrollX, t);
  } else if (activeVignette) {
    VIGNETTES[activeVignette.key].draw(scrollX, t);
  } else {
    drawBackground(null, scrollX, t);
  }

  if (battle) {
    advanceBattle(t);
    if (battle) drawBattle(ctx, t);
  } else if (ghost) {
    advanceGhost(t);
    if (ghost) drawGhost(ctx, t);
  }

  // A full gear-set bonus glow takes priority over the streak glow when
  // both would apply — it's the rarer, more deliberate achievement.
  const setBonus = activeSetBonus();
  const glow = setBonus ? setBonus.glow : tierForStreak(currentStreak()).glow;
  if (glow) {
    let blur = glow.blur * 0.55;
    if (glow.pulse) blur += Math.sin(scrollX * 0.05) * (glow.blur * 0.2);
    ctx.shadowColor = 'rgba(' + glow.color + ',0.9)';
    ctx.shadowBlur = blur;
  }
  const vignetteAvatar = activeVignette && VIGNETTES[activeVignette.key].avatar;
  if (vignetteAvatar) {
    vignetteAvatar(t);
  } else {
    const walkFrame = (battle || ghost) ? 0 : Math.floor(t / 220) % 2;
    paintSpriteOnto(ctx, gearState.equipped, walkFrame, SPRITE_X, GROUND_Y - SPRITE_H + bobY, SPRITE_SCALE);
  }
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  return tierForLevel(currentLevel());
}

let sceneRafId = null, sceneScrollX = 0, sceneLastT = 0;

function sceneTick(t) {
  const dt = sceneLastT ? Math.min(48, t - sceneLastT) : 16;
  sceneLastT = t;
  const frozen = battle || (activeVignette && VIGNETTES[activeVignette.key].sitting);
  if (!frozen) sceneScrollX += dt * 0.07;

  if (!battle) {
    // Skirmish (while a session is actively tracked) and idle vignettes
    // (between sessions) are mutually exclusive by design — tracking status
    // alone decides which one gets to use the foreground.
    if (getActiveTask()) {
      // A vignette can legitimately still be mid-play (up to ~5.5s) the
      // moment the user clicks Start on a new task — skirmish always wins.
      if (activeVignette) endVignette();
      if (!ghost) startGhostCycle(t);
    } else {
      ghost = null;
      if (activeVignette) {
        if (t - activeVignette.start >= VIGNETTE_DURATION_MS) endVignette();
      } else if (Date.now() >= nextVignetteAt) {
        startVignette(t);
      }
    }
    if (!sceneryTransition && Date.now() >= nextSceneryAt) {
      sceneryTransition = { from: currentScenery, to: pickNextScenery(), start: null };
      nextSceneryAt = Date.now() + randomRange(SCENERY_MIN_MS, SCENERY_MAX_MS);
    }
  } else if (ghost) {
    ghost = null;
  }

  const bobY = Math.sin(t * 0.006) * 3;
  const tier = drawScene(sceneScrollX, bobY, t);
  updateSceneLabels(tier);
  updateSceneModeTag();
  sceneRafId = requestAnimationFrame(sceneTick);
}
function startSceneLoop() { if (sceneRafId === null && !prefersReducedMotion) { sceneLastT = 0; sceneRafId = requestAnimationFrame(sceneTick); } }
function stopSceneLoop() { if (sceneRafId !== null) { cancelAnimationFrame(sceneRafId); sceneRafId = null; } }
function renderSceneStatic() {
  if (!prefersReducedMotion) return;
  const tier = drawScene(sceneScrollX, 0, performance.now());
  updateSceneLabels(tier);
  updateSceneModeTag();
}

function updateSceneLabels(tier) {
  el.tierName.textContent = tier.name;
  el.tierDesc.textContent = tier.desc;
}

// A persistent tag naming whatever the scene is currently doing, checked in
// priority order: a real fight (event or normal) always wins, then an idle
// vignette, then skirmishing (only possible while a task is tracked), then
// plain walking as the fallback.
function updateSceneModeTag() {
  const tag = el.sceneModeTag;
  tag.classList.remove('skirmish', 'battle', 'event', 'vignette');
  if (battle) {
    if (battle.envId) {
      const env = ENVIRONMENTS.find((e) => e.id === battle.envId);
      tag.textContent = env.eventName.toUpperCase();
      tag.classList.add('event');
    } else {
      tag.textContent = 'IN BATTLE';
      tag.classList.add('battle');
    }
  } else if (activeVignette) {
    tag.textContent = VIGNETTES[activeVignette.key].tag;
    tag.classList.add('vignette');
  } else if (getActiveTask()) {
    tag.textContent = 'SKIRMISHING';
    tag.classList.add('skirmish');
  } else {
    tag.textContent = 'WALKING';
  }
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
    ep: gearState.eventProgress || 0,
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
    ep: newer.ep || 0,
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
  gearState = { foundItems, equipped, eventProgress: payload.ep || 0 };
  writeGear(gearState);
  touchState(payload.updatedAt || Date.now());

  renderRewards();
  renderGearStatus();
  renderEventMeter();
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

// Returns a status string so a manual "Sync now" click can report what
// happened; the automatic call sites (init, online, visibilitychange) just
// fire it and ignore the result.
async function pullGameState() {
  const webhookUrl = localStorage.getItem(LS_WEBHOOK);
  if (!webhookUrl) return 'no-webhook';
  if (!navigator.onLine) return 'offline';
  try {
    const res = await fetchJSONP(webhookUrl, { action: 'state' });
    if (!res || res.ok !== true) return 'error';
    if (res.state) {
      const merged = mergeStatePayloads(currentStatePayload(), res.state);
      applyStatePayload(merged);
    }
    // Push even when there was nothing to pull yet (first sync ever) so this
    // device's state seeds the sheet instead of silently doing nothing; also
    // writes the merged result back so both sides converge.
    await pushGameState();
    return 'ok';
  } catch {
    return 'error';
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

/* ---------- Menu modal + first-run tutorial ---------- */
/* Webhook config, sound, and progress sync/save-code all live in one Menu
   modal (opened from the header gear icon) instead of being scattered across
   the Tracker and Character screens. The tutorial is a separate modal that
   auto-opens once, the first time the app ever loads on a device, and can be
   replayed from inside the Menu. */

const LS_TUTORIAL_SEEN = 'tt_tutorial_seen';

const TUTORIAL_STEPS = [
  { title: 'WELCOME!', body: "Pixel Punch Clock is a free, offline time tracker that syncs to your own Google Sheet — and turns every session into a tiny 8-bit adventure." },
  { title: 'TRACK TIME', body: "Type a task, hit Start. Hit Stop when you're done. Every session queues locally and syncs automatically once you're back online." },
  { title: 'EARN REWARDS', body: "Your avatar skirmishes the whole time your timer's running, then it becomes the real fight the moment you hit Stop — XP, streak, and a chance at gear. Fights always end in a win; what varies is whether loot drops." },
  { title: 'GEAR UP', body: "Switch to the Character tab to equip anything you've found. A complete matching set unlocks a loot-chance bonus and a unique glow." },
  { title: 'DUNGEONS & EVENTS', body: "Watch the event meter under your XP bar — filling it up triggers a themed Dungeon Raid or Castle Siege with its own exclusive gear." },
  { title: 'OWN YOUR DATA', body: "Your log and your progress live in a Google Sheet you control — free, private, entirely yours. Setting it up takes about 2 minutes and needs zero coding experience. Here's exactly how:" },
  { title: 'ADD THE BACKEND', body: "In Google Sheets, open a sheet, then click Extensions, then Apps Script. Delete whatever's there and paste in the backend code — tap the button below to copy it.", copyCode: true },
  { title: 'DEPLOY IT', body: 'Click Deploy, then New deployment. Choose type "Web app," set "Execute as" to Me and "Who has access" to Anyone, then click Deploy.' },
  { title: 'CONNECT THE APP', body: "Copy the web address you're given (it ends in /exec). Open the Menu here, paste it into Webhook, and save. Any device with that same address saved stays in sync automatically." },
  { title: "THAT'S IT!", body: 'Tap Finish to jump in. You can replay this tutorial anytime from the Menu.' },
];

function anyModalOpen() {
  return !el.settingsModal.hidden || !el.tutorialModal.hidden;
}
function updateBodyScrollLock() {
  document.body.style.overflow = anyModalOpen() ? 'hidden' : '';
}

function openSettingsModal() {
  el.settingsModal.hidden = false;
  updateBodyScrollLock();
}
function closeSettingsModal() {
  el.settingsModal.hidden = true;
  updateBodyScrollLock();
}

let tutorialStepIndex = 0;

function renderTutorialStep() {
  const step = TUTORIAL_STEPS[tutorialStepIndex];
  el.tutorialStepCounter.textContent = `STEP ${tutorialStepIndex + 1} / ${TUTORIAL_STEPS.length}`;
  el.tutorialStepTitle.textContent = step.title;
  el.tutorialStepBody.textContent = step.body;
  el.tutorialCopyCode.hidden = !step.copyCode;
  el.tutorialBack.hidden = tutorialStepIndex === 0;
  el.tutorialNext.textContent = tutorialStepIndex === TUTORIAL_STEPS.length - 1 ? 'Finish' : 'Next';
}

function openTutorial() {
  tutorialStepIndex = 0;
  renderTutorialStep();
  el.tutorialModal.hidden = false;
  updateBodyScrollLock();
}
function closeTutorial() {
  el.tutorialModal.hidden = true;
  updateBodyScrollLock();
  localStorage.setItem(LS_TUTORIAL_SEEN, 'true');
  // First-run close with nothing configured yet — hand off straight into the
  // Menu so setup is the very next thing, not a separate step to go find.
  if (!localStorage.getItem(LS_WEBHOOK)) openSettingsModal();
}

// Fetches apps-script/Code.gs from this same deployment (a relative path, so
// it works unmodified on any fork) and copies it to the clipboard — lets
// someone with no GitHub experience get the backend code onto their machine
// without ever leaving the app to go find and copy it themselves.
let codeGsCache = null;
async function copyCodeGsToClipboard() {
  try {
    if (!codeGsCache) {
      const res = await fetch('apps-script/Code.gs');
      if (!res.ok) throw new Error('fetch failed');
      codeGsCache = await res.text();
    }
    await navigator.clipboard.writeText(codeGsCache);
    toast('Code copied — paste it into Apps Script');
  } catch {
    toast('Could not copy automatically — open apps-script/Code.gs from the project and copy it manually');
  }
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

  try { renderTaskOptions(JSON.parse(localStorage.getItem(LS_RECENT_TASKS) || '[]')); } catch {}

  renderTimer();
  renderLog();
  renderPendingBadge();
  renderStatusDot();
  renderRewards();
  el.soundToggle.checked = soundEnabled();
  renderGearStatus();
  renderEventMeter();
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

  el.settingsToggle.addEventListener('click', openSettingsModal);
  el.settingsModalClose.addEventListener('click', closeSettingsModal);
  el.settingsModal.addEventListener('click', (ev) => { if (ev.target === el.settingsModal) closeSettingsModal(); });

  el.replayTutorial.addEventListener('click', () => { closeSettingsModal(); openTutorial(); });
  el.tutorialSkip.addEventListener('click', closeTutorial);
  el.tutorialCopyCode.addEventListener('click', copyCodeGsToClipboard);
  el.copyCodeGs.addEventListener('click', copyCodeGsToClipboard);
  el.tutorialModal.addEventListener('click', (ev) => { if (ev.target === el.tutorialModal) closeTutorial(); });
  el.tutorialBack.addEventListener('click', () => {
    if (tutorialStepIndex > 0) { tutorialStepIndex -= 1; renderTutorialStep(); }
  });
  el.tutorialNext.addEventListener('click', () => {
    if (tutorialStepIndex < TUTORIAL_STEPS.length - 1) { tutorialStepIndex += 1; renderTutorialStep(); }
    else closeTutorial();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!el.tutorialModal.hidden) closeTutorial();
    else if (!el.settingsModal.hidden) closeSettingsModal();
  });

  if (!localStorage.getItem(LS_TUTORIAL_SEEN)) openTutorial();

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

  el.syncGameState.addEventListener('click', async () => {
    toast('Syncing…');
    const status = await pullGameState();
    if (status === 'no-webhook') toast('Set the webhook URL in settings first');
    else if (status === 'offline') toast("You're offline");
    else if (status === 'error') toast('Sync failed — try again in a moment');
    else toast('Progress synced');
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
