'use strict';

/* ---------- Config / storage keys ---------- */

const LS_WEBHOOK = 'tt_webhook_url';
const LS_ACTIVE = 'tt_active_task';
const LS_LOG = 'tt_log';
const LS_RECENT_TASKS = 'tt_recent_tasks';
const LS_METRICS_CACHE = 'tt_metrics_cache';
const LS_REWARDS = 'tt_rewards';
const LS_SOUND = 'tt_sound_enabled';
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
  navMetrics: document.getElementById('nav-metrics'),
  viewTracker: document.getElementById('view-tracker'),
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
  renderRewards();
  showXpFloat(gained);
  playRewardSound(leveledUp);
  if (leveledUp) showLevelUp(after);
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
  const showMetrics = view === 'metrics';
  el.viewTracker.hidden = showMetrics;
  el.viewMetrics.hidden = !showMetrics;
  el.navTracker.classList.toggle('active', !showMetrics);
  el.navMetrics.classList.toggle('active', showMetrics);
  if (showMetrics) loadMetrics();
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

  setInterval(renderTimer, 1000);
  // Fallback in case the 'online' event doesn't fire reliably on some
  // mobile browsers (notably iOS Safari after backgrounding).
  setInterval(() => { if (navigator.onLine) flushQueue(); }, 20000);

  el.form.addEventListener('submit', handleSubmit);

  el.navTracker.addEventListener('click', () => switchView('tracker'));
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

  window.addEventListener('online', () => { renderStatusDot(); flushQueue(); });
  window.addEventListener('offline', renderStatusDot);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { renderTimer(); if (navigator.onLine) flushQueue(); }
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

  if (navigator.onLine) flushQueue();
}

document.addEventListener('DOMContentLoaded', init);
