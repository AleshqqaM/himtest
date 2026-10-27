// Личный кабинет: чистые функции. Всё считается и хранится только на этом устройстве —
// никаких аккаунтов, серверов и персональных данных. Интерфейс — в app.js.

// Звание по уровню: с 10-го уровня — «Академик».
export const RANKS = ['Стажёр', 'Лаборант', 'Юный химик', 'Экспериментатор', 'Аналитик', 'Технолог', 'Учёный', 'Доцент', 'Профессор', 'Академик'];
export const rankFor = level => RANKS[Math.min(level, RANKS.length) - 1];

// Коллекция: первые четыре периода таблицы Менделеева, новый элемент за каждые 100 XP.
export const XP_PER_ELEMENT = 100;
const NAMES = ['Водород', 'Гелий', 'Литий', 'Бериллий', 'Бор', 'Углерод', 'Азот', 'Кислород', 'Фтор', 'Неон',
  'Натрий', 'Магний', 'Алюминий', 'Кремний', 'Фосфор', 'Сера', 'Хлор', 'Аргон',
  'Калий', 'Кальций', 'Скандий', 'Титан', 'Ванадий', 'Хром', 'Марганец', 'Железо', 'Кобальт', 'Никель', 'Медь', 'Цинк', 'Галлий', 'Германий', 'Мышьяк', 'Селен', 'Бром', 'Криптон'];
const SYMBOLS = 'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr'.split(' ');
const GROUPS = [1, 18, 1, 2, 13, 14, 15, 16, 17, 18, 1, 2, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
export const ELEMENTS = SYMBOLS.map((symbol, i) => ({
  z: i + 1, symbol, name: NAMES[i], group: GROUPS[i], period: i < 2 ? 1 : i < 10 ? 2 : i < 18 ? 3 : 4,
}));

export function elementsUnlocked(xp) {
  const count = xp > 0 ? Math.min(ELEMENTS.length, Math.floor(xp / XP_PER_ELEMENT) + 1) : 0;
  const toNext = count === ELEMENTS.length ? 0 : xp > 0 ? count * XP_PER_ELEMENT - xp : 1;
  return { count, toNext };
}

// Дни считаем по местному времени устройства: «ГГГГ-ММ-ДД».
export function localDay(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const utc = day => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const dayDiff = (from, to) => Math.round((utc(to) - utc(from)) / 86400000);

export const ACTIVITY_DAYS = 30;

// Серия дней: занимался вчера — серия растёт, пропустил день — начинается заново.
export function applyDay(progress, day, gained) {
  const gap = progress.lastDay ? dayDiff(progress.lastDay, day) : null;
  const dayStreak = gap !== null && gap <= 0 ? progress.dayStreak : gap === 1 ? progress.dayStreak + 1 : 1;
  const activity = { ...progress.activity, [day]: (progress.activity[day] ?? 0) + gained };
  for (const key of Object.keys(activity)) if (dayDiff(key, day) >= ACTIVITY_DAYS) delete activity[key];
  return {
    dayStreak, bestDayStreak: Math.max(progress.bestDayStreak, dayStreak),
    lastDay: gap !== null && gap < 0 ? progress.lastDay : day, activity,
  };
}

// Серия жива, пока последний день занятий — сегодня или вчера.
export const currentDayStreak = (progress, today) =>
  progress.lastDay && dayDiff(progress.lastDay, today) <= 1 ? progress.dayStreak : 0;

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
export function lastDays(progress, today, count = 7) {
  const [y, m, d] = today.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(y, m - 1, d - (count - 1 - i));
    const day = localDay(date);
    return { day, xp: progress.activity[day] ?? 0, label: WEEKDAYS[date.getDay()], today: day === today };
  });
}

// Профиль — только ник и картинка из набора. Фото, имя, школа и контакты не нужны.
export const AVATARS = ['⚗️', '🧪', '🔬', '🧬', '⚛️', '🧲', '💎', '🔥', '🌋', '🧊', '🍋', '🦉'];
export const NICK_MAX = 20;
export const emptyProfile = () => ({ nick: '', avatar: AVATARS[0] });

export function checkNickname(raw) {
  const value = String(raw).replace(/\s+/g, ' ').trim();
  if (!value) return { ok: true, value };
  if (value.length > NICK_MAX) return { ok: false, value, error: `Не длиннее ${NICK_MAX} символов.` };
  if (/@|https?:|www\./i.test(value) || /\d{4,}/.test(value.replace(/[ .\-]/g, ''))) {
    return { ok: false, value, error: 'Без почты, телефонов и номеров — только придуманный ник.' };
  }
  if (!/^[\p{L}\p{N} _.\-]+$/u.test(value)) return { ok: false, value, error: 'Только буквы, цифры, пробел, точка, дефис и подчёркивание.' };
  if (/^[А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+/.test(value)) return { ok: false, value, error: 'Похоже на имя и фамилию. Придумай ник — так безопаснее.' };
  return { ok: true, value };
}

export function normalizeProfile(raw) {
  const nick = checkNickname(raw?.nick ?? '');
  return { nick: nick.ok ? nick.value : '', avatar: AVATARS.includes(raw?.avatar) ? raw.avatar : AVATARS[0] };
}

// Файл переноса: прогресс уходит туда, куда его сохранит сам ученик, — сайт ничего не отправляет.
export const EXPORT_APP = 'himtest';
export const EXPORT_VERSION = 1;

export const exportData = (progress, profile, day) =>
  ({ app: EXPORT_APP, version: EXPORT_VERSION, exported: day, profile, progress });

export function importData(data, base, badgeIds) {
  const fail = () => { throw new Error('Это не файл прогресса ХимТеста или он повреждён.'); };
  if (!data || data.app !== EXPORT_APP || data.version !== EXPORT_VERSION) fail();
  const raw = data.progress;
  if (!raw || typeof raw !== 'object') fail();
  const count = value => Number.isInteger(value) && value >= 0 && value <= 1e7;
  const plain = value => value && typeof value === 'object' && !Array.isArray(value);
  const progress = { ...base };
  for (const key of ['xp', 'tests', 'bestStreak', 'dayStreak', 'bestDayStreak']) {
    if (raw[key] === undefined) continue;
    if (!count(raw[key])) fail();
    progress[key] = raw[key];
  }
  if (raw.best !== undefined) {
    if (!plain(raw.best) || !Object.entries(raw.best).every(([id, value]) => /^[\w-]{1,60}$/.test(id) && count(value) && value <= 100)) fail();
    progress.best = { ...raw.best };
  }
  if (raw.badges !== undefined) {
    if (!Array.isArray(raw.badges)) fail();
    progress.badges = [...new Set(raw.badges.filter(id => badgeIds.includes(id)))];
  }
  if (raw.grades !== undefined) {
    if (!Array.isArray(raw.grades) || !raw.grades.every(grade => Number.isInteger(grade) && grade >= 6 && grade <= 11)) fail();
    progress.grades = [...new Set(raw.grades)].sort((a, b) => a - b);
  }
  if (raw.lastDay !== undefined && raw.lastDay !== null) {
    if (typeof raw.lastDay !== 'string' || !DAY_RE.test(raw.lastDay)) fail();
    progress.lastDay = raw.lastDay;
  }
  if (raw.activity !== undefined) {
    if (!plain(raw.activity) || !Object.entries(raw.activity).every(([day, xp]) => DAY_RE.test(day) && count(xp))) fail();
    progress.activity = { ...raw.activity };
  }
  return { progress, profile: normalizeProfile(data.profile) };
}
