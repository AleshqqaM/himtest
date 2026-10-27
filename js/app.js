import { rankFor, ELEMENTS, XP_PER_ELEMENT, elementsUnlocked, localDay, applyDay, currentDayStreak, lastDays, AVATARS, NICK_MAX, emptyProfile, checkNickname, normalizeProfile, exportData, importData } from './cabinet.js';
import { MATCH_LETTERS, emptyResponse, isComplete, isStarted, toBlank, formatBlank, scoreTask, examGrade, prepareVariant, validateExamBank } from './exam.js';

// Чистые функции: их можно проверить отдельно от интерфейса.
export const TEST_SECONDS = 20 * 60;

export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function prepareQuestions(bank) {
  return shuffle(bank).slice(0, 20).map(question => {
    // Перемешиваем индексы, чтобы правильный ответ не потерялся.
    const order = shuffle(question.options.map((_, index) => index));
    return { ...question, options: order.map(index => question.options[index]),
      correctIndex: order.indexOf(question.correctIndex) };
  });
}

export function validateBank(bank, topic) {
  if (!Array.isArray(bank) || bank.length === 0) throw new Error('Банк вопросов пуст.');
  const ids = new Set();
  for (const q of bank) {
    if (!q || typeof q.id !== 'string' || !q.id.trim() || ids.has(q.id) ||
      q.grade !== topic.grade || q.topic !== topic.id ||
      typeof q.text !== 'string' || !q.text.trim() ||
      typeof q.explanation !== 'string' || !q.explanation.trim() ||
      !Array.isArray(q.options) || q.options.length !== 4 ||
      q.options.some(option => typeof option !== 'string' || !option.trim()) ||
      new Set(q.options).size !== 4 || !Number.isInteger(q.correctIndex) ||
      q.correctIndex < 0 || q.correctIndex > 3) throw new Error('Некорректный вопрос в банке.');
    ids.add(q.id);
  }
  return bank;
}

export function calculateResult(questions, answers) {
  const correct = questions.filter((q, i) => answers[i] === q.correctIndex).length;
  const total = questions.length;
  const percent = total ? Math.round(correct / total * 100) : 0;
  // Границы оценок сравниваем с точной долей, до округления процента.
  return { correct, total, percent, grade: gradeFromRatio(total ? correct / total : 0) };
}

export const gradeFromRatio = ratio => ratio >= .85 ? 5 : ratio >= .65 ? 4 : ratio >= .45 ? 3 : 2;

export function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
}

export function remainingSeconds(deadline, now = Date.now()) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

// Геймификация: всё считается и хранится только на устройстве.
export const BADGES = [
  { id: 'first', emoji: '🧪', title: 'Первый опыт', hint: 'Пройди первый тест' },
  { id: 'streak5', emoji: '⚡', title: 'Цепная реакция', hint: 'Серия из 5 верных ответов' },
  { id: 'streak10', emoji: '🔥', title: 'Катализатор', hint: 'Серия из 10 верных ответов' },
  { id: 'excellent', emoji: '⭐', title: 'Пятёрка', hint: 'Получи оценку 5' },
  { id: 'perfect', emoji: '💎', title: 'Чистое вещество', hint: 'Тест без единой ошибки' },
  { id: 'explorer', emoji: '🔭', title: 'Исследователь', hint: 'Пройди 3 разные темы' },
  { id: 'allGrades', emoji: '🧬', title: 'Полный ряд', hint: 'Темы всех классов с 6 по 11' },
  { id: 'tests10', emoji: '🔟', title: 'Десять опытов', hint: 'Пройди 10 тестов' },
  { id: 'days3', emoji: '📅', title: 'Три дня подряд', hint: 'Занимайся 3 дня подряд' },
  { id: 'days7', emoji: '🗓️', title: 'Неделя химии', hint: 'Занимайся 7 дней подряд' },
  { id: 'level5', emoji: '🎓', title: 'Аналитик', hint: 'Дойди до 5 уровня' },
  { id: 'ogeVariant', emoji: '🎯', title: 'Пробник', hint: 'Реши вариант ОГЭ целиком' },
  { id: 'oge20', emoji: '🏅', title: 'Почти максимум', hint: '20+ баллов из 24 в варианте ОГЭ' },
];

export const OGE_VARIANT_ID = 'oge-variant';

export const emptyProgress = () => ({ xp: 0, tests: 0, bestStreak: 0, best: {}, badges: [], grades: [],
  dayStreak: 0, bestDayStreak: 0, lastDay: null, activity: {} });

export function xpForTest({ correct, total, grade }, bestStreak) {
  return correct * 10 + 10 + (bestStreak >= 5 ? 20 : 0) + (grade === 5 ? 30 : 0) + (total && correct === total ? 50 : 0);
}

// Уровень n начинается с 100·n·(n−1)/2 XP: 0, 100, 300, 600, 1000…
export function levelFromXP(xp) {
  let level = 1;
  while (100 * (level + 1) * level / 2 <= xp) level++;
  const start = 100 * level * (level - 1) / 2;
  const next = 100 * (level + 1) * level / 2;
  return { level, start, next, progress: (xp - start) / (next - start) };
}

export function applyTest(previous, summary, day = localDay()) {
  const progress = { ...emptyProgress(), ...previous };
  const gained = xpForTest(summary, summary.bestStreak);
  const before = levelFromXP(progress.xp).level;
  const record = progress.best[summary.topicId];
  const next = {
    xp: progress.xp + gained,
    tests: progress.tests + 1,
    bestStreak: Math.max(progress.bestStreak, summary.bestStreak),
    best: { ...progress.best, [summary.topicId]: Math.max(record ?? 0, summary.percent) },
    grades: [...new Set([...progress.grades, summary.schoolClass])].sort((a, b) => a - b),
    badges: [...progress.badges],
    ...applyDay(progress, day, gained),
  };
  const variant = summary.topicId === OGE_VARIANT_ID;
  const earned = {
    first: true,
    streak5: summary.bestStreak >= 5,
    streak10: summary.bestStreak >= 10,
    excellent: summary.grade === 5,
    perfect: summary.total > 0 && summary.correct === summary.total,
    explorer: Object.keys(next.best).length >= 3,
    allGrades: next.grades.length >= 6,
    tests10: next.tests >= 10,
    days3: next.dayStreak >= 3,
    days7: next.dayStreak >= 7,
    level5: levelFromXP(next.xp).level >= 5,
    ogeVariant: variant,
    oge20: variant && summary.correct >= 20,
  };
  const newBadges = BADGES.filter(badge => earned[badge.id] && !next.badges.includes(badge.id));
  next.badges.push(...newBadges.map(badge => badge.id));
  return { progress: next, gained, newBadges, levelUp: levelFromXP(next.xp).level > before,
    newRecord: record !== undefined && summary.percent > record, dayStreakUp: next.dayStreak > 1 && next.lastDay !== progress.lastDay };
}

// localStorage может быть недоступен (приватный режим, запрет сайта), поэтому всё через try.
export const storage = {
  get(key, fallback = null) {
    try { const raw = localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* прогресс просто не сохранится */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* удалять нечего */ }
  },
};

const THEME_COLORS = { light: '#f3f7f1', dark: '#07120e' };

function setupTheme() {
  const root = document.documentElement;
  const toggle = document.querySelector('#theme-toggle');
  const media = matchMedia('(prefers-color-scheme: dark)');
  const current = () => root.dataset.theme || (media.matches ? 'dark' : 'light');
  const sync = () => {
    const theme = current();
    toggle.setAttribute('aria-pressed', String(theme === 'dark'));
    // При ручном выборе обе meta получают цвет выбранной темы.
    document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
      meta.content = root.dataset.theme ? THEME_COLORS[theme] : THEME_COLORS[meta.media.includes('dark') ? 'dark' : 'light'];
    });
  };
  toggle.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('himtest-theme', next); } catch { /* тема продержится до перезагрузки */ }
    sync();
  });
  media.addEventListener('change', sync);
  sync();
}

// Иконки в одном стиле: контур 24×24, цвет берётся из currentColor.
const ICONS = {
  flask: '<path d="M9 3h6M10 3v6L4.5 18.5a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7 15h10"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  beaker: '<path d="M5 3h14M6 3v15a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V3"/><path d="M6 12h12M10 16h.01M14 15h.01"/>',
  atom: '<ellipse cx="12" cy="12" rx="9.5" ry="4"/><ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(120 12 12)"/><circle cx="12" cy="12" r="1.4"/>',
  molecule: '<circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><circle cx="12" cy="7" r="3"/><path d="M10.4 9.6 7.4 15M13.6 9.6l3 5.4M8.5 17h7"/>',
  table: '<rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  cube: '<path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10"/>',
  bolt: '<path d="M13 2 5 13.5h6L10 22l8-11.5h-6z"/>',
  hexagon: '<path d="M12 2.5 20.2 7.2v9.6L12 21.5 3.8 16.8V7.2z"/><path d="M12 6.5l4.8 2.8v5.4L12 17.5"/>',
  drop: '<path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>',
  redox: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  flame: '<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8a7 7 0 0 0 7 7z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cross: '<path d="M6 6l12 12M18 6 6 18"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9.5 17h5"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  retry: '<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 20h14"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};

// Склонение после числа: plural(3, ['день', 'дня', 'дней']) → «дня».
const plural = (count, [one, few, many]) => {
  const tens = count % 100, ones = count % 10;
  if (tens >= 11 && tens <= 14) return many;
  return ones === 1 ? one : ones >= 2 && ones <= 4 ? few : many;
};
const DAYS = ['день', 'дня', 'дней'];
const motionOK = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.flask}</svg>`;
const TOPIC_ICONS = {
  'grade-6-substances': 'flask', 'grade-6-phenomena': 'sparkle', 'grade-7-basics': 'beaker', 'grade-7-atoms': 'atom',
  'grade-8-compounds': 'molecule', 'grade-8-periodic': 'table', 'grade-9-elements': 'cube', 'grade-9-ions': 'bolt',
  'grade-10-hydrocarbons': 'hexagon', 'grade-10-oxygen': 'drop', 'grade-11-general': 'redox', 'grade-11-inorganic': 'flame',
};

// Иллюстрация главного экрана: колба с пузырьками и атом.
const HERO_ART = `<svg class="hero-art" viewBox="0 0 240 240" aria-hidden="true">
  <defs><linearGradient id="liquid" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--lime)"/><stop offset="1" stop-color="var(--accent)"/></linearGradient></defs>
  <circle cx="120" cy="128" r="96" fill="var(--accent-soft)"/>
  <g class="orbit"><ellipse cx="184" cy="56" rx="34" ry="13" fill="none" stroke="var(--violet)" stroke-width="3"/><ellipse cx="184" cy="56" rx="34" ry="13" transform="rotate(60 184 56)" fill="none" stroke="var(--violet)" stroke-width="3"/><circle cx="184" cy="56" r="6" fill="var(--violet)"/></g>
  <path d="M96 46h48v10h-7v44l44 78a15 15 0 0 1-13 22H72a15 15 0 0 1-13-22l44-78V56h-7z" fill="var(--surface)" stroke="var(--ink)" stroke-width="4" stroke-linejoin="round"/>
  <path d="M84 138h72l23 41a9 9 0 0 1-8 13H69a9 9 0 0 1-8-13z" fill="url(#liquid)"/>
  <circle class="bubble b1" cx="104" cy="170" r="7" fill="var(--surface)" opacity=".85"/>
  <circle class="bubble b2" cx="132" cy="160" r="5" fill="var(--surface)" opacity=".85"/>
  <circle class="bubble b3" cx="120" cy="182" r="4" fill="var(--surface)" opacity=".85"/>
  <path d="M108 46h24" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/>
  <text x="40" y="70" font-family="Unbounded, sans-serif" font-weight="700" font-size="22" fill="var(--orange)">H₂O</text>
</svg>`;

const VERDICTS = {
  5: { title: 'Мощно!', copy: 'Химия явно на твоей стороне. Так держать.' },
  4: { title: 'Хороший результат', copy: 'Ещё пара тренировок — и будет пятёрка.' },
  3: { title: 'Неплохо, есть куда расти', copy: 'Загляни в разбор ниже: там самое полезное.' },
  2: { title: 'Старт засчитан', copy: 'Ошибки — это карта того, что стоит повторить. Разберём?' },
};

// Картинка для «Поделиться»: рисуем на canvas, без библиотек и без сервера.
export async function drawScoreCard(summary) {
  const W = 1080, H = 1350;
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d');
  await Promise.all(['700 64px Unbounded', '700 40px Manrope'].map(font => document.fonts?.load(font).catch(() => null)));
  const display = '"Unbounded", "Manrope", sans-serif';
  const body = '"Manrope", system-ui, sans-serif';
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#07120e');
  bg.addColorStop(1, '#0d3b2a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // Пара бензольных колец на фоне.
  ctx.strokeStyle = '#3fdb9822';
  ctx.lineWidth = 4;
  for (const [cx, cy, r] of [[930, 170, 110], [140, 1180, 90], [980, 1120, 60]]) {
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI / 3 * i + Math.PI / 6;
      ctx[i ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.stroke();
  }
  ctx.fillStyle = '#c8f169';
  ctx.font = `700 44px ${display}`;
  ctx.fillText('ХимТест', 80, 130);
  ctx.fillStyle = '#9fb8ab';
  ctx.font = `700 34px ${body}`;
  const topic = `${summary.topic.grade} класс · ${summary.topic.title}`;
  wrapText(ctx, topic, 80, 190, W - 160, 44);
  const cx = W / 2, cy = 590, r = 230;
  ctx.lineCap = 'round';
  ctx.lineWidth = 44;
  ctx.strokeStyle = '#ffffff17';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, '#3fdb98');
  ring.addColorStop(1, '#c8f169');
  ctx.strokeStyle = ring;
  ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(.005, summary.percent / 100)); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8f5ee';
  ctx.font = `700 118px ${display}`;
  ctx.fillText(`${summary.correct}/${summary.total}`, cx, cy + 40);
  ctx.fillStyle = '#9fb8ab';
  ctx.font = `700 44px ${body}`;
  ctx.fillText(`${summary.percent}% верно`, cx, cy + 110);
  ctx.fillStyle = '#e8f5ee';
  ctx.font = `700 64px ${display}`;
  ctx.fillText(VERDICTS[summary.grade].title, cx, 960);
  ctx.fillStyle = '#c8f169';
  ctx.font = `800 40px ${body}`;
  const streak = summary.bestStreak ? ` · серия 🔥 ${summary.bestStreak}` : '';
  ctx.fillText(`оценка ${summary.grade} · ${formatTime(summary.elapsed)}${streak}`, cx, 1040);
  ctx.fillStyle = '#9fb8ab';
  ctx.font = `700 34px ${body}`;
  ctx.fillText(`${location.host}${location.pathname}`.replace(/\/$/, ''), cx, 1240);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('canvas')), 'image/png'));
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = word;
    } else line = test;
  }
  ctx.fillText(line, x, y);
}

// Конфетти из колб и искр при хорошем результате; без библиотек.
function celebrate() {
  if (!motionOK()) return;
  const layer = Object.assign(document.createElement('div'), { className: 'confetti' });
  layer.setAttribute('aria-hidden', 'true');
  const pieces = ['🧪', '⚗️', '✨', '⭐', '', '', '', '', '', ''];
  const colors = ['var(--accent)', 'var(--lime)', 'var(--violet)', 'var(--orange)'];
  for (let i = 0; i < 46; i++) {
    const el = document.createElement('span');
    const emoji = pieces[i % pieces.length];
    if (emoji) el.textContent = emoji;
    else el.style.background = colors[i % colors.length];
    el.className = emoji ? 'confetti-emoji' : 'confetti-bit';
    el.style.left = `${Math.random() * 100}%`;
    layer.append(el);
    const drift = (Math.random() - .5) * 220;
    el.animate([
      { transform: 'translate3d(0,-10vh,0) rotate(0deg)', opacity: 1 },
      { transform: `translate3d(${drift}px,105vh,0) rotate(${(Math.random() - .5) * 900}deg)`, opacity: .9 }],
    { duration: 1800 + Math.random() * 1400, delay: Math.random() * 400, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' });
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 3800);
}

// Мягкое появление нового экрана.
function enter(root) {
  if (!motionOK()) return;
  [...root.children].slice(0, 6).forEach((el, i) => el.animate(
    [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
    { duration: 380, delay: i * 50, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }));
}

// Все вопросы выводим как текст: JSON не может вставить HTML в страницу.
const escapeHTML = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

if (typeof document !== 'undefined') initialize();

async function initialize() {
  const main = document.querySelector('#main');
  const dialog = document.querySelector('#finish-dialog');
  const announcer = document.querySelector('#announcer');
  let catalog = [];
  let selectedGrade = 6;
  let session = null;
  let timerId = null;
  let lastTopic = null;
  let screen = 'home';
  let oge = null;
  let exam = null;
  let examTimerId = null;
  const PROGRESS_KEY = 'himtest-progress';
  const PROFILE_KEY = 'himtest-profile';
  let progress = { ...emptyProgress(), ...storage.get(PROGRESS_KEY, {}) };
  let profile = normalizeProfile(storage.get(PROFILE_KEY, {}));

  function renderHeaderStats() {
    const { level } = levelFromXP(progress.xp);
    document.querySelector('#header-stats').innerHTML = `<button class="level-chip" type="button" data-cabinet aria-label="Мой кабинет${progress.tests ? `, уровень ${level}` : ''}">
      <span class="chip-avatar" aria-hidden="true">${profile.avatar}</span>${progress.tests ? `Ур. ${level}` : 'Кабинет'}</button>`;
  }

  function streakTag(reward) {
    const days = reward.progress.dayStreak;
    return reward.dayStreakUp ? `<span class="reward-tag">🔥 ${days} ${plural(days, DAYS)} подряд</span>` : '';
  }

  function progressPanelHTML() {
    if (!progress.tests) return `<ol class="steps" aria-label="Как это работает">
        <li><span class="step-num">1</span><span><strong>Класс</strong>выбери свой</span></li>
        <li><span class="step-num">2</span><span><strong>Тема</strong>что повторим</span></li>
        <li><span class="step-num">3</span><span><strong>20 минут</strong>и сразу разбор</span></li>
      </ol>`;
    const lvl = levelFromXP(progress.xp);
    const streak = currentDayStreak(progress, localDay());
    return `<section class="progress-panel cabinet-teaser" aria-labelledby="progress-title">
        <span class="avatar avatar-m" aria-hidden="true">${profile.avatar}</span>
        <div class="level-info"><h2 id="progress-title">${profile.nick ? escapeHTML(profile.nick) : `Уровень ${lvl.level}`}</h2>
          <div class="xp-bar" role="progressbar" aria-label="Опыт до следующего уровня" aria-valuemin="${lvl.start}" aria-valuemax="${lvl.next}" aria-valuenow="${progress.xp}"><span style="width:${Math.round(lvl.progress * 100)}%"></span></div>
          <p class="xp-text">${profile.nick ? `Уровень ${lvl.level} · ` : ''}${rankFor(lvl.level)} · ${streak ? `🔥 ${streak} ${plural(streak, DAYS)} подряд` : 'начни серию дней сегодня'} · бейджи ${progress.badges.length}/${BADGES.length}</p></div>
        <button class="button secondary" type="button" data-cabinet>${icon('trophy')} Мой кабинет</button>
      </section>`;
  }

  function focusHeading() {
    const heading = main.querySelector('[data-focus]');
    if (heading) heading.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  async function loadJSON(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
    return response.json();
  }

  function setScreen(name) {
    screen = name;
    document.body.dataset.screen = name;
  }

  function showHome(moveFocus = false, animate = true) {
    setScreen('home');
    const topics = catalog.filter(topic => topic.grade === selectedGrade);
    main.innerHTML = `
      <section class="home-hero" aria-labelledby="home-title">
        <div class="home-hero-text">
          <p class="chip chip-accent">${icon('sparkle')} 6–11 класс · без регистрации</p>
          <h1 id="home-title" tabindex="-1" data-focus>Химия без зубрёжки. <span class="gradient-text">Погнали?</span></h1>
          <p class="hero-copy">20 вопросов, 20 минут и честный разбор, где был подвох. Ошибаться можно — так и учатся.</p>
        </div>
        ${HERO_ART}
      </section>
      ${progressPanelHTML()}
      <section class="oge-card" aria-labelledby="oge-title">
        <div class="oge-card-text">
          <p class="chip chip-violet">${icon('target')} 9 класс · задания 1–19</p>
          <h2 id="oge-title">Готовишься к ОГЭ?</h2>
          <p>Задания в экзаменационном формате: «два из пяти», соответствия, расчёты. Баллы — как на экзамене.</p>
        </div>
        <div class="oge-actions">
          <button class="button primary" type="button" data-oge-hub>${icon('target')} Тренажёр ОГЭ</button>
          <button class="button secondary" type="button" data-oge-variant>${icon('clipboard')} Вариант на время</button>
        </div>
      </section>
      <section class="choose" aria-labelledby="choose-title">
        <h2 id="choose-title" class="section-title">Что изучим сегодня?</h2>
        <div class="grade-tabs" role="group" aria-label="Выбери класс">${[6,7,8,9,10,11].map(grade => `<button class="grade-tab" type="button" data-grade="${grade}" aria-pressed="${grade === selectedGrade}" aria-label="${grade} класс">${grade}<small>класс</small></button>`).join('')}</div>
        <div class="topic-list" id="topics">${topics.map((topic, i) => topic.file ? `
          <article class="topic tone-${i % 4}">
            <div class="topic-head"><span class="topic-icon">${icon(TOPIC_ICONS[topic.id])}</span><span class="topic-tag">Тема ${i + 1}</span></div>
            <h3>${escapeHTML(topic.title)}</h3>
            <p class="topic-description">${escapeHTML(topic.description)}</p>
            <p class="topic-meta"><span>${icon('grid')} ${Math.min(20, topic.count)} из ${topic.count}</span><span>${icon('clock')} 20 мин</span>${progress.best[topic.id] !== undefined ? `<span class="record">${icon('trophy')} Рекорд ${progress.best[topic.id]}%</span>` : ''}</p>
            <button class="button primary topic-start" type="button" data-start="${escapeHTML(topic.id)}" aria-label="Начать тест: ${escapeHTML(topic.title)}">Погнали ${icon('arrowRight')}</button>
          </article>` : '').join('') || `<div class="empty-state"><h3>Этот класс скоро подъедет</h3><p>Вопросы пока готовятся. Здесь появятся:</p><ul>${topics.map(topic => `<li>${escapeHTML(topic.title)}</li>`).join('')}</ul></div>`}</div>
      </section>
      <aside class="note-card">${icon('bulb')}<p><strong>Ошибаться — норм.</strong> После теста покажем правильные ответы и объясним почему. Это тренировка, а не контрольная. Тем в тренажёре: ${catalog.filter(item => item.file).length}. Вопросы авторские, их стоит сверить с учителем химии.</p></aside>`;
    main.querySelectorAll('[data-grade]').forEach(button => button.addEventListener('click', () => {
      selectedGrade = Number(button.dataset.grade);
      showHome(false, false);
      main.querySelector(`[data-grade="${selectedGrade}"]`).focus({ preventScroll: true });
      const available = catalog.filter(topic => topic.grade === selectedGrade && topic.file).length;
      announcer.textContent = `${selectedGrade} класс. Доступно тем: ${available}.`;
    }));
    main.querySelectorAll('[data-start]').forEach(button => button.addEventListener('click', () => startTest(button.dataset.start)));
    main.querySelector('[data-oge-hub]').addEventListener('click', () => showOgeHub());
    main.querySelector('[data-oge-variant]').addEventListener('click', () => startExam('variant'));
    main.querySelector('.cabinet-teaser [data-cabinet]')?.addEventListener('click', () => showCabinet());
    if (moveFocus) focusHeading();
    if (animate) enter(main);
  }

  async function startTest(topicId) {
    if (screen === 'loading') return;
    screen = 'loading';
    main.querySelectorAll('[data-start], [data-retry], [data-home], [data-grade]').forEach(button => { button.disabled = true; });
    announcer.textContent = 'Загружаем вопросы.';
    const topic = catalog.find(item => item.id === topicId);
    try {
      const bank = validateBank(await loadJSON(topic.file), topic);
      const questions = prepareQuestions(bank);
      const startedAt = Date.now();
      session = { topic, questions, answers: Array(questions.length).fill(null), index: 0,
        startedAt, deadline: startedAt + TEST_SECONDS * 1000, ended: false, warned: false, streak: 0, bestStreak: 0 };
      lastTopic = topic.id;
      setScreen('quiz');
      announcer.textContent = 'Тест начался. На ответы есть 20 минут.';
      showQuestion();
      clearInterval(timerId);
      timerId = setInterval(updateTimer, 250);
      updateTimer();
    } catch (error) {
      setScreen('error');
      console.error(error);
      showError('Не удалось открыть тему. Проверьте подключение и попробуйте ещё раз.');
    }
  }

  const LETTERS = ['А', 'Б', 'В', 'Г'];
  const PRAISE = ['Верно!', 'Точно в цель!', 'Так держать!', 'Чётко!', 'Есть!'];
  const OOPS = ['Почти! Разберём, где подвох', 'Мимо, но это поправимо', 'Не то — смотри, почему'];
  const pick = list => list[Math.floor(Math.random() * list.length)];

  function feedbackHTML(question, answer) {
    if (answer === null) return '';
    const right = answer === question.correctIndex;
    return `<div class="feedback ${right ? 'is-correct' : 'is-wrong'}">
      <p class="feedback-title">${icon(right ? 'check' : 'bulb')} ${escapeHTML(right ? pick(PRAISE) : pick(OOPS))}</p>
      ${right ? '' : `<p class="feedback-answer">Правильный ответ: <strong>${escapeHTML(question.options[question.correctIndex])}</strong></p>`}
      <p class="feedback-text">${escapeHTML(question.explanation)}</p></div>`;
  }

  function nextLabel() {
    const last = session.index === session.questions.length - 1;
    if (last) return `Завершить ${icon('check')}`;
    return session.answers[session.index] === null ? `Пропустить ${icon('arrowRight')}` : `Дальше ${icon('arrowRight')}`;
  }

  function streakHTML() {
    return session.streak >= 2 ? `<span class="streak-chip" aria-label="Серия правильных ответов: ${session.streak}"><span aria-hidden="true">🔥</span> ${session.streak}</span>` : '';
  }

  function showQuestion(direction = 0, refocus = true) {
    if (!session || session.ended) return;
    if (remainingSeconds(session.deadline) === 0) { finishTest(true); return; }
    const { questions, answers, index, topic } = session;
    const question = questions[index];
    const answer = answers[index];
    const answered = answers.filter(item => item !== null).length;
    const locked = answer !== null;
    main.innerHTML = `<section class="quiz" aria-label="Тест по химии">
      <div class="quiz-top">
        <button class="icon-button" id="finish" type="button" aria-label="Завершить досрочно">${icon('cross')}</button>
        <div class="quiz-progress"><div class="bar" role="progressbar" aria-label="Отвечено вопросов" aria-valuemin="0" aria-valuemax="${questions.length}" aria-valuenow="${answered}"><span style="width:${answered / questions.length * 100}%"></span></div></div>
        <span id="streak">${streakHTML()}</span>
        <div class="timer" role="timer" aria-live="off" aria-label="Осталось времени">${icon('clock')}<span id="time-value">${formatTime(remainingSeconds(session.deadline))}</span></div>
      </div>
      <div class="question-card" id="question-card">
        <p class="q-meta"><span>Вопрос ${index + 1} <span class="q-of">из ${questions.length}</span></span><span>${topic.grade} класс · ${escapeHTML(topic.title)}</span></p>
        <h1 class="q-text" id="q-text" tabindex="-1" data-focus>${escapeHTML(question.text)}</h1>
        <div class="options" role="group" aria-labelledby="q-text">${question.options.map((option, i) => {
          const state = !locked ? '' : i === question.correctIndex ? 'is-correct' : i === answer ? 'is-wrong' : 'is-dim';
          return `<button class="option ${state}" type="button" data-option="${i}" aria-pressed="${answer === i}" ${locked ? 'aria-disabled="true"' : ''}>
            <span class="option-key" aria-hidden="true">${LETTERS[i]}</span><span class="option-text">${escapeHTML(option)}</span>
            <span class="option-mark" aria-hidden="true">${state === 'is-correct' ? icon('check') : state === 'is-wrong' ? icon('cross') : ''}</span>
            ${state === 'is-correct' ? '<span class="sr-only">— правильный ответ</span>' : state === 'is-wrong' ? '<span class="sr-only">— твой ответ, неверный</span>' : ''}</button>`;
        }).join('')}</div>
        <div id="feedback">${feedbackHTML(question, answer)}</div>
      </div>
      <nav class="quiz-nav" aria-label="Навигация по вопросам">
        <button class="button secondary" id="previous" type="button" ${index === 0 ? 'disabled' : ''} aria-label="Предыдущий вопрос">${icon('arrowLeft')}</button>
        <button class="button primary" id="next" type="button">${nextLabel()}</button>
      </nav>
      <p class="kbd-hint">Клавиши <kbd>1</kbd>–<kbd>4</kbd> — ответ, <kbd>Enter</kbd> — дальше</p></section>`;
    main.querySelectorAll('[data-option]').forEach(button => button.addEventListener('click', () => choose(Number(button.dataset.option))));
    main.querySelector('#previous').addEventListener('click', () => { session.index--; showQuestion(-1); });
    main.querySelector('#next').addEventListener('click', goNext);
    main.querySelector('#finish').addEventListener('click', askFinish);
    updateTimer();
    if (refocus) focusHeading();
    if (direction && motionOK()) {
      main.querySelector('#question-card').animate([
        { opacity: 0, transform: `translateX(${direction * 28}px)` }, { opacity: 1, transform: 'none' }],
      { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
  }

  function goNext() {
    if (!session || session.ended) return;
    if (session.index === session.questions.length - 1) askFinish();
    else { session.index++; showQuestion(1); }
  }

  // Ответ фиксируется сразу: так честно работают мгновенная проверка и серии.
  function choose(option) {
    // После сна вкладки сперва проверяем реальное время, а не число тиков.
    if (remainingSeconds(session.deadline) === 0) { finishTest(true); return; }
    if (session.answers[session.index] !== null) return;
    const question = session.questions[session.index];
    session.answers[session.index] = option;
    const right = option === question.correctIndex;
    session.streak = right ? session.streak + 1 : 0;
    session.bestStreak = Math.max(session.bestStreak, session.streak);
    showQuestion(0, false);
    announcer.textContent = right
      ? `Верно!${session.streak >= 2 ? ` Серия: ${session.streak}.` : ''}`
      : `Неверно. Правильный ответ: ${question.options[question.correctIndex]}.`;
    main.querySelector('#next').focus({ preventScroll: true });
    main.querySelector('#feedback').scrollIntoView({ block: 'nearest', behavior: motionOK() ? 'smooth' : 'auto' });
    if (!motionOK()) return;
    const chosen = main.querySelector(`[data-option="${option}"]`);
    chosen.animate(right
      ? [{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }]
      : [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }],
    { duration: right ? 320 : 380, easing: 'ease-out' });
    main.querySelector('.feedback')?.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
    if (right && session.streak >= 2) main.querySelector('.streak-chip')?.animate([{ transform: 'scale(.6)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  }

  document.addEventListener('keydown', event => {
    if (screen !== 'quiz' || !session || session.ended || dialog.open) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const n = '1234'.indexOf(event.key);
    if (n !== -1) { event.preventDefault(); choose(n); }
    // На кнопках Enter и так нажимает кнопку; здесь — когда фокус на тексте вопроса.
    else if (event.key === 'Enter' && !document.activeElement?.matches('button') && session.answers[session.index] !== null) { event.preventDefault(); goNext(); }
  });

  function updateTimer() {
    if (!session || session.ended) return;
    const remaining = remainingSeconds(session.deadline);
    if (remaining === 0) { finishTest(true); return; }
    const timer = main.querySelector('[role="timer"]');
    if (timer) {
      main.querySelector('#time-value').textContent = formatTime(remaining);
      timer.setAttribute('aria-label', `Осталось ${Math.floor(remaining / 60)} мин ${remaining % 60} с`);
      timer.classList.toggle('urgent', remaining <= 120);
    }
    if (remaining <= 120 && !session.warned) {
      session.warned = true;
      announcer.textContent = 'Осталось меньше двух минут. По окончании времени тест завершится автоматически.';
    }
  }

  function askFinish() {
    if (remainingSeconds(session.deadline) === 0) { finishTest(true); return; }
    const missing = session.answers.filter(answer => answer === null).length;
    document.querySelector('#dialog-message').textContent = missing
      ? `Без ответа: ${missing} из ${session.questions.length}. Они будут засчитаны как ошибки. Ответы можно дополнить, вернувшись к тесту.`
      : 'Все ответы выбраны. После завершения изменить их уже не получится.';
    dialog.showModal();
    document.querySelector('#continue-test').focus();
  }

  function finishTest(timedOut = false) {
    if (!session || session.ended) return;
    session.ended = true;
    setScreen('result');
    clearInterval(timerId);
    if (dialog.open) dialog.close();
    const elapsed = timedOut ? TEST_SECONDS : Math.min(TEST_SECONDS, Math.floor((Date.now() - session.startedAt) / 1000));
    const result = calculateResult(session.questions, session.answers);
    const mistakes = session.questions.map((q, i) => ({ q, answer: session.answers[i], number: i + 1 }))
      .filter(({ q, answer }) => answer !== q.correctIndex);
    const verdict = VERDICTS[result.grade];
    const summary = { ...result, elapsed, bestStreak: session.bestStreak, topic: session.topic, timedOut };
    const reward = applyTest(progress, { ...summary, topicId: session.topic.id, schoolClass: session.topic.grade });
    progress = reward.progress;
    storage.set(PROGRESS_KEY, progress);
    renderHeaderStats();
    main.innerHTML = `<section class="result" aria-labelledby="result-title">
      <div class="score-card grade-${result.grade}" id="score-card">
        <div class="score-card-top"><span class="chip">${icon(TOPIC_ICONS[session.topic.id])} ${session.topic.grade} класс · ${escapeHTML(session.topic.title)}</span></div>
        <div class="score-ring" role="img" aria-label="${result.correct} правильных из ${result.total}, ${result.percent}%">
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="ring-bg"/><circle cx="60" cy="60" r="52" class="ring-fg" pathLength="100" style="stroke-dasharray:${result.percent} 100"/></svg>
          <div class="score-ring-text" aria-hidden="true"><strong>${result.correct}<span>/${result.total}</span></strong><small>${result.percent}%</small></div>
        </div>
        <h1 id="result-title" tabindex="-1" data-focus>${timedOut ? 'Время вышло. ' : ''}${verdict.title}</h1>
        <p class="score-card-copy">${verdict.copy}</p>
        <dl class="score-stats">
          <div><dt>Оценка</dt><dd>${result.grade}</dd></div>
          <div><dt>Время</dt><dd>${formatTime(elapsed)}</dd></div>
          <div><dt>Лучшая серия</dt><dd>${session.bestStreak ? `🔥 ${session.bestStreak}` : '—'}</dd></div>
        </dl>
        <div class="reward">
          <span class="reward-xp">+${reward.gained} XP</span>
          ${reward.levelUp ? `<span class="reward-tag">${icon('star')} Новый уровень: ${levelFromXP(progress.xp).level}</span>` : ''}
          ${reward.newRecord ? `<span class="reward-tag">${icon('trophy')} Новый рекорд темы</span>` : ''}
          ${streakTag(reward)}
        </div>
        ${reward.newBadges.length ? `<ul class="new-badges" aria-label="Новые бейджи">${reward.newBadges.map(badge => `<li><span aria-hidden="true">${badge.emoji}</span> ${badge.title}</li>`).join('')}</ul>` : ''}
        <p class="score-card-brand">${icon('atom')} ХимТест · химия по шагам</p>
      </div>
      <div class="result-actions">
        <button class="button primary" type="button" data-retry>${icon('retry')} Ещё раз</button>
        <button class="button secondary" type="button" data-share>${icon('share')} Поделиться</button>
        <button class="button secondary" type="button" data-home>${icon('grid')} Все темы</button>
      </div>
      <section class="review" aria-labelledby="review-title">
        <h2 id="review-title" class="section-title">Разбор ошибок <span class="count-pill">${mistakes.length}</span></h2>
        ${mistakes.length ? `<p class="review-lead">Нажми на вопрос, чтобы увидеть, почему так.</p>
        <div class="review-list">${mistakes.map(({ q, answer, number }) => `<details class="review-item">
          <summary><span class="review-num ${answer === null ? 'is-skip' : ''}">${number}</span><span class="review-q">${escapeHTML(q.text)}</span>${icon('chevron', 'review-chevron')}</summary>
          <div class="review-body">
            <p class="review-line is-wrong">${icon(answer === null ? 'clock' : 'cross')}<span><small>Твой ответ</small>${answer === null ? 'Без ответа' : escapeHTML(q.options[answer])}</span></p>
            <p class="review-line is-right">${icon('check')}<span><small>Правильный ответ</small>${escapeHTML(q.options[q.correctIndex])}</span></p>
            <p class="review-why">${icon('bulb')}<span><small>Почему так</small>${escapeHTML(q.explanation)}</span></p>
          </div></details>`).join('')}</div>` : `<div class="perfect">${icon('trophy')}<p><strong>Ни одной ошибки.</strong> Разбирать нечего — можно брать тему посложнее.</p></div>`}
      </section>
      <p class="scale-note">Тренировочная шкала: «5» — от 85%, «4» — от 65%, «3» — от 45%, «2» — ниже 45%.</p></section>`;
    main.querySelector('[data-retry]').addEventListener('click', () => startTest(lastTopic));
    main.querySelector('[data-home]').addEventListener('click', () => { session = null; showHome(true); });
    main.querySelector('[data-share]').addEventListener('click', event => shareResult(summary, event.currentTarget));
    announcer.textContent = `${timedOut ? 'Время вышло.' : 'Тест завершён.'} Правильных ответов: ${result.correct} из ${result.total}. Оценка: ${result.grade}. Получено ${reward.gained} XP.${reward.newBadges.length ? ` Новые бейджи: ${reward.newBadges.map(b => b.title).join(', ')}.` : ''}`;
    focusHeading();
    enter(main);
    if (result.grade >= 4) celebrate();
  }

  async function shareResult(summary, button) {
    const url = location.origin + location.pathname;
    const text = `ХимТест: ${summary.correct} из ${summary.total} (${summary.percent}%) — «${summary.topic.title}», ${summary.topic.grade} класс. Попробуй сам:`;
    button.disabled = true;
    try {
      const blob = await drawScoreCard(summary);
      const file = new File([blob], 'himtest-result.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Мой результат в ХимТесте', text: `${text} ${url}` });
      } else if (navigator.share) {
        await navigator.share({ title: 'Мой результат в ХимТесте', text, url });
      } else {
        // Без Web Share (обычно ноутбук) — сохраняем картинку файлом.
        const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'himtest-result.png' });
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        announcer.textContent = 'Картинка с результатом сохранена.';
      }
    } catch (error) {
      if (error?.name !== 'AbortError') { console.error(error); announcer.textContent = 'Поделиться не получилось.'; }
    } finally {
      button.disabled = false;
    }
  }

  // ============ Режим ОГЭ ============
  const EXAM_PROGRESS = { variant: OGE_VARIANT_ID, trainer: n => `oge-${n}` };
  const FORMAT_HINT = { multi: 'выбор двух ответов', match: 'соответствие', order: 'последовательность', number: 'расчёт' };
  const pointsWord = points => plural(points, ['балл', 'балла', 'баллов']);

  async function loadOge() {
    if (!oge) {
      const meta = await loadJSON('./data/oge/meta.json');
      oge = { meta, bank: validateExamBank(await loadJSON(meta.bank), meta) };
    }
    return oge;
  }

  async function showOgeHub(moveFocus = true) {
    try { await loadOge(); } catch (error) { console.error(error); showError('Не удалось загрузить задания ОГЭ. Проверьте подключение и попробуйте ещё раз.'); return; }
    exam = null;
    setScreen('oge');
    const { meta, bank } = oge;
    const maxPart = meta.numbers.reduce((sum, item) => sum + item.points, 0);
    const best = progress.best[EXAM_PROGRESS.variant];
    main.innerHTML = `<section class="oge-hub" aria-labelledby="oge-hub-title">
      <button class="text-button back-link" type="button" data-home>${icon('arrowLeft')} Все темы</button>
      <h1 id="oge-hub-title" tabindex="-1" data-focus>ОГЭ по химии: <span class="gradient-text">часть 1</span></h1>
      <p class="hero-copy">${meta.numbers.length} заданий с кратким ответом, максимум ${maxPart} первичных балла. Тренируй номер, который проседает, или реши вариант целиком.</p>
      <article class="variant-card">
        <div><h2>Вариант на время</h2>
          <p class="topic-meta"><span>${icon('grid')} ${meta.numbers.length} заданий</span><span>${icon('clock')} ${meta.partSeconds / 60} мин</span><span>${icon('star')} ${maxPart} баллов</span>${best !== undefined ? `<span class="record">${icon('trophy')} Рекорд ${best}%</span>` : ''}</p>
          <p class="variant-copy">Как на экзамене: ответы проверим в конце, до этого их можно менять.</p></div>
        <button class="button primary" type="button" data-oge-variant>Начать вариант ${icon('arrowRight')}</button>
      </article>
      <h2 class="section-title">Тренажёр по номерам</h2>
      <ul class="task-grid">${meta.numbers.map(item => {
        const record = progress.best[EXAM_PROGRESS.trainer(item.n)];
        return `<li><button class="task-tile" type="button" data-task="${item.n}" aria-label="Задание ${item.n}: ${escapeHTML(item.title)}${record !== undefined ? `, рекорд ${record}%` : ''}">
          <span class="task-num" aria-hidden="true">${item.n}</span>
          <span class="task-info"><strong>${escapeHTML(item.title)}</strong><small>${item.points} ${pointsWord(item.points)} · ${FORMAT_HINT[item.type]} · ${bank.filter(task => task.n === item.n).length} шт.${record !== undefined ? ` · ${record}%` : ''}</small></span>
        </button></li>`;
      }).join('')}</ul>
      <aside class="note-card">${icon('bulb')}<p><strong>Как считаются баллы.</strong> Задания 4, 9, 10, 12 и 17 стоят 2 балла: одна ошибка — 1 балл. По шкале ${meta.year} года «3» ставят от ${meta.scale[3]}, «4» — от ${meta.scale[4]}, «5» — от ${meta.scale[5]} первичных баллов из ${meta.maxTotal}. Задания 20–23 с развёрнутым ответом проверяет эксперт, их здесь пока нет. Задания авторские, в формате демоверсии ФИПИ.</p></aside>
    </section>`;
    main.querySelector('[data-home]').addEventListener('click', () => showHome(true));
    main.querySelector('[data-oge-variant]').addEventListener('click', () => startExam('variant'));
    main.querySelectorAll('[data-task]').forEach(button => button.addEventListener('click', () => startExam('trainer', Number(button.dataset.task))));
    if (moveFocus) focusHeading();
    enter(main);
  }

  async function startExam(mode, n = null) {
    try { await loadOge(); } catch (error) { console.error(error); showError('Не удалось загрузить задания ОГЭ. Проверьте подключение и попробуйте ещё раз.'); return; }
    const { meta, bank } = oge;
    const tasks = mode === 'variant' ? prepareVariant(bank, meta.numbers) : shuffle(bank.filter(task => task.n === n));
    const startedAt = Date.now();
    exam = { mode, n, tasks, responses: tasks.map(emptyResponse), checked: tasks.map(() => false), index: 0,
      startedAt, deadline: mode === 'variant' ? startedAt + meta.partSeconds * 1000 : null, ended: false, warned: false, streak: 0, bestStreak: 0 };
    setScreen('exam');
    announcer.textContent = mode === 'variant'
      ? `Вариант начался. ${tasks.length} заданий, ${meta.partSeconds / 60} минут.`
      : `Тренажёр задания ${n}. Заданий: ${tasks.length}.`;
    showExamTask();
    clearInterval(examTimerId);
    if (mode === 'variant') { examTimerId = setInterval(updateExamTimer, 250); updateExamTimer(); }
  }

  const examLocked = () => exam.mode === 'trainer' && exam.checked[exam.index];

  function examInputHTML(task, response, locked) {
    const right = task.answer;
    if (task.type === 'multi' || task.type === 'order') {
      const list = task.type === 'multi' ? task.options : task.items;
      return `<p class="input-hint">${task.type === 'multi' ? `Выбери ${task.pick} ответа — порядок не важен.` : 'Нажимай элементы в нужном порядке. Нажми ещё раз, чтобы убрать.'}</p>
        <div class="options" role="group" aria-labelledby="q-text">${list.map((text, i) => {
        const digit = i + 1;
        const position = response.indexOf(digit);
        const chosen = position !== -1;
        const correct = task.type === 'multi' ? right.includes(String(digit)) : right[position] === String(digit);
        const state = !locked ? '' : task.type === 'multi'
          ? (correct ? 'is-correct' : chosen ? 'is-wrong' : 'is-dim')
          : (chosen && correct ? 'is-correct' : 'is-wrong');
        const mark = task.type === 'order' && chosen ? `<span class="order-pos">${position + 1}-й</span>` : '';
        return `<button class="option ${state}" type="button" data-pick="${digit}" aria-pressed="${chosen}" ${locked ? 'aria-disabled="true"' : ''}>
          <span class="option-key" aria-hidden="true">${digit}</span><span class="option-text">${escapeHTML(text)}</span>${mark}
          <span class="option-mark" aria-hidden="true">${state === 'is-correct' ? icon('check') : state === 'is-wrong' && chosen ? icon('cross') : ''}</span></button>`;
      }).join('')}</div>
        ${task.type === 'order' && response.length && !locked ? '<button class="text-button" type="button" data-clear>Сбросить порядок</button>' : ''}`;
    }
    if (task.type === 'match') {
      const choices = task.options ? task.options.length : task.choices;
      return `${task.options ? `<ol class="match-options" aria-label="Варианты ответа">${task.options.map(text => `<li>${escapeHTML(text)}</li>`).join('')}</ol>` : ''}
        <div class="match-rows">${task.rows.map((row, r) => `<div class="match-row" role="group" aria-labelledby="row-${r}">
          <p class="match-label" id="row-${r}"><span class="match-letter">${MATCH_LETTERS[r]}</span>${escapeHTML(row)}</p>
          <div class="digit-row">${Array.from({ length: choices }, (_, i) => {
            const digit = i + 1;
            const chosen = response[r] === digit;
            const state = !locked ? '' : String(digit) === right[r] ? 'is-correct' : chosen ? 'is-wrong' : '';
            return `<button class="digit ${state}" type="button" data-row="${r}" data-digit="${digit}" aria-pressed="${chosen}" aria-label="${MATCH_LETTERS[r]} — ${digit}" ${locked ? 'aria-disabled="true"' : ''}>${digit}</button>`;
          }).join('')}</div></div>`).join('')}</div>`;
    }
    return `<label class="number-field" for="number-input"><span>Ответ</span>
      <input id="number-input" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="${escapeHTML(response)}" ${locked ? 'readonly' : ''} aria-describedby="number-hint">
      ${task.unit ? `<span class="number-unit">${escapeHTML(task.unit)}</span>` : ''}</label>
      <p class="input-hint" id="number-hint">Только число, дробную часть — через запятую.</p>`;
  }

  function examFeedbackHTML(task, response) {
    const got = scoreTask(task, response);
    const full = got === task.points;
    return `<div class="feedback ${full ? 'is-correct' : 'is-wrong'}">
      <p class="feedback-title">${icon(full ? 'check' : 'bulb')} ${full ? pick(PRAISE) : got ? 'Почти! Один балл из двух' : pick(OOPS)}</p>
      ${full ? '' : `<p class="feedback-answer">Правильный ответ: <strong>${formatBlank(task, task.answer)}</strong></p>`}
      <p class="feedback-text">${escapeHTML(task.explanation)}</p></div>`;
  }

  function examNextLabel() {
    const last = exam.index === exam.tasks.length - 1;
    if (exam.mode === 'trainer') {
      if (!exam.checked[exam.index]) return isComplete(exam.tasks[exam.index], exam.responses[exam.index]) ? `Проверить ${icon('check')}` : `Пропустить ${icon('arrowRight')}`;
      return last ? `Итоги ${icon('check')}` : `Дальше ${icon('arrowRight')}`;
    }
    return last ? `Завершить ${icon('check')}` : `Дальше ${icon('arrowRight')}`;
  }

  function showExamTask(direction = 0, refocus = true) {
    if (!exam || exam.ended) return;
    if (exam.deadline && remainingSeconds(exam.deadline) === 0) { finishExam(true); return; }
    const { tasks, responses, index, mode } = exam;
    const task = tasks[index];
    const response = responses[index];
    const locked = examLocked();
    const done = mode === 'trainer' ? exam.checked.filter(Boolean).length : responses.filter((r, i) => isComplete(tasks[i], r)).length;
    const blank = isStarted(task, response) ? formatBlank(task, toBlank(task, response)) : '—';
    main.innerHTML = `<section class="quiz exam" aria-label="${mode === 'variant' ? 'Вариант ОГЭ' : `Тренажёр задания ${task.n}`}">
      <div class="quiz-top">
        <button class="icon-button" id="finish" type="button" aria-label="Завершить досрочно">${icon('cross')}</button>
        <div class="quiz-progress"><div class="bar" role="progressbar" aria-label="${mode === 'variant' ? 'Заданий с ответом' : 'Проверено заданий'}" aria-valuemin="0" aria-valuemax="${tasks.length}" aria-valuenow="${done}"><span style="width:${done / tasks.length * 100}%"></span></div></div>
        <span id="streak">${exam.streak >= 2 ? `<span class="streak-chip" aria-label="Серия верных ответов: ${exam.streak}"><span aria-hidden="true">🔥</span> ${exam.streak}</span>` : ''}</span>
        ${mode === 'variant' ? `<div class="timer" role="timer" aria-live="off" aria-label="Осталось времени">${icon('clock')}<span id="time-value">${formatTime(remainingSeconds(exam.deadline))}</span></div>` : ''}
      </div>
      <div class="question-card" id="question-card">
        <p class="q-meta"><span>Задание ${task.n} <span class="q-of">· ${index + 1} из ${tasks.length}</span></span><span>${task.points} ${pointsWord(task.points)} · ${FORMAT_HINT[task.type]}</span></p>
        <h1 class="q-text" id="q-text" tabindex="-1" data-focus>${escapeHTML(task.text)}</h1>
        ${examInputHTML(task, response, locked)}
        <p class="blank-line">В бланк: <output class="blank-value" id="blank-value" aria-live="polite">${blank}</output></p>
        <div id="feedback">${locked ? examFeedbackHTML(task, response) : ''}</div>
      </div>
      ${mode === 'variant' ? `<nav class="task-strip" aria-label="Задания варианта">${tasks.map((t, i) => `<button type="button" class="strip-cell ${isComplete(t, responses[i]) ? 'is-filled' : ''}" data-jump="${i}" ${i === index ? 'aria-current="step"' : ''} aria-label="Задание ${t.n}${isComplete(t, responses[i]) ? ', есть ответ' : ''}">${t.n}</button>`).join('')}</nav>` : ''}
      <nav class="quiz-nav" aria-label="Навигация по заданиям">
        <button class="button secondary" id="previous" type="button" ${index === 0 ? 'disabled' : ''} aria-label="Предыдущее задание">${icon('arrowLeft')}</button>
        <button class="button primary" id="next" type="button">${examNextLabel()}</button>
      </nav></section>`;
    if (!locked) bindExamInputs(task);
    main.querySelectorAll('[data-jump]').forEach(button => button.addEventListener('click', () => {
      const target = Number(button.dataset.jump);
      if (target === exam.index) return;
      const dir = target > exam.index ? 1 : -1;
      exam.index = target;
      showExamTask(dir);
    }));
    main.querySelector('#previous').addEventListener('click', () => { exam.index--; showExamTask(-1); });
    main.querySelector('#next').addEventListener('click', examNext);
    main.querySelector('#finish').addEventListener('click', askFinishExam);
    updateExamTimer();
    if (refocus) focusHeading();
    if (direction && motionOK()) {
      main.querySelector('#question-card').animate([
        { opacity: 0, transform: `translateX(${direction * 28}px)` }, { opacity: 1, transform: 'none' }],
      { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
  }

  // Перерисовка после выбора: фокус возвращается на ту же кнопку.
  function redrawExam(selector) {
    showExamTask(0, false);
    main.querySelector(selector)?.focus({ preventScroll: true });
  }

  function bindExamInputs(task) {
    const response = exam.responses[exam.index];
    main.querySelectorAll('[data-pick]').forEach(button => button.addEventListener('click', () => togglePick(Number(button.dataset.pick))));
    main.querySelector('[data-clear]')?.addEventListener('click', () => {
      exam.responses[exam.index] = [];
      redrawExam('[data-pick="1"]');
      announcer.textContent = 'Порядок сброшен.';
    });
    main.querySelectorAll('[data-digit]').forEach(button => button.addEventListener('click', () => {
      const row = Number(button.dataset.row);
      const digit = Number(button.dataset.digit);
      response[row] = response[row] === digit ? null : digit;
      redrawExam(`[data-row="${row}"][data-digit="${digit}"]`);
    }));
    const input = main.querySelector('#number-input');
    if (input) {
      // Поле не перерисовываем, чтобы не сбивать курсор: обновляем только бланк и кнопку.
      input.addEventListener('input', () => {
        exam.responses[exam.index] = input.value;
        main.querySelector('#blank-value').textContent = input.value.trim() || '—';
        main.querySelector('#next').innerHTML = examNextLabel();
        main.querySelectorAll('.strip-cell')[exam.index]?.classList.toggle('is-filled', isComplete(task, input.value));
      });
      input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); examNext(); } });
    }
  }

  function togglePick(digit) {
    const task = exam.tasks[exam.index];
    const response = exam.responses[exam.index];
    const at = response.indexOf(digit);
    if (at !== -1) response.splice(at, 1);
    else if (task.type === 'order' || response.length < task.pick) response.push(digit);
    else { response.shift(); response.push(digit); }
    redrawExam(`[data-pick="${digit}"]`);
  }

  function examNext() {
    if (!exam || exam.ended) return;
    if (exam.deadline && remainingSeconds(exam.deadline) === 0) { finishExam(true); return; }
    const task = exam.tasks[exam.index];
    const response = exam.responses[exam.index];
    if (exam.mode === 'trainer' && !exam.checked[exam.index] && isComplete(task, response)) {
      exam.checked[exam.index] = true;
      const got = scoreTask(task, response);
      exam.streak = got === task.points ? exam.streak + 1 : 0;
      exam.bestStreak = Math.max(exam.bestStreak, exam.streak);
      showExamTask(0, false);
      announcer.textContent = got === task.points ? `Верно! ${task.points} из ${task.points}.` : `Баллов: ${got} из ${task.points}. Правильный ответ: ${formatBlank(task, task.answer)}.`;
      main.querySelector('#next').focus({ preventScroll: true });
      main.querySelector('#feedback').scrollIntoView({ block: 'nearest', behavior: motionOK() ? 'smooth' : 'auto' });
      if (motionOK()) main.querySelector('.feedback')?.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
      return;
    }
    if (exam.index === exam.tasks.length - 1) askFinishExam();
    else { exam.index++; showExamTask(1); }
  }

  document.addEventListener('keydown', event => {
    if (screen !== 'exam' || !exam || exam.ended || dialog.open || examLocked()) return;
    if (event.altKey || event.ctrlKey || event.metaKey || document.activeElement?.matches('input')) return;
    const task = exam.tasks[exam.index];
    const digit = Number(event.key);
    const count = task.type === 'multi' ? task.options.length : task.type === 'order' ? task.items.length : 0;
    if (digit >= 1 && digit <= count) { event.preventDefault(); togglePick(digit); }
  });

  function updateExamTimer() {
    if (!exam || exam.ended || !exam.deadline) return;
    const remaining = remainingSeconds(exam.deadline);
    if (remaining === 0) { finishExam(true); return; }
    const timer = main.querySelector('[role="timer"]');
    if (timer) {
      main.querySelector('#time-value').textContent = formatTime(remaining);
      timer.setAttribute('aria-label', `Осталось ${Math.floor(remaining / 60)} мин ${remaining % 60} с`);
      timer.classList.toggle('urgent', remaining <= 300);
    }
    if (remaining <= 300 && !exam.warned) {
      exam.warned = true;
      announcer.textContent = 'Осталось меньше пяти минут. По окончании времени вариант завершится автоматически.';
    }
  }

  function askFinishExam() {
    if (exam.deadline && remainingSeconds(exam.deadline) === 0) { finishExam(true); return; }
    const pending = exam.mode === 'trainer'
      ? exam.checked.filter(checked => !checked).length
      : exam.tasks.filter((task, i) => !isComplete(task, exam.responses[i])).length;
    if (exam.mode === 'trainer' && !pending) { finishExam(); return; }
    document.querySelector('#dialog-message').textContent = pending
      ? `${exam.mode === 'trainer' ? 'Не проверено' : 'Без ответа'}: ${pending} из ${exam.tasks.length}. ${exam.mode === 'trainer' ? 'Они не войдут в итог.' : 'За них будет 0 баллов. Можно вернуться и дописать.'}`
      : 'Все ответы на месте. После завершения изменить их уже не получится.';
    dialog.showModal();
    document.querySelector('#continue-test').focus();
  }

  function finishExam(timedOut = false) {
    if (!exam || exam.ended) return;
    exam.ended = true;
    clearInterval(examTimerId);
    if (dialog.open) dialog.close();
    setScreen('result');
    const { meta } = oge;
    const variant = exam.mode === 'variant';
    // В тренажёре в итог идут только проверенные задания.
    const items = exam.tasks.map((task, i) => ({ task, response: exam.responses[i], got: scoreTask(task, exam.responses[i]) }))
      .filter((_, i) => variant || exam.checked[i]);
    const points = items.reduce((sum, item) => sum + item.got, 0);
    const max = items.reduce((sum, item) => sum + item.task.points, 0);
    const percent = max ? Math.round(points / max * 100) : 0;
    if (variant) {
      // Серию в варианте считаем по порядку заданий уже после проверки.
      let streak = 0;
      for (const item of items) { streak = item.got === item.task.points ? streak + 1 : 0; exam.bestStreak = Math.max(exam.bestStreak, streak); }
    }
    const grade = variant ? examGrade(points, meta.scale) : gradeFromRatio(max ? points / max : 0);
    const elapsed = variant && timedOut ? meta.partSeconds : Math.floor((Date.now() - exam.startedAt) / 1000);
    const title = variant ? 'ОГЭ · вариант, часть 1' : `ОГЭ · задание ${exam.n}`;
    const summary = { correct: points, total: max, percent, grade, elapsed, bestStreak: exam.bestStreak, timedOut, topic: { grade: 9, title } };
    const counted = max > 0;
    const reward = counted ? applyTest(progress, { ...summary, topicId: variant ? EXAM_PROGRESS.variant : EXAM_PROGRESS.trainer(exam.n), schoolClass: 9 }) : null;
    if (reward) { progress = reward.progress; storage.set(PROGRESS_KEY, progress); renderHeaderStats(); }
    const mistakes = items.filter(item => item.got < item.task.points);
    const verdict = VERDICTS[grade];
    main.innerHTML = `<section class="result" aria-labelledby="result-title">
      <div class="score-card grade-${grade}" id="score-card">
        <div class="score-card-top"><span class="chip">${icon('target')} ${escapeHTML(title)}</span></div>
        <div class="score-ring" role="img" aria-label="${points} ${pointsWord(points)} из ${max}, ${percent}%">
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="ring-bg"/><circle cx="60" cy="60" r="52" class="ring-fg" pathLength="100" style="stroke-dasharray:${percent} 100"/></svg>
          <div class="score-ring-text" aria-hidden="true"><strong>${points}<span>/${max}</span></strong><small>${pointsWord(points)}</small></div>
        </div>
        <h1 id="result-title" tabindex="-1" data-focus>${timedOut ? 'Время вышло. ' : ''}${counted ? verdict.title : 'Ни одного проверенного задания'}</h1>
        <p class="score-card-copy">${!counted ? 'Ответь хотя бы на одно задание и нажми «Проверить».' : variant ? `Только за часть 1 по шкале ${meta.year} года это «${grade}». Часть 2 даёт ещё до ${meta.maxTotal - max} баллов.` : verdict.copy}</p>
        ${counted ? `<dl class="score-stats">
          <div><dt>${variant ? 'Оценка' : 'Верно'}</dt><dd>${variant ? grade : `${percent}%`}</dd></div>
          <div><dt>Время</dt><dd>${formatTime(elapsed)}</dd></div>
          <div><dt>Лучшая серия</dt><dd>${exam.bestStreak ? `🔥 ${exam.bestStreak}` : '—'}</dd></div>
        </dl>
        <div class="reward">
          <span class="reward-xp">+${reward.gained} XP</span>
          ${reward.levelUp ? `<span class="reward-tag">${icon('star')} Новый уровень: ${levelFromXP(progress.xp).level}</span>` : ''}
          ${reward.newRecord ? `<span class="reward-tag">${icon('trophy')} Новый рекорд</span>` : ''}
          ${streakTag(reward)}
        </div>
        ${reward.newBadges.length ? `<ul class="new-badges" aria-label="Новые бейджи">${reward.newBadges.map(badge => `<li><span aria-hidden="true">${badge.emoji}</span> ${badge.title}</li>`).join('')}</ul>` : ''}` : ''}
        <p class="score-card-brand">${icon('atom')} ХимТест · химия по шагам</p>
      </div>
      ${variant ? `<ol class="points-map" aria-label="Баллы по заданиям">${items.map(({ task, got }) => `<li class="${got === task.points ? 'is-full' : got ? 'is-half' : 'is-zero'}"><span class="pm-num">${task.n}</span><span class="pm-pts">${got}/${task.points}</span></li>`).join('')}</ol>` : ''}
      <div class="result-actions">
        <button class="button primary" type="button" data-retry>${icon('retry')} ${variant ? 'Новый вариант' : 'Ещё раз'}</button>
        ${counted ? `<button class="button secondary" type="button" data-share>${icon('share')} Поделиться</button>` : ''}
        <button class="button secondary" type="button" data-oge-hub>${icon('grid')} Задания ОГЭ</button>
      </div>
      <section class="review" aria-labelledby="review-title">
        <h2 id="review-title" class="section-title">Разбор ошибок <span class="count-pill">${mistakes.length}</span></h2>
        ${mistakes.length ? `<p class="review-lead">Нажми на задание, чтобы увидеть, почему так.</p>
        <div class="review-list">${mistakes.map(({ task, response, got }) => `<details class="review-item">
          <summary><span class="review-num ${isStarted(task, response) ? '' : 'is-skip'}">${task.n}</span><span class="review-q">${escapeHTML(task.text)}</span>${icon('chevron', 'review-chevron')}</summary>
          <div class="review-body">
            <p class="review-line is-wrong">${icon(isStarted(task, response) ? 'cross' : 'clock')}<span><small>Твой ответ · ${got} из ${task.points}</small>${isStarted(task, response) ? formatBlank(task, toBlank(task, response)) : 'Без ответа'}</span></p>
            <p class="review-line is-right">${icon('check')}<span><small>Правильный ответ</small>${formatBlank(task, task.answer)}</span></p>
            <p class="review-why">${icon('bulb')}<span><small>Почему так</small>${escapeHTML(task.explanation)}</span></p>
          </div></details>`).join('')}</div>` : counted ? `<div class="perfect">${icon('trophy')}<p><strong>Ни одной ошибки.</strong> Так держать — бери следующий номер.</p></div>` : ''}
      </section>
      ${variant ? `<p class="scale-note">Шкала ${meta.year} года для всего экзамена: «3» — от ${meta.scale[3]}, «4» — от ${meta.scale[4]}, «5» — от ${meta.scale[5]} первичных баллов из ${meta.maxTotal}.</p>` : ''}</section>`;
    const { mode, n } = exam;
    main.querySelector('[data-retry]').addEventListener('click', () => startExam(mode, n));
    main.querySelector('[data-oge-hub]').addEventListener('click', () => showOgeHub());
    main.querySelector('[data-share]')?.addEventListener('click', event => shareResult(summary, event.currentTarget));
    announcer.textContent = `${timedOut ? 'Время вышло.' : 'Готово.'} Баллов: ${points} из ${max}.${counted ? ` Получено ${reward.gained} XP.` : ''}`;
    focusHeading();
    enter(main);
    if (counted && grade >= 4) celebrate();
  }

  // ============ Личный кабинет ============
  // Ник, аватар и прогресс живут только в localStorage этого браузера. Сайт их никуда не отправляет.
  const busy = () => screen === 'loading' || (session && !session.ended) || (exam && !exam.ended);

  function saveProfile(next) {
    profile = next;
    storage.set(PROFILE_KEY, profile);
    renderHeaderStats();
  }

  function cabinetTopicsHTML() {
    const done = catalog.filter(topic => progress.best[topic.id] !== undefined);
    if (!done.length) return '<p class="block-note">Пройди любую тему — здесь появится твой рекорд по ней.</p>';
    return `<ul class="topic-records">${done.map(topic => `<li>
        <span class="tr-title"><strong>${escapeHTML(topic.title)}</strong><small>${topic.grade} класс</small></span>
        <span class="tr-bar" aria-hidden="true"><span style="width:${progress.best[topic.id]}%"></span></span>
        <span class="tr-value">${progress.best[topic.id]}%</span></li>`).join('')}</ul>`;
  }

  function cabinetOgeHTML(meta) {
    const best = progress.best[EXAM_PROGRESS.variant];
    return `<section class="cabinet-block" aria-labelledby="cab-oge-title">
        <div class="block-head"><h2 id="cab-oge-title">Карта ОГЭ</h2>${best !== undefined ? `<span class="goal">${icon('trophy')} Вариант: ${best}%</span>` : ''}</div>
        <ol class="points-map" aria-label="Лучший результат по номерам заданий">${meta.numbers.map(({ n }) => {
          const record = progress.best[EXAM_PROGRESS.trainer(n)];
          const tone = record === undefined ? 'is-none' : record >= 85 ? 'is-full' : record >= 50 ? 'is-half' : 'is-zero';
          return `<li class="${tone}"><span class="pm-num">${n}</span><span class="pm-pts">${record === undefined ? '—' : `${record}%`}</span><span class="sr-only">${record === undefined ? ': ещё не решал' : ''}</span></li>`;
        }).join('')}</ol>
        <p class="block-note">Зелёные номера освоены, оранжевые и красные стоит повторить.</p>
        <button class="button secondary" type="button" data-oge-hub>${icon('target')} Тренажёр ОГЭ</button>
      </section>`;
  }

  async function showCabinet(moveFocus = true) {
    if (busy()) return;
    let meta = null;
    try { meta = (await loadOge()).meta; } catch (error) { console.error(error); }
    setScreen('cabinet');
    const today = localDay();
    const lvl = levelFromXP(progress.xp);
    const streak = currentDayStreak(progress, today);
    const week = lastDays(progress, today);
    const peak = Math.max(1, ...week.map(day => day.xp));
    const doneToday = (progress.activity[today] ?? 0) > 0;
    const collection = elementsUnlocked(progress.xp);
    const next = ELEMENTS[collection.count];
    main.innerHTML = `<section class="cabinet" aria-labelledby="cabinet-title">
      <button class="text-button back-link" type="button" data-home>${icon('arrowLeft')} Все темы</button>
      <div class="profile-card">
        <span class="avatar avatar-l" aria-hidden="true">${profile.avatar}</span>
        <div class="profile-main">
          <p class="chip chip-violet">${icon('star')} Уровень ${lvl.level} · ${rankFor(lvl.level)}</p>
          <h1 id="cabinet-title" tabindex="-1" data-focus>${profile.nick ? escapeHTML(profile.nick) : 'Мой кабинет'}</h1>
          <div class="xp-bar" role="progressbar" aria-label="Опыт до следующего уровня" aria-valuemin="${lvl.start}" aria-valuemax="${lvl.next}" aria-valuenow="${progress.xp}"><span style="width:${Math.round(lvl.progress * 100)}%"></span></div>
          <p class="xp-text">${progress.xp} XP · до уровня ${lvl.level + 1} ещё ${lvl.next - progress.xp}${lvl.level < 10 ? ` · дальше — «${rankFor(lvl.level + 1)}»` : ''}</p>
        </div>
        <button class="icon-button" type="button" data-edit-profile aria-expanded="false" aria-controls="profile-form" aria-label="Изменить ник и аватар">${icon('edit')}</button>
      </div>
      <form class="profile-form" id="profile-form" hidden novalidate>
        <label class="field-label" for="nick-input">Ник <small>необязательно</small></label>
        <input class="text-input" id="nick-input" name="nick" type="text" maxlength="${NICK_MAX}" autocomplete="off" spellcheck="false" value="${escapeHTML(profile.nick)}" placeholder="Например, Катализатор" aria-describedby="nick-hint">
        <p class="field-hint" id="nick-hint">Придумай ник. Не пиши настоящие имя и фамилию, телефон или почту — ник видишь только ты на этом устройстве.</p>
        <fieldset class="avatar-picker"><legend class="field-label">Аватар</legend>${AVATARS.map((avatar, i) => `<label class="avatar-option">
          <input type="radio" name="avatar" value="${avatar}" ${avatar === profile.avatar ? 'checked' : ''}><span aria-hidden="true">${avatar}</span><span class="sr-only">Вариант ${i + 1}</span></label>`).join('')}</fieldset>
        <div class="form-actions"><button class="button primary" type="submit">${icon('check')} Сохранить</button><button class="button secondary" type="button" data-cancel-profile>Отмена</button></div>
      </form>
      <dl class="cabinet-stats">
        <div><dt>Дней подряд</dt><dd>🔥 ${streak}</dd></div>
        <div><dt>Тестов</dt><dd>🧪 ${progress.tests}</dd></div>
        <div><dt>Серия ответов</dt><dd>⚡ ${progress.bestStreak}</dd></div>
        <div><dt>Бейджи</dt><dd>🏅 ${progress.badges.length}/${BADGES.length}</dd></div>
      </dl>
      <section class="cabinet-block" aria-labelledby="goal-title">
        <div class="block-head"><h2 id="goal-title">Цель дня</h2><span class="goal ${doneToday ? 'is-done' : ''}">${doneToday ? `${icon('check')} Выполнена` : 'Один тест или вариант'}</span></div>
        <ol class="week" aria-label="Опыт за последние 7 дней">${week.map(day => `<li class="${day.today ? 'is-today' : ''}${day.xp ? ' is-active' : ''}">
          <span class="week-xp" aria-hidden="true">${day.xp || ''}</span>
          <span class="week-bar" aria-hidden="true"><span style="height:${Math.round(day.xp / peak * 100)}%"></span></span>
          <span class="week-day">${day.today ? 'сег' : day.label}</span><span class="sr-only">: ${day.xp} XP</span></li>`).join('')}</ol>
        <p class="block-note">${streak ? `Серия: ${streak} ${plural(streak, DAYS)} подряд, лучшая — ${progress.bestDayStreak}. ${doneToday ? 'Завтра продолжим?' : 'Пройди тест сегодня, чтобы её не прервать.'}` : 'Пройди тест сегодня — начнётся серия дней.'}</p>
      </section>
      <section class="cabinet-block" aria-labelledby="collection-title">
        <div class="block-head"><h2 id="collection-title">Коллекция элементов</h2><span class="goal">${collection.count}/${ELEMENTS.length}</span></div>
        <ol class="ptable" aria-label="Открытые элементы">${ELEMENTS.map(el => {
          const open = el.z <= collection.count;
          const when = el.z === 1 ? 'после первого теста' : `с ${(el.z - 1) * XP_PER_ELEMENT} XP`;
          return `<li class="pt-cell${open ? ' is-open' : ''}" style="grid-column:${el.group};grid-row:${el.period}" title="${open ? `${el.z}. ${el.name}` : `${el.name}: откроется ${when}`}">
            <span class="pt-z" aria-hidden="true">${el.z}</span><span class="pt-sym" aria-hidden="true">${el.symbol}</span><span class="sr-only">${el.name}${open ? '' : ', закрыт'}</span></li>`;
        }).join('')}</ol>
        <p class="block-note">${next ? `За каждые ${XP_PER_ELEMENT} XP открывается новый элемент. Следующий — ${next.name} (${next.symbol}), ещё ${collection.toNext} XP.` : 'Все элементы первых четырёх периодов собраны. Ты настоящий химик!'}</p>
      </section>
      <section class="cabinet-block" aria-labelledby="badges-title">
        <div class="block-head"><h2 id="badges-title">Бейджи</h2><span class="goal">${progress.badges.length}/${BADGES.length}</span></div>
        <ul class="badges badge-grid">${BADGES.map(badge => {
          const got = progress.badges.includes(badge.id);
          return `<li class="badge ${got ? 'is-earned' : ''}"><span class="badge-emoji" aria-hidden="true">${got ? badge.emoji : '🔒'}</span><span class="badge-name">${badge.title}</span><span class="badge-hint">${badge.hint}</span><span class="sr-only">${got ? 'получен' : 'не получен'}</span></li>`;
        }).join('')}</ul>
      </section>
      ${meta ? cabinetOgeHTML(meta) : ''}
      <section class="cabinet-block" aria-labelledby="records-title">
        <h2 id="records-title">Рекорды по темам</h2>
        ${cabinetTopicsHTML()}
      </section>
      <section class="cabinet-block data-block" aria-labelledby="data-title">
        <h2 id="data-title">${icon('shield')} Мои данные</h2>
        <p>Ник, аватар и прогресс хранятся только в этом браузере. Мы их не получаем: на сайте нет регистрации, рекламы и счётчиков.</p>
        <div class="data-actions">
          <button class="button secondary" type="button" data-export>${icon('download')} Сохранить в файл</button>
          <button class="button secondary" type="button" data-import>${icon('upload')} Загрузить из файла</button>
          <button class="button danger" type="button" data-wipe>${icon('trash')} Удалить всё</button>
          <input type="file" id="import-file" accept=".json,application/json" hidden>
        </div>
        <p class="data-status" id="data-status" role="status"></p>
        <p class="block-note">Файл нужен, чтобы перенести прогресс на другое устройство. <button class="text-button inline-link" type="button" data-privacy>Как устроена конфиденциальность</button></p>
      </section>
    </section>`;
    bindCabinet();
    if (moveFocus) focusHeading();
    enter(main);
  }

  function bindCabinet() {
    const form = main.querySelector('#profile-form');
    const toggle = main.querySelector('[data-edit-profile]');
    const nick = form.querySelector('#nick-input');
    const hint = form.querySelector('#nick-hint');
    const status = main.querySelector('#data-status');
    const hintText = hint.textContent;
    const openForm = open => {
      form.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) nick.focus(); else toggle.focus();
    };
    main.querySelector('[data-home]').addEventListener('click', () => showHome(true));
    main.querySelector('[data-oge-hub]')?.addEventListener('click', () => showOgeHub());
    main.querySelector('[data-privacy]').addEventListener('click', () => showPrivacy());
    toggle.addEventListener('click', () => openForm(form.hidden));
    form.querySelector('[data-cancel-profile]').addEventListener('click', () => openForm(false));
    nick.addEventListener('input', () => { nick.removeAttribute('aria-invalid'); hint.textContent = hintText; hint.classList.remove('is-error'); });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const checked = checkNickname(nick.value);
      if (!checked.ok) {
        nick.setAttribute('aria-invalid', 'true');
        hint.textContent = checked.error;
        hint.classList.add('is-error');
        nick.focus();
        return;
      }
      saveProfile({ nick: checked.value, avatar: form.querySelector('[name=avatar]:checked')?.value ?? profile.avatar });
      showCabinet();
      announcer.textContent = 'Профиль сохранён на этом устройстве.';
    });
    main.querySelector('[data-export]').addEventListener('click', () => {
      const today = localDay();
      const blob = new Blob([JSON.stringify(exportData(progress, profile, today), null, 2)], { type: 'application/json' });
      const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `himtest-progress-${today}.json` });
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      status.textContent = 'Файл сохранён на устройство. Он только у тебя — сайт его не получает.';
    });
    const file = main.querySelector('#import-file');
    main.querySelector('[data-import]').addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const [picked] = file.files;
      file.value = '';
      if (!picked) return;
      try {
        if (picked.size > 200_000) throw new Error('Файл слишком большой для прогресса ХимТеста.');
        let data;
        try { data = JSON.parse(await picked.text()); } catch { throw new Error('Это не файл прогресса ХимТеста или он повреждён.'); }
        const imported = importData(data, emptyProgress(), BADGES.map(badge => badge.id));
        if (!confirm(`Заменить прогресс на этом устройстве? В файле: уровень ${levelFromXP(imported.progress.xp).level}, ${imported.progress.xp} XP, тестов: ${imported.progress.tests}.`)) return;
        progress = imported.progress;
        storage.set(PROGRESS_KEY, progress);
        saveProfile(imported.profile);
        await showCabinet();
        main.querySelector('#data-status').textContent = 'Прогресс загружен из файла.';
      } catch (error) {
        status.textContent = error.message;
      }
    });
    main.querySelector('[data-wipe]').addEventListener('click', () => {
      if (!confirm('Удалить уровень, XP, бейджи, рекорды, ник и аватар с этого устройства? Отменить нельзя. Если нужно, сначала сохрани прогресс в файл.')) return;
      progress = emptyProgress();
      profile = emptyProfile();
      storage.remove(PROGRESS_KEY);
      storage.remove(PROFILE_KEY);
      renderHeaderStats();
      showHome(true);
      announcer.textContent = 'Все данные удалены с этого устройства.';
    });
  }

  function showPrivacy() {
    if (busy()) return;
    const from = screen;
    setScreen('privacy');
    main.innerHTML = `<section class="privacy" aria-labelledby="privacy-title">
      <button class="text-button back-link" type="button" data-back>${icon('arrowLeft')} Назад</button>
      <h1 id="privacy-title" tabindex="-1" data-focus>Конфиденциальность</h1>
      <p class="hero-copy">Коротко: мы не собираем персональные данные. Всё, что ты делаешь на сайте, остаётся на твоём устройстве.</p>
      <div class="privacy-grid">
        <article class="cabinet-block"><h2>${icon('shield')} Что мы не собираем</h2>
          <p>Нет регистрации и входа. Мы не спрашиваем имя, фамилию, возраст, школу, телефон, почту и фото. На сайте нет рекламы, счётчиков посещений и аналитики, мы не ставим cookie.</p></article>
        <article class="cabinet-block"><h2>${icon('grid')} Что хранится на устройстве</h2>
          <p>Уровень, XP, бейджи, рекорды, серия дней, ник, аватар и выбранная тема оформления. Всё лежит в памяти браузера (localStorage) на этом устройстве и не отправляется на сервер — у сайта его просто нет.</p></article>
        <article class="cabinet-block"><h2>${icon('edit')} Ник</h2>
          <p>Ник необязателен и виден только тебе. Придумай его сам: не используй настоящие имя и фамилию, телефон или почту — сайт такие ники не примет.</p></article>
        <article class="cabinet-block"><h2>${icon('download')} Перенос и удаление</h2>
          <p>В кабинете можно сохранить прогресс в файл и загрузить его на другом устройстве. Файл остаётся у тебя. Кнопка «Удалить всё» стирает данные сайта из этого браузера; то же делает очистка данных сайта в настройках браузера.</p></article>
        <article class="cabinet-block"><h2>${icon('atom')} Хостинг и шрифты</h2>
          <p>Сайт размещён на GitHub Pages, шрифты загружаются с Google Fonts. Как любые серверы, они технически видят IP-адрес и тип браузера, когда открывается страница. Это их журналы по их правилам, у нас к ним доступа нет.</p></article>
      </div>
      <p class="block-note">Если в будущем появятся аккаунты или общий рейтинг, сначала обновим эту страницу и попросим согласия — для младше 14 лет согласие дают родители.</p>
    </section>`;
    main.querySelector('[data-back]').addEventListener('click', () => (from === 'cabinet' ? showCabinet() : showHome(true)));
    focusHeading();
    enter(main);
  }

  function showError(message) {
    main.innerHTML = `<div class="error-card" role="alert"><h1 style="font-size:2rem" tabindex="-1" data-focus>Лаборатория пока недоступна</h1><p>${escapeHTML(message)}</p><p>Если вы открыли index.html двойным щелчком, запустите локальный сервер по инструкции в README или откройте публичную ссылку.</p><button class="button primary" id="reload">Попробовать снова</button></div>`;
    main.querySelector('#reload').addEventListener('click', () => location.reload());
    focusHeading();
  }

  setupTheme();
  document.querySelector('#header-stats').addEventListener('click', event => { if (event.target.closest('[data-cabinet]')) showCabinet(); });
  document.querySelector('#privacy-link').addEventListener('click', () => showPrivacy());
  document.querySelector('#continue-test').addEventListener('click', () => dialog.close());
  document.querySelector('#confirm-finish').addEventListener('click', () => {
    if (exam && !exam.ended) finishExam();
    else finishTest(remainingSeconds(session.deadline) === 0);
  });
  document.addEventListener('visibilitychange', () => { updateTimer(); updateExamTimer(); });
  window.addEventListener('pageshow', () => { updateTimer(); updateExamTimer(); });
  window.addEventListener('beforeunload', event => {
    if ((session && !session.ended) || (exam && !exam.ended)) { event.preventDefault(); event.returnValue = ''; }
  });
  try {
    renderHeaderStats();
    catalog = await loadJSON('./data/topics.json');
    showHome();
  } catch (error) {
    console.error(error);
    showError('Не удалось загрузить список тем. Проверьте подключение и обновите страницу.');
  }
}
