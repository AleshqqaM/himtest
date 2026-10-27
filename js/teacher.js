// Страница учителя: собирает ссылку с планом ученика. Ничего не сохраняет и никуда не отправляет.
import { validateMaterials, encodePlan, parsePlan } from './kb.js';
import { localDay } from './cabinet.js';

const escapeHTML = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const loadJSON = async path => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
  return response.json();
};

const box = document.querySelector('#materials');
const form = document.querySelector('#plan-form');
const date = document.querySelector('#plan-date');
const output = document.querySelector('#plan-link');
const summary = document.querySelector('#summary');
const resultStatus = document.querySelector('#result-status');
const preview = document.querySelector('#preview');
const share = document.querySelector('#share');
const base = new URL('./', location.href);
let materials = [];

function render() {
  const grades = [...new Set(materials.map(m => m.grade))].sort((a, b) => a - b);
  box.innerHTML = `<section class="cabinet-block" aria-labelledby="next-none-title">
      <h2 id="next-none-title">Темы</h2>
      <p>«Пройдено» — что уже разобрали на занятиях. «Следующая» — одна тема, с которой ученику начать.</p>
      <label class="teacher-none"><input type="radio" name="next" value="" checked> Следующую тему не задавать</label>
    </section>
    ${grades.map(grade => `<fieldset class="cabinet-block teacher-grade">
      <legend>${grade} класс</legend>
      <ul class="teacher-list">${materials.filter(m => m.grade === grade).map(m => `<li>
        <span class="teacher-title">${escapeHTML(m.title)}</span>
        <label class="teacher-check"><input type="checkbox" name="done" value="${m.id}"> Пройдено</label>
        <label class="teacher-check"><input type="radio" name="next" value="${m.id}"> Следующая</label>
      </li>`).join('')}</ul>
    </fieldset>`).join('')}`;
}

function current() {
  const done = [...form.querySelectorAll('[name=done]:checked')].map(input => input.value);
  const next = form.querySelector('[name=next]:checked')?.value || null;
  return { done, next, date: date.value || null };
}

function update() {
  const plan = current();
  const link = new URL(encodePlan(plan), base).href;
  output.value = link;
  preview.href = link;
  const nextTitle = materials.find(m => m.id === plan.next)?.title;
  summary.textContent = `Пройдено: ${plan.done.length}${nextTitle ? ` · дальше: ${nextTitle}` : ''}`;
  resultStatus.textContent = '';
}

function apply(plan) {
  form.querySelectorAll('[name=done]').forEach(input => { input.checked = plan.done.includes(input.value); });
  const next = form.querySelector(`[name=next][value="${plan.next ?? ''}"]`) ?? form.querySelector('[name=next][value=""]');
  next.checked = true;
  if (plan.date) date.value = plan.date;
  update();
}

form.addEventListener('change', event => {
  const input = event.target;
  // Пройденная тема не может быть следующей.
  if (input.name === 'done' && input.checked && form.querySelector(`[name=next][value="${input.value}"]`).checked) {
    form.querySelector('[name=next][value=""]').checked = true;
  }
  if (input.name === 'next' && input.value) form.querySelector(`[name=done][value="${input.value}"]`).checked = false;
  update();
});

document.querySelector('#load-form').addEventListener('submit', event => {
  event.preventDefault();
  const status = document.querySelector('#load-status');
  const raw = document.querySelector('#old-link').value.trim();
  try {
    const plan = parsePlan(raw.includes('#') ? raw.slice(raw.indexOf('#')) : '');
    if (!plan) throw new Error('В ссылке нет плана: она должна содержать #plan=…');
    const known = new Set(materials.map(m => m.id));
    const missing = [...plan.done, plan.next].filter(id => id && !known.has(id)).length;
    apply(plan);
    status.textContent = missing ? `Подставлено. Тем, которых больше нет на сайте: ${missing} — они убраны.` : 'Подставлено. Отметьте новые темы и скопируйте ссылку.';
  } catch (error) {
    status.textContent = error.message;
  }
});

document.querySelector('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    resultStatus.textContent = 'Ссылка скопирована. Отправьте её ученику в мессенджере.';
  } catch {
    output.select();
    resultStatus.textContent = 'Не удалось скопировать автоматически — ссылка выделена, скопируйте её вручную.';
  }
});

if (navigator.share) {
  share.hidden = false;
  share.addEventListener('click', () => navigator.share({ title: 'План по химии', url: output.value }).catch(() => {}));
}

date.addEventListener('input', update);

try {
  const catalog = await loadJSON('./data/topics.json');
  materials = validateMaterials(await loadJSON('./content/materials.json'), catalog.map(topic => topic.id));
  date.value = localDay();
  render();
  update();
} catch (error) {
  console.error(error);
  box.innerHTML = `<div class="error-card" role="alert"><p>${escapeHTML(error.message)}</p></div>`;
}
