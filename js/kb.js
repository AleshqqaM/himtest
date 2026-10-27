// База знаний и план ученика: чистые функции. Материалы лежат в content/, план приходит ссылкой
// от учителя и хранится только на устройстве ученика. Интерфейс — в app.js.

import { applyDay } from './cabinet.js';

export const MATERIAL_ID_RE = /^[a-z0-9-]{1,60}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const GRADES = [6, 7, 8, 9, 10, 11];

// Каталог content/materials.json: порядок записей внутри класса — порядок курса.
export function validateMaterials(list, testIds = []) {
  if (!Array.isArray(list)) throw new Error('Каталог материалов должен быть списком.');
  const ids = new Set();
  list.forEach((m, i) => {
    const where = `Материал №${i + 1}${m?.id ? ` (${m.id})` : ''}`;
    if (!m || typeof m.id !== 'string' || !MATERIAL_ID_RE.test(m.id)) throw new Error(`${where}: id — только латиница в нижнем регистре, цифры и дефис.`);
    if (ids.has(m.id)) throw new Error(`${where}: такой id уже есть.`);
    if (!GRADES.includes(m.grade)) throw new Error(`${where}: класс должен быть числом от 6 до 11.`);
    if (typeof m.title !== 'string' || !m.title.trim()) throw new Error(`${where}: нет названия.`);
    if (typeof m.summary !== 'string' || !m.summary.trim()) throw new Error(`${where}: нет краткого описания.`);
    if (m.file !== `./content/materials/${m.id}.md`) throw new Error(`${where}: файл должен называться ./content/materials/${m.id}.md`);
    if (m.test !== undefined && !testIds.includes(m.test)) throw new Error(`${where}: тест «${m.test}» не найден в data/topics.json.`);
    if (m.minutes !== undefined && !(Number.isInteger(m.minutes) && m.minutes > 0 && m.minutes <= 180)) throw new Error(`${where}: minutes — целое число минут от 1 до 180.`);
    ids.add(m.id);
  });
  return list;
}

// «Прочитано»: отметка ставится один раз и даёт немного опыта, серия дней тоже засчитывается.
export const READ_XP = 10;

export function applyRead(progress, id, day) {
  if (progress.read.includes(id)) return { progress, gained: 0 };
  return { gained: READ_XP, progress: { ...progress, xp: progress.xp + READ_XP, read: [...progress.read, id], ...applyDay(progress, day, READ_XP) } };
}

// Следующая тема по порядку курса, если учитель не задал свою.
export const nextInCourse = (materials, doneIds, grade) =>
  materials.find(m => m.grade === grade && !doneIds.includes(m.id)) ?? null;

// Markdown для учителя: заголовки ## и ###, абзацы, списки, цитата-«запомни», **жирный**, *курсив*,
// H~2~O — нижний индекс, Fe^3+^ — верхний, ссылки и картинки из content/. Любой HTML выводится как текст.
const escapeHTML = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const SAFE_LINK = /^(https:\/\/[^\s&]+|\.\/[\w./-]+|#[\w-]+)$/;
const SAFE_IMAGE = /^\.\/content\/images\/[\w.-]+\.(png|jpe?g|webp|svg|gif)$/i;

function inline(text) {
  return escapeHTML(text)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (all, alt, src) =>
      SAFE_IMAGE.test(src) ? `<img src="${src}" alt="${alt}" loading="lazy">` : alt)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, label, href) =>
      SAFE_LINK.test(href) ? `<a href="${href}"${href.startsWith('https:') ? ' target="_blank" rel="noopener"' : ''}>${label}</a>` : label)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~([^~\s]{1,12})~/g, '<sub>$1</sub>')
    .replace(/\^([^^\s]{1,12})\^/g, '<sup>$1</sup>');
}

export function renderMarkdown(source) {
  const out = [];
  let paragraph = [];
  let list = null;
  let quote = [];
  const flush = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(' '))}</p>`);
    if (list) out.push(`<${list.tag}>${list.items.map(item => `<li>${inline(item)}</li>`).join('')}</${list.tag}>`);
    if (quote.length) out.push(`<aside class="kb-note">${inline(quote.join(' '))}</aside>`);
    paragraph = []; list = null; quote = [];
  };
  for (const raw of String(source).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    let match;
    if (!line) flush();
    else if ((match = line.match(/^(#{1,3})\s+(.+)$/))) {
      flush();
      const level = match[1].length === 3 ? 3 : 2;
      out.push(`<h${level}>${inline(match[2])}</h${level}>`);
    } else if ((match = line.match(/^(?:[-*]|(\d+)\.)\s+(.+)$/))) {
      const tag = match[1] ? 'ol' : 'ul';
      if (!list || list.tag !== tag) { flush(); list = { tag, items: [] }; }
      list.items.push(match[2]);
    } else if ((match = line.match(/^>\s?(.*)$/))) {
      if (!quote.length) flush();
      quote.push(match[1]);
    } else {
      if (list || quote.length) flush();
      paragraph.push(line);
    }
  }
  flush();
  return out.join('\n');
}

// План ученика в ссылке: …/#plan=1&date=ГГГГ-ММ-ДД&done=id,id&next=id.
// Всё после # браузер не отправляет на сервер; имени ученика в ссылке нет.
export const PLAN_VERSION = '1';
export const PLAN_MAX = 200;

export function encodePlan({ done = [], next = null, date = null }) {
  const plan = normalizePlan({ done, next, date });
  const parts = [`plan=${PLAN_VERSION}`];
  if (plan.date) parts.push(`date=${plan.date}`);
  if (plan.done.length) parts.push(`done=${plan.done.join(',')}`);
  if (plan.next) parts.push(`next=${plan.next}`);
  return `#${parts.join('&')}`;
}

// null — в адресе нет плана; исключение — план есть, но испорчен.
export function parsePlan(hash) {
  const params = new URLSearchParams(String(hash).replace(/^#/, ''));
  if (!params.has('plan')) return null;
  if (params.get('plan') !== PLAN_VERSION) throw new Error('Ссылка на план устарела или повреждена. Попроси учителя прислать новую.');
  const done = params.get('done') ? params.get('done').split(',') : [];
  return normalizePlan({ done, next: params.get('next') || null, date: params.get('date') || null });
}

export function normalizePlan(raw) {
  const fail = () => { throw new Error('Ссылка на план повреждена. Попроси учителя прислать новую.'); };
  if (!raw || !Array.isArray(raw.done) || raw.done.length > PLAN_MAX) fail();
  if (!raw.done.every(id => typeof id === 'string' && MATERIAL_ID_RE.test(id))) fail();
  if (raw.next !== null && raw.next !== undefined && !(typeof raw.next === 'string' && MATERIAL_ID_RE.test(raw.next))) fail();
  if (raw.date !== null && raw.date !== undefined && !(typeof raw.date === 'string' && DAY_RE.test(raw.date))) fail();
  const done = [...new Set(raw.done)];
  const next = raw.next && !done.includes(raw.next) ? raw.next : null;
  return { done, next, date: raw.date ?? null };
}

// Сопоставляем план с каталогом: темы, которых уже нет на сайте, не ломают кабинет.
export function resolvePlan(plan, materials) {
  const byId = new Map(materials.map(m => [m.id, m]));
  const ids = [...plan.done, ...(plan.next ? [plan.next] : [])];
  return {
    date: plan.date,
    done: plan.done.map(id => byId.get(id)).filter(Boolean),
    next: plan.next ? byId.get(plan.next) ?? null : null,
    unknown: ids.filter(id => !byId.has(id)),
  };
}
