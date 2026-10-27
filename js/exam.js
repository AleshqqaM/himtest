// Режим ОГЭ: чистые функции проверки ответов. Интерфейс — в app.js.
// Ответ хранится так, как его пишут в бланк: строка цифр («24», «145») или число («10,3»).
import { shuffle } from './app.js';

export const EXAM_TYPES = ['multi', 'match', 'order', 'number'];
export const MATCH_LETTERS = ['А', 'Б', 'В', 'Г'];

// Ответ ученика внутри сессии: multi — выбранные номера, match — номер на каждую строку,
// order — номера в выбранном порядке, number — введённая строка.
export function emptyResponse(task) {
  if (task.type === 'match') return Array(task.rows.length).fill(null);
  if (task.type === 'number') return '';
  return [];
}

export function isComplete(task, response) {
  if (task.type === 'multi') return response.length === task.pick;
  if (task.type === 'match') return response.every(value => value !== null);
  if (task.type === 'order') return response.length === task.items.length;
  return parseNumber(response) !== null;
}

export function isStarted(task, response) {
  if (task.type === 'match') return response.some(value => value !== null);
  return response.length > 0;
}

export function parseNumber(value) {
  const text = String(value).trim().replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
}

// Как ответ выглядит в бланке. В «2 из 5» порядок не важен, поэтому сортируем.
export function toBlank(task, response) {
  if (task.type === 'number') return String(response).trim();
  if (task.type === 'multi') return [...response].sort((a, b) => a - b).join('');
  return response.map(value => value ?? '·').join('');
}

export const formatBlank = (task, blank) => task.type === 'number' ? blank.replace('.', ',') : blank;

// Баллы как на экзамене: задание на 2 балла с одной ошибкой даёт 1 балл.
export function scoreTask(task, response) {
  if (!isComplete(task, response)) return 0;
  if (task.type === 'number') return Math.abs(parseNumber(response) - parseNumber(task.answer)) < 1e-9 ? task.points : 0;
  const blank = toBlank(task, response);
  if (task.type === 'multi') return blank === [...task.answer].sort().join('') ? task.points : 0;
  if (task.type === 'order') return blank === task.answer ? task.points : 0;
  const errors = [...task.answer].filter((digit, i) => blank[i] !== digit).length;
  return errors === 0 ? task.points : errors === 1 && task.points === 2 ? 1 : 0;
}

export function examGrade(points, scale) {
  return points >= scale[5] ? 5 : points >= scale[4] ? 4 : points >= scale[3] ? 3 : 2;
}

// Вариант: по одному заданию на каждый номер, по порядку номеров.
export function prepareVariant(bank, numbers, random = Math.random) {
  return numbers.map(({ n }) => shuffle(bank.filter(task => task.n === n), random)[0]);
}

export function validateExamBank(bank, meta) {
  if (!Array.isArray(bank) || bank.length === 0) throw new Error('Банк заданий ОГЭ пуст.');
  const ids = new Set();
  const fail = task => { throw new Error(`Некорректное задание ОГЭ: ${task?.id ?? '?'}`); };
  const filled = list => Array.isArray(list) && list.length > 0 && list.every(item => typeof item === 'string' && item.trim());
  const digits = (answer, max) => typeof answer === 'string' && [...answer].every(d => /\d/.test(d) && d >= '1' && Number(d) <= max);
  for (const task of bank) {
    const number = meta.numbers.find(item => item.n === task?.n);
    if (!task || typeof task.id !== 'string' || !task.id.trim() || ids.has(task.id) || !number ||
      task.type !== number.type || task.points !== number.points || !EXAM_TYPES.includes(task.type) ||
      typeof task.text !== 'string' || !task.text.trim() ||
      typeof task.explanation !== 'string' || !task.explanation.trim() || typeof task.answer !== 'string') fail(task);
    if (task.type === 'multi' && !(filled(task.options) && new Set(task.options).size === task.options.length &&
      Number.isInteger(task.pick) && task.answer.length === task.pick && new Set(task.answer).size === task.pick &&
      digits(task.answer, task.options.length))) fail(task);
    if (task.type === 'match') {
      const choices = task.options ? task.options.length : task.choices;
      if (!(filled(task.rows) && task.rows.length <= MATCH_LETTERS.length && Number.isInteger(choices) && choices <= 9 &&
        (!task.options || filled(task.options)) && task.answer.length === task.rows.length && digits(task.answer, choices))) fail(task);
    }
    if (task.type === 'order' && !(filled(task.items) && task.answer.length === task.items.length &&
      new Set(task.answer).size === task.items.length && digits(task.answer, task.items.length))) fail(task);
    if (task.type === 'number' && parseNumber(task.answer) === null) fail(task);
    ids.add(task.id);
  }
  for (const { n } of meta.numbers) if (!bank.some(task => task.n === n)) throw new Error(`Нет заданий для номера ${n}.`);
  return bank;
}
