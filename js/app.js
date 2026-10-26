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

  function showHome(moveFocus = false) {
    screen = 'home';
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
      <ol class="steps" aria-label="Как это работает">
        <li><span class="step-num">1</span><span><strong>Класс</strong>выбери свой</span></li>
        <li><span class="step-num">2</span><span><strong>Тема</strong>что повторим</span></li>
        <li><span class="step-num">3</span><span><strong>20 минут</strong>и сразу разбор</span></li>
      </ol>
      <section class="choose" aria-labelledby="choose-title">
        <h2 id="choose-title" class="section-title">Что изучим сегодня?</h2>
        <div class="grade-tabs" role="group" aria-label="Выбери класс">${[6,7,8,9,10,11].map(grade => `<button class="grade-tab" type="button" data-grade="${grade}" aria-pressed="${grade === selectedGrade}" aria-label="${grade} класс">${grade}<small>класс</small></button>`).join('')}</div>
        <div class="topic-list" id="topics">${topics.map((topic, i) => topic.file ? `
          <article class="topic tone-${i % 4}">
            <div class="topic-head"><span class="topic-icon">${icon(TOPIC_ICONS[topic.id])}</span><span class="topic-tag">Тема ${i + 1}</span></div>
            <h3>${escapeHTML(topic.title)}</h3>
            <p class="topic-description">${escapeHTML(topic.description)}</p>
            <p class="topic-meta"><span>${icon('grid')} ${Math.min(20, topic.count)} из ${topic.count}</span><span>${icon('clock')} 20 мин</span></p>
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
        startedAt, deadline: startedAt + TEST_SECONDS * 1000, ended: false, warned: false };
      lastTopic = topic.id;
      screen = 'quiz';
      announcer.textContent = 'Тест начался. На ответы есть 20 минут.';
      showQuestion();
      clearInterval(timerId);
      timerId = setInterval(updateTimer, 250);
      updateTimer();
    } catch (error) {
      screen = 'error';
      console.error(error);
      showError('Не удалось открыть тему. Проверьте подключение и попробуйте ещё раз.');
    }
  }

  function showQuestion() {
    if (!session || session.ended) return;
    if (remainingSeconds(session.deadline) === 0) { finishTest(true); return; }
    const { questions, answers, index, topic } = session;
    const question = questions[index];
    const answered = answers.filter(answer => answer !== null).length;
    main.innerHTML = `<section class="quiz-shell" aria-label="Тест по химии">
      <div class="quiz-bar"><span class="quiz-topic">${topic.grade} класс / ${escapeHTML(topic.title)}</span><div class="timer" role="timer" aria-live="off" aria-label="Осталось времени"><span aria-hidden="true">◷ </span><span id="time-value">${formatTime(remainingSeconds(session.deadline))}</span></div></div>
      <div class="progress-info"><span>Вопрос ${index + 1} из ${questions.length}</span><span id="answered-count">Отвечено: ${answered} из ${questions.length}</span></div>
      <progress max="${questions.length}" value="${answered}" aria-label="Количество отвеченных вопросов"></progress>
      <div class="question-card"><fieldset aria-describedby="question-help"><legend tabindex="-1" data-focus>${escapeHTML(question.text)}</legend><div class="options">${question.options.map((option, i) => `<label class="option"><input type="radio" name="answer" value="${i}" ${answers[index] === i ? 'checked' : ''} aria-label="${escapeHTML(option)}"><span>${escapeHTML(option)}</span></label>`).join('')}</div></fieldset>
      <p class="question-help" id="question-help">Один правильный ответ. Можно вернуться и изменить выбор.</p></div>
      <nav class="quiz-nav" aria-label="Навигация по вопросам"><button class="button secondary" id="previous" ${index === 0 ? 'disabled' : ''}>← Назад</button><button class="button primary" id="next">${index === questions.length - 1 ? 'Завершить тест' : 'Далее →'}</button></nav>
      <div class="finish-row"><button class="text-button" id="finish">Завершить досрочно</button></div></section>`;
    main.querySelectorAll('input[name="answer"]').forEach(input => input.addEventListener('change', () => {
      // После сна вкладки сперва проверяем реальное время, а не число тиков.
      if (remainingSeconds(session.deadline) === 0) { finishTest(true); return; }
      session.answers[session.index] = Number(input.value);
      const count = session.answers.filter(answer => answer !== null).length;
      main.querySelector('#answered-count').textContent = `Отвечено: ${count} из ${questions.length}`;
      main.querySelector('progress').value = count;
    }));
    main.querySelector('#previous').addEventListener('click', () => { session.index--; showQuestion(); });
    main.querySelector('#next').addEventListener('click', () => {
      if (session.index === questions.length - 1) askFinish();
      else { session.index++; showQuestion(); }
    });
    main.querySelector('#finish').addEventListener('click', askFinish);
    updateTimer();
    focusHeading();
  }

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
    screen = 'result';
    clearInterval(timerId);
    if (dialog.open) dialog.close();
    const elapsed = timedOut ? TEST_SECONDS : Math.min(TEST_SECONDS, Math.floor((Date.now() - session.startedAt) / 1000));
    const result = calculateResult(session.questions, session.answers);
    const mistakes = session.questions.map((q, i) => ({ q, answer: session.answers[i], number: i + 1 }))
      .filter(({ q, answer }) => answer !== q.correctIndex);
    main.innerHTML = `<section class="result-shell"><div class="result-card"><p class="eyebrow">${escapeHTML(session.topic.title)}</p>
      <h1 tabindex="-1" data-focus>${timedOut ? 'Время вышло' : 'Тест завершён'}</h1><p>${result.grade === 5 ? 'Отличная работа! Продолжай исследовать химию.' : 'Каждый вопрос — шаг к пониманию. Посмотрим, что можно закрепить.'}</p>
      <div class="score">${result.correct} <small>из ${result.total}</small></div>
      <div class="result-stats"><div><strong>${result.percent}%</strong><span>правильных ответов</span></div><div><strong>${result.grade}</strong><span>оценка из 5</span></div><div><strong>${formatTime(elapsed)}</strong><span>затраченное время</span></div></div>
      <div class="result-actions"><button class="button primary" data-retry>Пройти заново ↗</button><button class="button secondary" data-home>Другая тема</button></div></div>
      <div class="review-heading"><h2>Разберёмся вместе <span class="pill">${mistakes.length}</span></h2><p>${mistakes.length ? 'Все ошибки и пропущенные вопросы — с объяснениями.' : 'Все ответы верны. В этом тесте разбирать ошибки не придётся!'}</p></div>
      ${mistakes.map(({ q, answer, number }) => `<article class="review-card"><p class="review-label">Вопрос ${number} · ${answer === null ? 'Без ответа' : 'Есть над чем поработать'}</p><h3>${escapeHTML(q.text)}</h3><p class="answer-line wrong-answer"><strong>Твой ответ:</strong> ${answer === null ? 'Ответ не выбран' : escapeHTML(q.options[answer])}</p><p class="answer-line right-answer"><strong>Правильный ответ:</strong> ${escapeHTML(q.options[q.correctIndex])}</p><p class="explanation">${escapeHTML(q.explanation)}</p></article>`).join('')}
      <p class="question-help">Тренировочная шкала: «5» — от 85%, «4» — от 65%, «3» — от 45%, «2» — ниже 45%.</p></section>`;
    main.querySelector('[data-retry]').addEventListener('click', () => startTest(lastTopic));
    main.querySelector('[data-home]').addEventListener('click', () => { session = null; showHome(true); });
    announcer.textContent = `${timedOut ? 'Время вышло.' : 'Тест завершён.'} Правильных ответов: ${result.correct} из ${result.total}. Оценка: ${result.grade}.`;
    focusHeading();
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
    catalog = await loadJSON('./data/topics.json');
    showHome();
  } catch (error) {
    console.error(error);
    showError('Не удалось загрузить список тем. Проверьте подключение и обновите страницу.');
  }
}
