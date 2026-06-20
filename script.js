/* ============================================
   TODORA — script.js
   ============================================ */

// ── State ──────────────────────────────────
let tasks = [];
let confettiTriggered = false;

// ── DOM References (tasks) ──────────────────
const taskInput    = document.getElementById('task-input');
const taskDueDate  = document.getElementById('task-due-date');
const taskDueTime  = document.getElementById('task-due-time');
const addBtn       = document.getElementById('add-btn');
const taskList     = document.getElementById('task-list');
const progressBar  = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const emptyState   = document.getElementById('empty-state');
const confettiCont = document.getElementById('confetti-container');

// ── DOM References (reminders sidebar) ──────
const reminderList       = document.getElementById('reminder-list');
const reminderEmptyState = document.getElementById('reminder-empty-state');
const reminderBadge      = document.getElementById('reminder-badge');
const badgeCount         = document.getElementById('badge-count');
const appToast           = document.getElementById('app-toast');

// ── Init ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadTasks();
  renderTasks();
  updateProgress();
  initStars();

  renderReminders(); // auto-derived from tasks

  initTheme();
  initNotifications();
  showMorningSummaryIfDue();

  // Re-check due tasks / badge every 30s
  setInterval(checkDueNotifications, 30000);
});

// ── Event Listeners (tasks) ─────────────────
addBtn.addEventListener('click', addTask);

taskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTask();
});

/* ============================================================
   TASK CRUD
   ============================================================ */

/**
 * addTask — create a new task from input value (+ optional due date/time)
 */
function addTask() {
  const text = taskInput.value.trim();
  if (!text) {
    shakeInput();
    return;
  }

  const task = {
    id: Date.now(),
    text,
    completed: false,
    dueDate: taskDueDate.value || null,
    dueTime: taskDueTime.value || null,
    notified: false,
  };

  tasks.push(task);
  saveTasks();

  appendTaskItem(task);
  updateProgress();
  renderReminders();

  taskInput.value = '';
  taskDueDate.value = '';
  taskDueTime.value = '';
  taskInput.focus();

  updateEmptyState();
}

/**
 * deleteTask — remove a task by id with animation
 */
function deleteTask(id) {
  const li = document.querySelector(`.task-item[data-id="${id}"]`);
  if (li) {
    li.classList.add('removing');
    li.addEventListener('animationend', () => {
      li.remove();
      tasks = tasks.filter(t => t.id !== id);
      saveTasks();
      updateProgress();
      updateEmptyState();
      renderReminders();
    }, { once: true });
  }
}

/**
 * editTask — switch a task row to edit mode (text + due date/time)
 */
function editTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  const li = document.querySelector(`.task-item[data-id="${id}"]`);
  if (!li) return;

  const mainEl = li.querySelector('.task-main');
  const actionsEl = li.querySelector('.task-actions');

  mainEl.innerHTML = `
    <input type="text" class="task-edit-input" value="${escapeHtml(task.text)}" maxlength="120" aria-label="Edit task text"/>
    <div class="reminder-datetime-row" style="margin-top:6px;">
      <input type="date" class="task-date-input edit-date" value="${task.dueDate || ''}"/>
      <input type="time" class="task-time-input edit-time" value="${task.dueTime || ''}"/>
    </div>
  `;

  const input = mainEl.querySelector('.task-edit-input');
  input.focus();
  input.select();

  actionsEl.innerHTML = `
    <button class="action-btn save-btn" aria-label="Save task" onclick="saveEdit(${id})">✓</button>
    <button class="action-btn delete-btn" aria-label="Delete task" onclick="deleteTask(${id})">✕</button>
  `;

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveEdit(id);
    if (e.key === 'Escape') renderTasks();
  });
}

/**
 * saveEdit — save edited text + due date/time for a task
 */
function saveEdit(id) {
  const li = document.querySelector(`.task-item[data-id="${id}"]`);
  if (!li) return;

  const input = li.querySelector('.task-edit-input');
  const dateInput = li.querySelector('.edit-date');
  const timeInput = li.querySelector('.edit-time');
  if (!input) return;

  const newText = input.value.trim();
  if (!newText) return;

  const task = tasks.find(t => t.id === id);
  if (task) {
    const dueChanged = task.dueDate !== (dateInput?.value || null) || task.dueTime !== (timeInput?.value || null);
    task.text = newText;
    task.dueDate = dateInput?.value || null;
    task.dueTime = timeInput?.value || null;
    if (dueChanged) task.notified = false;
    saveTasks();
    const newLi = buildTaskElement(task);
    newLi.style.animation = 'none';
    li.replaceWith(newLi);
    renderReminders();
  }
}

/**
 * toggleComplete — mark a task done/undone
 */
function toggleComplete(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  task.completed = !task.completed;
  saveTasks();

  const li = document.querySelector(`.task-item[data-id="${id}"]`);
  if (li) {
    const checkbox = li.querySelector('.task-checkbox');
    if (task.completed) {
      li.classList.add('completed');
      checkbox.classList.add('checked');
    } else {
      li.classList.remove('completed');
      checkbox.classList.remove('checked');
    }
  }

  updateProgress();
  renderReminders();
}

/* ── Render Functions (tasks) ───────────────── */

function renderTasks() {
  taskList.innerHTML = '';
  tasks.forEach(task => taskList.appendChild(buildTaskElement(task)));
  updateEmptyState();
}

function appendTaskItem(task) {
  const li = buildTaskElement(task);
  taskList.appendChild(li);
  taskList.scrollTop = taskList.scrollHeight;
}

function buildTaskElement(task) {
  const li = document.createElement('li');
  li.className = `task-item${task.completed ? ' completed' : ''}`;
  li.setAttribute('data-id', task.id);

  const dueHtml = formatDue(task.dueDate, task.dueTime);

  li.innerHTML = `
    <div
      class="task-checkbox${task.completed ? ' checked' : ''}"
      role="checkbox"
      aria-checked="${task.completed}"
      aria-label="Mark task complete"
      tabindex="0"
      onclick="toggleComplete(${task.id})"
      onkeydown="if(event.key==='Enter'||event.key===' ') toggleComplete(${task.id})"
    ></div>
    <div class="task-main">
      <span class="task-text">${escapeHtml(task.text)}</span>
      ${dueHtml ? `<span class="task-due">📅 ${dueHtml}</span>` : ''}
    </div>
    <div class="task-actions">
      <button class="action-btn edit-btn" aria-label="Edit task" onclick="editTask(${task.id})">✎</button>
      <button class="action-btn delete-btn" aria-label="Delete task" onclick="deleteTask(${task.id})">✕</button>
    </div>
  `;

  return li;
}

function updateEmptyState() {
  emptyState.classList.toggle('visible', tasks.length === 0);
}

/* ── Progress ───────────────────────────────── */

function updateProgress() {
  const total     = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const pct       = total === 0 ? 0 : (completed / total) * 100;

  progressBar.style.width = `${pct}%`;
  progressText.textContent = `${completed} / ${total}`;

  if (total > 0 && completed === total && !confettiTriggered) {
    confettiTriggered = true;
    setTimeout(triggerConfetti, 300);
  } else if (completed < total) {
    confettiTriggered = false;
  }
}

/* ── Local Storage (tasks) ──────────────────── */

function saveTasks() {
  localStorage.setItem('todo_tasks', JSON.stringify(tasks));
}

function loadTasks() {
  const stored = localStorage.getItem('todo_tasks');
  if (stored) {
    try { tasks = JSON.parse(stored); } catch { tasks = []; }
  }
}

/* ============================================================
   AUTO-GENERATED REMINDERS (derived from tasks with due dates)
   ============================================================ */

/**
 * dateKeyToLabel — turns a YYYY-MM-DD string into "Today" / "Tomorrow" /
 * "22 June" relative to the current date.
 */
function dateKeyToLabel(dateStr) {
  const todayKey = toDateKey(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = toDateKey(tomorrow);

  if (dateStr === todayKey) return 'Today';
  if (dateStr === tomorrowKey) return 'Tomorrow';

  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${dateObj.getDate()} ${months[dateObj.getMonth()]}`;
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * upcomingTasksGrouped — every non-completed task that has a due date,
 * sorted chronologically and grouped under Today / Tomorrow / date labels.
 */
function upcomingTasksGrouped() {
  const dated = tasks
    .filter(t => t.dueDate && !t.completed)
    .sort((a, b) => {
      const aKey = `${a.dueDate}T${a.dueTime || '23:59'}`;
      const bKey = `${b.dueDate}T${b.dueTime || '23:59'}`;
      return aKey.localeCompare(bKey);
    });

  const groups = [];
  dated.forEach(task => {
    const label = dateKeyToLabel(task.dueDate);
    let group = groups.find(g => g.label === label);
    if (!group) {
      group = { label, dateKey: task.dueDate, tasks: [] };
      groups.push(group);
    }
    group.tasks.push(task);
  });

  return groups;
}

function renderReminders() {
  reminderList.innerHTML = '';
  const groups = upcomingTasksGrouped();

  groups.forEach(group => {
    const heading = document.createElement('li');
    heading.className = 'reminder-group-heading';
    heading.textContent = `📅 ${group.label}`;
    reminderList.appendChild(heading);

    group.tasks.forEach(task => {
      reminderList.appendChild(buildReminderElement(task));
    });
  });

  reminderEmptyState.classList.toggle('visible', groups.length === 0);
  updateReminderBadge();
}

function buildReminderElement(task) {
  const li = document.createElement('li');
  li.className = 'reminder-item';
  li.setAttribute('data-id', task.id);

  const timeLabel = task.dueTime ? formatTime(task.dueTime) : '';

  li.innerHTML = `
    <div
      class="reminder-check"
      role="checkbox"
      aria-checked="false"
      aria-label="Mark task complete"
      tabindex="0"
      onclick="toggleComplete(${task.id})"
      onkeydown="if(event.key==='Enter'||event.key===' ') toggleComplete(${task.id})"
    ></div>
    <div class="reminder-main">
      <span class="reminder-title">${escapeHtml(task.text)}</span>
    </div>
    ${timeLabel ? `<span class="reminder-meta reminder-time-tag">${timeLabel}</span>` : ''}
  `;

  return li;
}

/**
 * updateReminderBadge — counts today's pending (non-completed) tasks
 * and reflects the count on the bell badge.
 */
function updateReminderBadge() {
  const todayKey = toDateKey(new Date());
  const count = tasks.filter(t => t.dueDate === todayKey && !t.completed).length;

  badgeCount.textContent = count;
  reminderBadge.classList.toggle('has-pending', count > 0);
}

/**
 * formatTime — "10:00" -> "10:00 AM"
 */
function formatTime(timeStr) {
  const [hh, mm] = timeStr.split(':').map(Number);
  const period = hh >= 12 ? 'PM' : 'AM';
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour12}:${String(mm).padStart(2, '0')} ${period}`;
}

/* ============================================================
   BROWSER NOTIFICATIONS
   ============================================================ */

const NOTIFY_MINUTES_BEFORE = 10;

/**
 * initNotifications — asks for permission once (browser remembers the
 * choice afterwards, so this is a no-op on repeat visits once decided).
 */
function initNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
  // Run an immediate check on load too.
  checkDueNotifications();
}

function notify(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: undefined });
  } else {
    showToast(`<strong>${escapeHtml(title)}</strong><br>${escapeHtml(body)}`);
  }
}

/**
 * checkDueNotifications — fires a notification for any task whose due
 * time is within the next NOTIFY_MINUTES_BEFORE minutes (or already due),
 * as long as it hasn't already been notified and isn't completed.
 */
function checkDueNotifications() {
  const now = new Date();
  let changed = false;

  tasks.forEach(task => {
    if (task.completed || task.notified || !task.dueDate || !task.dueTime) return;

    const [y, m, d] = task.dueDate.split('-').map(Number);
    const [hh, mm] = task.dueTime.split(':').map(Number);
    const dueDateTime = new Date(y, m - 1, d, hh, mm);

    const msUntilDue = dueDateTime.getTime() - now.getTime();
    const minutesUntilDue = msUntilDue / 60000;

    // Fire once we're within the "before" window, up until 5 min after due.
    if (minutesUntilDue <= NOTIFY_MINUTES_BEFORE && minutesUntilDue >= -5) {
      notify('🔔 Upcoming Task', `${task.text}\nStarts at ${formatTime(task.dueTime)}`);
      task.notified = true;
      changed = true;
    }
  });

  if (changed) saveTasks();
  updateReminderBadge();
}

/* ============================================================
   DAILY MORNING SUMMARY
   ============================================================ */

const MORNING_SUMMARY_HOUR = 8;

/**
 * showMorningSummaryIfDue — once per calendar day, if it's at or past
 * 8:00 AM, show a summary of today's tasks the first time the app is
 * opened that day.
 */
function showMorningSummaryIfDue() {
  const now = new Date();
  if (now.getHours() < MORNING_SUMMARY_HOUR) return;

  const todayKey = toDateKey(now);
  const lastShown = localStorage.getItem('todo_last_summary_date');
  if (lastShown === todayKey) return;

  const todaysTasks = tasks.filter(t => t.dueDate === todayKey && !t.completed);

  if (todaysTasks.length > 0) {
    const list = todaysTasks.map(t => `• ${t.text}`).join('\n');
    notify('📋 Good Morning!', `Today's Tasks:\n${list}\n\nHave a productive day! 🚀`);
  }

  localStorage.setItem('todo_last_summary_date', todayKey);
}

/**
 * showToast — lightweight in-app banner used as a fallback when
 * Notification permission hasn't been granted.
 */
let toastTimeout = null;
function showToast(html) {
  appToast.innerHTML = html;
  appToast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    appToast.classList.remove('visible');
  }, 6000);
}

/* ============================================================
   SHARED HELPERS
   ============================================================ */

/**

 * formatDue — formats a date (YYYY-MM-DD) + optional time (HH:MM)
 * into "15 Aug 2025" or "15 Aug 2025 • 6:30 PM"
 */
function formatDue(dateStr, timeStr) {
  if (!dateStr) return '';

  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let result = `${dateObj.getDate()} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;

  if (timeStr) {
    const [hh, mm] = timeStr.split(':').map(Number);
    const period = hh >= 12 ? 'PM' : 'AM';
    const hour12 = hh % 12 === 0 ? 12 : hh % 12;
    result += ` • ${hour12}:${String(mm).padStart(2, '0')} ${period}`;
  }

  return result;
}

/* ── Confetti ──────────────────────────────────  */

function triggerConfetti() {
  const colors = [
    '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
    '#ff922b', '#cc5de8', '#f06595', '#74c0fc',
    '#a9e34b', '#ff8787',
  ];

  const count = 120;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';

    const color = colors[Math.floor(Math.random() * colors.length)];
    const left  = Math.random() * 100;
    const delay = Math.random() * 2;
    const dur   = 2.5 + Math.random() * 2;
    const size  = 6 + Math.random() * 8;
    const shape = Math.random() > 0.5 ? '50%' : '2px';

    piece.style.cssText = `
      left: ${left}%;
      background: ${color};
      width: ${size}px;
      height: ${size}px;
      border-radius: ${shape};
      animation-duration: ${dur}s;
      animation-delay: ${delay}s;
    `;

    confettiCont.appendChild(piece);

    setTimeout(() => piece.remove(), (dur + delay) * 1000 + 200);
  }
}

/* ── Stars Canvas ──────────────────────────────  */

function initStars() {
  const canvas = document.getElementById('stars-canvas');
  const ctx    = canvas.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', () => { resize(); drawStars(); });

  const starCount = 130;
  const stars = Array.from({ length: starCount }, () => ({
    x:      Math.random() * window.innerWidth,
    y:      Math.random() * window.innerHeight * 0.65,
    r:      0.5 + Math.random() * 1.5,
    alpha:  0.3 + Math.random() * 0.7,
    speed:  0.005 + Math.random() * 0.01,
    phase:  Math.random() * Math.PI * 2,
  }));

  function drawStars() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const time = Date.now() / 1000;

    stars.forEach(s => {
      const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(time * s.speed * 20 + s.phase));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha * twinkle})`;
      ctx.fill();
    });
  }

  (function animate() {
    drawStars();
    requestAnimationFrame(animate);
  })();
}

/* ── Utilities ───────────────────────────────── */

function shakeInput() { shakeElement(taskInput); }

function shakeElement(el) {
  el.style.transition = 'transform 0.1s ease';
  el.style.transform  = 'translateX(-6px)';
  setTimeout(() => { el.style.transform = 'translateX(6px)'; }, 80);
  setTimeout(() => { el.style.transform = 'translateX(-4px)'; }, 160);
  setTimeout(() => { el.style.transform = 'translateX(0)'; el.style.transition = ''; }, 240);
  el.focus();
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ============================================================
   ============================================================
   THEME CUSTOMIZATION SYSTEM
   ============================================================
   ============================================================ */

const THEME_STORAGE_KEY = 'todo_theme_v2';

const DEFAULT_THEME = {
  name: 'Pink Sunset',
  accent: '#e8506a',
  bgStart: '#1a0530',
  bgEnd: '#c43060',
  cardBg: 'rgba(255, 255, 255, 0.07)',
  text: '#ffffff',
  progress: '#e84070',
  button: '#e8506a',
  checkbox: '#e84070',
  glow: '#e8506a',
};

const THEME_PRESETS = [
  { ...DEFAULT_THEME },
  {
    name: 'Midnight Black',
    accent: '#6c63ff',
    bgStart: '#05050a',
    bgEnd: '#1c1c2b',
    cardBg: 'rgba(255, 255, 255, 0.05)',
    text: '#f0f0f5',
    progress: '#6c63ff',
    button: '#4b44cc',
    checkbox: '#6c63ff',
    glow: '#6c63ff',
  },
  {
    name: 'Ocean Blue',
    accent: '#2fb8e0',
    bgStart: '#021c2e',
    bgEnd: '#0b5e84',
    cardBg: 'rgba(255, 255, 255, 0.07)',
    text: '#eaf8ff',
    progress: '#2fb8e0',
    button: '#1c8fb3',
    checkbox: '#2fb8e0',
    glow: '#2fb8e0',
  },
  {
    name: 'Forest Green',
    accent: '#3fae6a',
    bgStart: '#06190f',
    bgEnd: '#1f5c39',
    cardBg: 'rgba(255, 255, 255, 0.06)',
    text: '#eafff2',
    progress: '#3fae6a',
    button: '#2e8a52',
    checkbox: '#3fae6a',
    glow: '#3fae6a',
  },
  {
    name: 'Lavender',
    accent: '#9b8cff',
    bgStart: '#211a3a',
    bgEnd: '#5f4fae',
    cardBg: 'rgba(255, 255, 255, 0.08)',
    text: '#f5f2ff',
    progress: '#b3a4ff',
    button: '#8472e0',
    checkbox: '#9b8cff',
    glow: '#9b8cff',
  },
  {
    name: 'Cyber Purple',
    accent: '#d63bff',
    bgStart: '#120023',
    bgEnd: '#530d72',
    cardBg: 'rgba(255, 255, 255, 0.06)',
    text: '#fbeaff',
    progress: '#d63bff',
    button: '#a921cf',
    checkbox: '#d63bff',
    glow: '#d63bff',
  },
  {
    name: 'Minimal White',
    accent: '#3a3a3a',
    bgStart: '#f4f4f6',
    bgEnd: '#e2e2ea',
    cardBg: 'rgba(255, 255, 255, 0.55)',
    text: '#1c1c1e',
    progress: '#3a3a3a',
    button: '#3a3a3a',
    checkbox: '#3a3a3a',
    glow: '#9a9a9a',
  },
  {
    name: 'Sunset Orange',
    accent: '#ff8a3d',
    bgStart: '#2b0f02',
    bgEnd: '#a8430f',
    cardBg: 'rgba(255, 255, 255, 0.07)',
    text: '#fff3ea',
    progress: '#ff8a3d',
    button: '#e36d23',
    checkbox: '#ff8a3d',
    glow: '#ff8a3d',
  },
];

let currentTheme = { ...DEFAULT_THEME };

let settingsBtn, themePanel, themeOverlay, closeThemeBtn, resetThemeBtn, presetGrid;
let inputs = {};

function initTheme() {
  settingsBtn   = document.getElementById('settings-btn');
  themePanel    = document.getElementById('theme-panel');
  themeOverlay  = document.getElementById('theme-overlay');
  closeThemeBtn = document.getElementById('close-theme-btn');
  resetThemeBtn = document.getElementById('reset-theme-btn');
  presetGrid    = document.getElementById('preset-grid');

  inputs = {
    accent: document.getElementById('input-accent'),
    bgStart: document.getElementById('input-bg-start'),
    bgEnd: document.getElementById('input-bg-end'),
    cardBg: document.getElementById('input-card-bg'),
    text: document.getElementById('input-text'),
    progress: document.getElementById('input-progress'),
    button: document.getElementById('input-button'),
    checkbox: document.getElementById('input-checkbox'),
    glow: document.getElementById('input-glow'),
  };

  renderPresetGrid();
  loadTheme();
  applyTheme(currentTheme);
  syncThemeInputs();

  settingsBtn.addEventListener('click', openThemePanel);
  closeThemeBtn.addEventListener('click', closeThemePanel);
  themeOverlay.addEventListener('click', closeThemePanel);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && themePanel.classList.contains('open')) closeThemePanel();
  });

  inputs.accent.addEventListener('input', (e) => updateThemeValue('accent', e.target.value));
  inputs.bgStart.addEventListener('input', (e) => updateThemeValue('bgStart', e.target.value));
  inputs.bgEnd.addEventListener('input', (e) => updateThemeValue('bgEnd', e.target.value));
  inputs.cardBg.addEventListener('input', (e) => updateThemeValue('cardBg', hexToRgba(e.target.value, 0.1)));
  inputs.text.addEventListener('input', (e) => updateThemeValue('text', e.target.value));
  inputs.progress.addEventListener('input', (e) => updateThemeValue('progress', e.target.value));
  inputs.button.addEventListener('input', (e) => updateThemeValue('button', e.target.value));
  inputs.checkbox.addEventListener('input', (e) => updateThemeValue('checkbox', e.target.value));
  inputs.glow.addEventListener('input', (e) => updateThemeValue('glow', e.target.value));

  resetThemeBtn.addEventListener('click', resetTheme);
}

function renderPresetGrid() {
  presetGrid.innerHTML = '';
  THEME_PRESETS.forEach(preset => {
    const swatch = document.createElement('div');
    swatch.className = 'preset-swatch';
    swatch.title = preset.name;
    swatch.style.background = `linear-gradient(135deg, ${preset.bgStart}, ${preset.bgEnd})`;
    swatch.addEventListener('click', () => applyPreset(preset));
    presetGrid.appendChild(swatch);
  });
}

function applyPreset(preset) {
  currentTheme = { ...preset };
  applyTheme(currentTheme);
  syncThemeInputs();
  saveTheme();
  highlightActivePreset();
}

function highlightActivePreset() {
  const swatches = presetGrid.querySelectorAll('.preset-swatch');
  swatches.forEach((swatch, i) => {
    swatch.classList.toggle('active', THEME_PRESETS[i].name === currentTheme.name);
  });
}

function openThemePanel() {
  themePanel.classList.add('open');
  themeOverlay.classList.add('open');
  settingsBtn.classList.add('spin');
  setTimeout(() => settingsBtn.classList.remove('spin'), 500);
}

function closeThemePanel() {
  themePanel.classList.remove('open');
  themeOverlay.classList.remove('open');
}

function updateThemeValue(key, value) {
  currentTheme = { ...currentTheme, [key]: value, name: 'Custom' };
  applyTheme(currentTheme);
  saveTheme();
  highlightActivePreset();
}

function applyTheme(theme) {
  const root = document.documentElement.style;
  root.setProperty('--theme-accent', theme.accent);
  root.setProperty('--theme-bg-start', theme.bgStart);
  root.setProperty('--theme-bg-end', theme.bgEnd);
  root.setProperty('--theme-card-bg', theme.cardBg);
  root.setProperty('--theme-text', theme.text);
  root.setProperty('--theme-progress', theme.progress);
  root.setProperty('--theme-button', theme.button);
  root.setProperty('--theme-checkbox', theme.checkbox);
  root.setProperty('--theme-glow', theme.glow);
}

function syncThemeInputs() {
  inputs.accent.value = currentTheme.accent;
  inputs.bgStart.value = currentTheme.bgStart;
  inputs.bgEnd.value = currentTheme.bgEnd;
  inputs.cardBg.value = rgbaToHex(currentTheme.cardBg) || '#ffffff';
  inputs.text.value = currentTheme.text;
  inputs.progress.value = currentTheme.progress;
  inputs.button.value = currentTheme.button;
  inputs.checkbox.value = currentTheme.checkbox;
  inputs.glow.value = currentTheme.glow;
  highlightActivePreset();
}

function resetTheme() {
  currentTheme = { ...DEFAULT_THEME };
  applyTheme(currentTheme);
  syncThemeInputs();
  saveTheme();
}

function saveTheme() {
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(currentTheme));
}

function loadTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored) {
    try {
      currentTheme = { ...DEFAULT_THEME, ...JSON.parse(stored) };
    } catch {
      currentTheme = { ...DEFAULT_THEME };
    }
  }
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function rgbaToHex(color) {
  if (!color) return null;
  if (color.startsWith('#')) return color;
  const match = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) return null;
  const toHex = (n) => parseInt(n, 10).toString(16).padStart(2, '0');
  return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
}