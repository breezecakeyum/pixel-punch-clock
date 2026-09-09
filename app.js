'use strict';

/* ---------- Config / storage keys ---------- */

const LS_WEBHOOK = 'tt_webhook_url';
const LS_ACTIVE = 'tt_active_task';
const LS_LOG = 'tt_log';
const LS_RECENT_TASKS = 'tt_recent_tasks';
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
  tabInput: document.getElementById('tab-input'),
  toggleBtn: document.getElementById('toggle-btn'),
  installCard: document.getElementById('install-card'),
  installBtn: document.getElementById('install-btn'),
  retrySync: document.getElementById('retry-sync'),
  logList: document.getElementById('log-list'),
  logEmpty: document.getElementById('log-empty'),
  toast: document.getElementById('toast'),
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
    el.tabInput.value = active.tab;
    el.taskInput.disabled = true;
    el.tabInput.disabled = true;
  } else {
    el.timerTask.textContent = 'Not tracking';
    el.timerDisplay.textContent = '00:00:00';
    el.timerTab.hidden = true;
    el.toggleBtn.textContent = 'Start';
    el.toggleBtn.classList.remove('stop');
    el.taskInput.disabled = false;
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
    sub.textContent = `${e.tab} · ${new Date(e.timestamp).toLocaleString()}`;
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
          body: JSON.stringify({ task: item.task, tab: item.tab, action: item.action, timestamp: item.timestamp }),
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

/* ---------- Actions ---------- */

async function handleSubmit(ev) {
  ev.preventDefault();
  const active = getActiveTask();
  const timestamp = new Date().toISOString();

  if (!active) {
    const task = el.taskInput.value.trim();
    const tab = el.tabInput.value.trim() || 'Work';
    if (!task) return;

    const item = { task, tab, action: 'Start', timestamp };
    const id = await queueAdd(item);
    addLogEntry({ qid: id, ...item, status: 'pending' });
    setActiveTask({ task, tab, startedAt: timestamp });
    rememberTask(task);
  } else {
    const item = { task: active.task, tab: active.tab, action: 'Stop', timestamp };
    const id = await queueAdd(item);
    addLogEntry({ qid: id, ...item, status: 'pending' });
    setActiveTask(null);
  }

  renderTimer();
  renderPendingBadge();
  flushQueue();
}

/* ---------- Wiring ---------- */

function init() {
  el.webhookInput.value = localStorage.getItem(LS_WEBHOOK) || '';
  el.settingsCard.hidden = !!localStorage.getItem(LS_WEBHOOK);

  try { renderTaskOptions(JSON.parse(localStorage.getItem(LS_RECENT_TASKS) || '[]')); } catch {}

  renderTimer();
  renderLog();
  renderPendingBadge();
  renderStatusDot();

  setInterval(renderTimer, 1000);
  // Fallback in case the 'online' event doesn't fire reliably on some
  // mobile browsers (notably iOS Safari after backgrounding).
  setInterval(() => { if (navigator.onLine) flushQueue(); }, 20000);

  el.form.addEventListener('submit', handleSubmit);

  el.settingsToggle.addEventListener('click', () => {
    el.settingsCard.hidden = !el.settingsCard.hidden;
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
    el.installCard.hidden = false;
  });
  el.installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    el.installCard.hidden = true;
  });
  window.addEventListener('appinstalled', () => { el.installCard.hidden = true; });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  if (navigator.onLine) flushQueue();
}

document.addEventListener('DOMContentLoaded', init);
