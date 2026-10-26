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
  const ratio = total ? correct / total : 0;
  const grade = ratio >= .85 ? 5 : ratio >= .65 ? 4 : ratio >= .45 ? 3 : 2;
  return { correct, total, percent, grade };
}

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
];

export const emptyProgress = () => ({ xp: 0, tests: 0, bestStreak: 0, best: {}, badges: [], grades: [] });

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

export function applyTest(previous, summary) {
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
  };
  const earned = {
    first: true,
    streak5: summary.bestStreak >= 5,
    streak10: summary.bestStreak >= 10,
    excellent: summary.grade === 5,
    perfect: summary.total > 0 && summary.correct === summary.total,
    explorer: Object.keys(next.best).length >= 3,
    allGrades: next.grades.length >= 6,
  };
  const newBadges = BADGES.filter(badge => earned[badge.id] && !next.badges.includes(badge.id));
  next.badges.push(...newBadges.map(badge => badge.id));
  return { progress: next, gained, newBadges, levelUp: levelFromXP(next.xp).level > before,
    newRecord: record !== undefined && summary.percent > record };
}

// localStorage может быть недоступен (приватный режим, запрет сайта), поэтому всё через try.
export const storage = {
  get(key, fallback = null) {
    try { const raw = localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* прогресс просто не сохранится */ }
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
};
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
  const PROGRESS_KEY = 'himtest-progress';
  let progress = { ...emptyProgress(), ...storage.get(PROGRESS_KEY, {}) };

  function renderHeaderStats() {
    const { level } = levelFromXP(progress.xp);
    document.querySelector('#header-stats').innerHTML = progress.tests
      ? `<span class="level-chip" title="${progress.xp} XP">${icon('star')} Ур. ${level}</span>` : '';
  }

  function progressPanelHTML() {
    if (!progress.tests) return `<ol class="steps" aria-label="Как это работает">
        <li><span class="step-num">1</span><span><strong>Класс</strong>выбери свой</span></li>
        <li><span class="step-num">2</span><span><strong>Тема</strong>что повторим</span></li>
        <li><span class="step-num">3</span><span><strong>20 минут</strong>и сразу разбор</span></li>
      </ol>`;
    const lvl = levelFromXP(progress.xp);
    return `<section class="progress-panel" aria-labelledby="progress-title">
        <div class="level-row">
          <span class="level-badge" aria-hidden="true">${lvl.level}</span>
          <div class="level-info"><h2 id="progress-title">Уровень ${lvl.level}</h2>
            <div class="xp-bar" role="progressbar" aria-label="Опыт до следующего уровня" aria-valuemin="${lvl.start}" aria-valuemax="${lvl.next}" aria-valuenow="${progress.xp}"><span style="width:${Math.round(lvl.progress * 100)}%"></span></div>
            <p class="xp-text">${progress.xp} XP · до уровня ${lvl.level + 1} ещё ${lvl.next - progress.xp}</p></div>
        </div>
        <dl class="mini-stats"><div><dt>Тестов</dt><dd>${progress.tests}</dd></div><div><dt>Рекорд серии</dt><dd>🔥 ${progress.bestStreak}</dd></div><div><dt>Бейджи</dt><dd>${progress.badges.length}/${BADGES.length}</dd></div></dl>
        <ul class="badges" aria-label="Бейджи">${BADGES.map(badge => {
          const got = progress.badges.includes(badge.id);
          return `<li class="badge ${got ? 'is-earned' : ''}" title="${badge.hint}"><span class="badge-emoji" aria-hidden="true">${got ? badge.emoji : '🔒'}</span><span class="badge-name">${badge.title}</span><span class="sr-only">${got ? 'получен' : `не получен: ${badge.hint}`}</span></li>`;
        }).join('')}</ul>
        <button class="text-button reset-progress" type="button" id="reset-progress">Сбросить прогресс</button>
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

  function showHome(moveFocus = false) {
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
      showHome();
      main.querySelector(`[data-grade="${selectedGrade}"]`).focus({ preventScroll: true });
      const available = catalog.filter(topic => topic.grade === selectedGrade && topic.file).length;
      announcer.textContent = `${selectedGrade} класс. Доступно тем: ${available}.`;
    }));
    main.querySelectorAll('[data-start]').forEach(button => button.addEventListener('click', () => startTest(button.dataset.start)));
    main.querySelector('#reset-progress')?.addEventListener('click', () => {
      if (!confirm('Сбросить уровень, XP, бейджи и рекорды на этом устройстве?')) return;
      progress = emptyProgress();
      storage.set(PROGRESS_KEY, progress);
      renderHeaderStats();
      showHome(true);
      announcer.textContent = 'Прогресс сброшен.';
    });
    if (moveFocus) focusHeading();
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

  function showError(message) {
    main.innerHTML = `<div class="error-card" role="alert"><h1 style="font-size:2rem" tabindex="-1" data-focus>Лаборатория пока недоступна</h1><p>${escapeHTML(message)}</p><p>Если вы открыли index.html двойным щелчком, запустите локальный сервер по инструкции в README или откройте публичную ссылку.</p><button class="button primary" id="reload">Попробовать снова</button></div>`;
    main.querySelector('#reload').addEventListener('click', () => location.reload());
    focusHeading();
  }

  setupTheme();
  document.querySelector('#continue-test').addEventListener('click', () => dialog.close());
  document.querySelector('#confirm-finish').addEventListener('click', () => finishTest(remainingSeconds(session.deadline) === 0));
  document.addEventListener('visibilitychange', updateTimer);
  window.addEventListener('pageshow', updateTimer);
  window.addEventListener('beforeunload', event => {
    if (session && !session.ended) { event.preventDefault(); event.returnValue = ''; }
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
