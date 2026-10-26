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
      <section class="hero" aria-labelledby="home-title">
        <div><p class="eyebrow"><span class="status-dot"></span> Твоя маленькая лаборатория знаний</p>
          <h1 id="home-title" tabindex="-1" data-focus>Химия становится<br><span>понятнее.</span></h1>
          <p class="hero-copy">От первых открытий до сложных реакций. Выбирай тему, проверяй себя и разбирайся в том, что пока не получилось.</p>
          <div class="micro-tags"><span>20 вопросов</span><span>20 минут</span><span>С понятным разбором</span></div>
        </div>
        <aside class="lab-card" aria-label="Молекула воды H₂O: два атома водорода и один атом кислорода">
          <div class="lab-card-top"><span>МАЛЕНЬКОЕ ОТКРЫТИЕ № 01</span><span>↗</span></div>
          <div class="molecule" aria-hidden="true"><i class="bond"></i><i class="bond second"></i><span class="atom central">O</span><span class="atom h1">H</span><span class="atom h2">H</span></div>
          <div class="lab-card-bottom"><div><strong>Всё начинается<br>с любопытства.</strong><span>Даже знакомая вода — это химия.</span></div><span class="formula" aria-hidden="true">H₂O</span></div>
        </aside>
      </section>
      <section aria-labelledby="choose-title"><div class="section-head"><h2 id="choose-title">Что изучим сегодня?</h2><p>Сначала класс, потом тема</p></div>
        <div class="grade-picker" role="group" aria-label="Выберите класс">${[6,7,8,9,10,11].map(grade => `<button class="grade-button" data-grade="${grade}" aria-pressed="${grade === selectedGrade}" aria-label="${grade} класс">${grade}<span class="grade-word"> класс</span></button>`).join('')}</div>
        <div class="topics-grid" id="topics">${topics.map((topic, i) => topic.file ? `
          <article class="topic-card"><div class="topic-top"><span class="topic-icon" aria-hidden="true">${escapeHTML(topic.icon)}</span><span class="topic-number">ТЕМА / ${String(i + 1).padStart(2, '0')}</span></div>
          <h3>${escapeHTML(topic.title)}</h3><p class="topic-description">${escapeHTML(topic.description)}</p>
          <div class="topic-meta"><span>${Math.min(20, topic.count)} вопросов из ${topic.count}</span><span>◷ 20 минут</span></div>
          <button class="button primary" data-start="${escapeHTML(topic.id)}" aria-label="Начать тест: ${escapeHTML(topic.title)}">Начать тест <span aria-hidden="true">↗</span></button></article>` : '').join('') || `<div class="empty-state"><h3>Этот класс — следующий шаг</h3><p>Банк вопросов для этого класса пока пополняется. Здесь появятся:</p><ul>${topics.map(topic => `<li>${escapeHTML(topic.title)}</li>`).join('')}</ul></div>`}</div>
      </section>
      <aside class="learning-note"><span aria-hidden="true">✧</span><p><strong>Ошибаться — часть обучения.</strong> После теста покажем правильные ответы и объясним почему. Это тренировка, а не контрольная.<br>Тем в тренажёре: ${catalog.filter(item => item.file).length}. Перед публикацией вопросы нужно проверить учителю химии.</p></aside>`;
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
