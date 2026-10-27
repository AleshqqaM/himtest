import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { prepareQuestions, validateBank, calculateResult, formatTime, remainingSeconds, shuffle, TEST_SECONDS, levelFromXP, xpForTest, applyTest, emptyProgress, BADGES, OGE_VARIANT_ID } from '../js/app.js';
import { rankFor, ELEMENTS, elementsUnlocked, localDay, dayDiff, applyDay, currentDayStreak, lastDays, checkNickname, normalizeProfile, exportData, importData, AVATARS, ACTIVITY_DAYS } from '../js/cabinet.js';
import { validateExamBank, prepareVariant, scoreTask, toBlank, isComplete, emptyResponse, examGrade } from '../js/exam.js';
import { validateMaterials, renderMarkdown, nextInCourse, encodePlan, parsePlan, resolvePlan, applyRead, READ_XP } from '../js/kb.js';
const root = new URL('../', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('data/topics.json', root)));
let count = 0;
let runs = 0;
const globalIds = new Set();
assert.equal(new Set(catalog.map(topic => topic.id)).size, catalog.length);
for (const grade of [6, 7, 8, 9, 10, 11]) {
  assert.ok(catalog.filter(topic => topic.grade === grade && topic.file).length >= 2);
}
for (const topic of catalog.filter(t => t.file)) {
  const bank = JSON.parse(await readFile(new URL(topic.file, root)));
  validateBank(bank, topic);
  assert.equal(bank.length, topic.count);
  assert.ok(bank.length >= 25);
  count += bank.length;
  assert.equal(new Set(bank.map(q => q.text)).size, bank.length);
  for (const question of bank) {
    assert.ok(!globalIds.has(question.id));
    globalIds.add(question.id);
  }
  const seenOrders = new Set();
  const answerPositions = new Set();
  for (let run = 0; run < 50; run++) {
    runs++;
    const prepared = prepareQuestions(bank);
    assert.equal(prepared.length, 20);
    assert.equal(new Set(prepared.map(q => q.id)).size, 20);
    seenOrders.add(prepared.map(q => q.id).join(','));
    for (const q of prepared) {
      const original = bank.find(item => item.id === q.id);
      assert.equal(q.options[q.correctIndex], original.options[original.correctIndex]);
      assert.deepEqual([...q.options].sort(), [...original.options].sort());
      answerPositions.add(q.correctIndex);
    }
    const answers = prepared.map(q => q.correctIndex);
    assert.deepEqual(calculateResult(prepared, answers), {correct:20,total:20,percent:100,grade:5});
    const skipped = calculateResult(prepared, Array(20).fill(null));
    assert.deepEqual(skipped, {correct:0,total:20,percent:0,grade:2});
  }
  assert.ok(seenOrders.size > 1);
  assert.equal(answerPositions.size, 4);
  assert.equal(prepareQuestions(bank.slice(0, 3)).length, 3);
  assert.throws(() => validateBank([{...bank[0],correctIndex:4}], topic));
  assert.throws(() => validateBank([bank[0],bank[0]], topic));
  const q = Array.from({length:20}, () => ({correctIndex:0}));
  for (const [right, grade] of [[0,2],[8,2],[9,3],[12,3],[13,4],[16,4],[17,5],[20,5]]) {
    assert.equal(calculateResult(q, q.map((_,i) => i < right ? 0 : 1)).grade, grade);
  }
}
const original = [1,2,3,4];
shuffle(original);
assert.deepEqual(original, [1,2,3,4]);
assert.equal(TEST_SECONDS, 1200);
assert.equal(formatTime(1200), '20:00');
assert.equal(formatTime(119), '01:59');
assert.equal(formatTime(-3), '00:00');
assert.equal(remainingSeconds(1200000, 0), 1200);
assert.equal(remainingSeconds(1200000, 1080000), 120);
assert.equal(remainingSeconds(1200000, 1200000), 0);
assert.equal(remainingSeconds(1200000, 2000000), 0);
// Геймификация: XP, уровни, бейджи, рекорды.
assert.deepEqual([0, 99, 100, 299, 300, 1000].map(xp => levelFromXP(xp).level), [1, 1, 2, 2, 3, 5]);
assert.equal(levelFromXP(150).progress, .25);
assert.equal(xpForTest({ correct: 0, total: 20, grade: 2 }, 0), 10);
assert.equal(xpForTest({ correct: 20, total: 20, grade: 5 }, 20), 200 + 10 + 20 + 30 + 50);
const base = { correct: 12, total: 20, percent: 60, grade: 3, bestStreak: 5, topicId: 't1', schoolClass: 6 };
let step = applyTest(emptyProgress(), base);
assert.deepEqual(step.newBadges.map(b => b.id), ['first', 'streak5']);
assert.equal(step.newRecord, false);
assert.equal(step.progress.best.t1, 60);
step = applyTest(step.progress, { ...base, correct: 20, percent: 100, grade: 5, bestStreak: 10 });
assert.deepEqual(step.newBadges.map(b => b.id), ['streak10', 'excellent', 'perfect']);
assert.equal(step.newRecord, true);
step = applyTest(step.progress, { ...base, percent: 50 });
assert.equal(step.newRecord, false);
assert.equal(step.progress.best.t1, 100);
assert.equal(step.newBadges.length, 0);
for (const [topicId, schoolClass] of [['t2', 7], ['t3', 8], ['t4', 9], ['t5', 10], ['t6', 11]]) step = applyTest(step.progress, { ...base, topicId, schoolClass });
assert.ok(step.progress.badges.includes('explorer') && step.progress.badges.includes('allGrades'));
assert.equal(new Set(step.progress.badges).size, step.progress.badges.length);
assert.equal(BADGES.length, 13);
assert.equal(new Set(BADGES.map(b => b.id)).size, BADGES.length);
// Личный кабинет: серия дней, коллекция, звания, ник, перенос.
assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
assert.equal(dayDiff('2026-02-28', '2026-03-01'), 1);
assert.equal(dayDiff('2026-12-31', '2027-01-01'), 1);
let days = applyTest(emptyProgress(), base, '2026-10-01');
assert.equal(days.progress.dayStreak, 1);
assert.equal(days.dayStreakUp, false);
days = applyTest(days.progress, base, '2026-10-01');
assert.equal(days.progress.dayStreak, 1);
assert.equal(days.progress.activity['2026-10-01'], 2 * xpForTest(base, base.bestStreak));
days = applyTest(days.progress, base, '2026-10-02');
assert.equal(days.dayStreakUp, true);
days = applyTest(days.progress, base, '2026-10-03');
assert.equal(days.progress.dayStreak, 3);
assert.ok(days.newBadges.some(b => b.id === 'days3'));
assert.equal(currentDayStreak(days.progress, '2026-10-04'), 3);
assert.equal(currentDayStreak(days.progress, '2026-10-05'), 0);
days = applyTest(days.progress, base, '2026-10-05');
assert.equal(days.progress.dayStreak, 1);
assert.equal(days.progress.bestDayStreak, 3);
// Часы на устройстве ушли назад — серия не ломается.
assert.equal(applyDay(days.progress, '2026-10-01', 5).dayStreak, 1);
assert.equal(applyDay(days.progress, '2026-10-01', 5).lastDay, '2026-10-05');
assert.ok(Object.keys(applyDay(days.progress, '2026-12-01', 5).activity).every(day => dayDiff(day, '2026-12-01') < ACTIVITY_DAYS));
const week = lastDays(days.progress, '2026-10-05');
assert.deepEqual(week.map(d => d.day), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
assert.equal(week[6].today, true);
assert.equal(week[5].xp, 0);
const ogeRun = applyTest(emptyProgress(), { ...base, topicId: OGE_VARIANT_ID, correct: 21, total: 24, schoolClass: 9 }, '2026-10-01');
assert.deepEqual(ogeRun.newBadges.map(b => b.id).filter(id => id.startsWith('oge')), ['ogeVariant', 'oge20']);
let many = { progress: emptyProgress() };
for (let i = 0; i < 10; i++) many = applyTest(many.progress, { ...base, correct: 20, percent: 100, grade: 5 }, '2026-10-01');
assert.ok(many.progress.badges.includes('tests10') && many.progress.badges.includes('level5'));
assert.equal(ELEMENTS.length, 36);
assert.deepEqual([ELEMENTS[0].symbol, ELEMENTS[25].symbol, ELEMENTS[35].group, ELEMENTS[20].period], ['H', 'Fe', 18, 4]);
assert.equal(new Set(ELEMENTS.map(el => `${el.period}:${el.group}`)).size, 36);
assert.deepEqual([0, 1, 99, 100, 250, 3500, 99999].map(xp => elementsUnlocked(xp).count), [0, 1, 1, 2, 3, 36, 36]);
assert.deepEqual([0, 30, 100, 99999].map(xp => elementsUnlocked(xp).toNext), [1, 70, 100, 0]);
assert.deepEqual([1, 5, 10, 25].map(rankFor), ['Стажёр', 'Аналитик', 'Академик', 'Академик']);
for (const ok of ['', 'Катализатор', 'Mendeleev_2', 'Юный химик', 'маша']) assert.ok(checkNickname(ok).ok, ok);
for (const bad of ['Иван Петров', 'a@b.ru', '+7 900 123-45-67', 'x'.repeat(21), '<script>', 'www.site.ru']) assert.ok(!checkNickname(bad).ok, bad);
assert.equal(checkNickname('  Нео   Химик ').value, 'Нео Химик');
assert.deepEqual(normalizeProfile({ nick: 'Иван Петров', avatar: '💀' }), { nick: '', avatar: AVATARS[0] });
const saved = exportData(many.progress, { nick: 'Нео', avatar: AVATARS[3] }, '2026-10-01');
const restored = importData(JSON.parse(JSON.stringify(saved)), emptyProgress(), BADGES.map(b => b.id));
assert.deepEqual(restored.progress, { ...emptyProgress(), ...many.progress });
assert.deepEqual(restored.profile, { nick: 'Нео', avatar: AVATARS[3] });
assert.deepEqual(importData({ ...saved, progress: { ...saved.progress, badges: ['first', 'hacker'] } }, emptyProgress(), BADGES.map(b => b.id)).progress.badges, ['first']);
for (const broken of [null, {}, { ...saved, app: 'other' }, { ...saved, progress: { xp: -5 } }, { ...saved, progress: { best: { t1: 140 } } }, { ...saved, progress: { lastDay: 'вчера' } }, { ...saved, progress: { grades: [3] } }]) {
  assert.throws(() => importData(broken, emptyProgress(), BADGES.map(b => b.id)));
}
// Режим ОГЭ: банк, вариант, баллы.
const meta = JSON.parse(await readFile(new URL('data/oge/meta.json', root)));
const ogeBank = validateExamBank(JSON.parse(await readFile(new URL(meta.bank, root))), meta);
assert.equal(meta.numbers.reduce((sum, item) => sum + item.points, 0), 24);
assert.equal(new Set(ogeBank.map(task => task.text + JSON.stringify(task.options ?? task.items ?? task.rows))).size, ogeBank.length);
for (const { n } of meta.numbers) assert.ok(ogeBank.filter(task => task.n === n).length >= 3, `мало заданий №${n}`);
// Правильный ответ, собранный «как в интерфейсе», даёт полный балл.
const solve = task => task.type === 'number' ? task.answer.replace('.', ',')
  : [...task.answer].map(Number);
for (const task of ogeBank) {
  const right = solve(task);
  assert.ok(isComplete(task, right), task.id);
  assert.equal(scoreTask(task, right), task.points, task.id);
  assert.equal(scoreTask(task, emptyResponse(task)), 0);
  if (task.type === 'multi') assert.equal(scoreTask(task, [...right].reverse()), task.points);
  if (task.type === 'match' && task.points === 2) {
    const choices = task.options ? task.options.length : task.choices;
    const oneOff = [...right]; oneOff[0] = oneOff[0] % choices + 1;
    assert.equal(scoreTask(task, oneOff), 1, task.id);
    const twoOff = [...oneOff]; twoOff[1] = twoOff[1] % choices + 1;
    assert.equal(scoreTask(task, twoOff), 0, task.id);
  }
}
assert.equal(toBlank(ogeBank.find(t => t.type === 'multi'), [5, 2]), '25');
let examRuns = 0;
for (let run = 0; run < 200; run++, examRuns++) {
  const variant = prepareVariant(ogeBank, meta.numbers);
  assert.deepEqual(variant.map(task => task.n), meta.numbers.map(item => item.n));
  assert.equal(variant.reduce((sum, task) => sum + scoreTask(task, solve(task)), 0), 24);
}
assert.deepEqual([0, 9, 10, 20, 21, 24, 30, 31, 38].map(points => examGrade(points, meta.scale)), [2, 2, 3, 3, 4, 4, 4, 5, 5]);
assert.throws(() => validateExamBank([{ ...ogeBank[0], answer: '29' }], meta));
assert.throws(() => validateExamBank(ogeBank.filter(task => task.n !== 7), meta));
// База знаний: каталог, Markdown, план ученика.
const materials = validateMaterials(JSON.parse(await readFile(new URL('content/materials.json', root))), catalog.map(t => t.id));
const mdFiles = (await readdir(new URL('content/materials/', root))).filter(name => name.endsWith('.md')).sort();
assert.deepEqual(mdFiles, materials.map(m => `${m.id}.md`).sort(), 'каждый материал в каталоге и каждый .md в content/materials/ — пара');
for (const m of materials) {
  const html = renderMarkdown(await readFile(new URL(m.file, root), 'utf8'));
  assert.ok(html.includes('<h2>') && !/<script|on\w+=/i.test(html), m.id);
}
assert.throws(() => validateMaterials([{ ...materials[0], id: 'Bad Id' }], []));
assert.throws(() => validateMaterials([materials[0], materials[0]], catalog.map(t => t.id)));
assert.throws(() => validateMaterials([{ ...materials[0], test: 'nope' }], catalog.map(t => t.id)));
assert.throws(() => validateMaterials([{ ...materials[0], file: './content/materials/other.md' }], catalog.map(t => t.id)));
assert.equal(renderMarkdown('## H~2~O и Fe^3+^'), '<h2>H<sub>2</sub>O и Fe<sup>3+</sup></h2>');
assert.equal(renderMarkdown('- a\n- **b**\n\n1. c'), '<ul><li>a</li><li><strong>b</strong></li></ul>\n<ol><li>c</li></ol>');
assert.equal(renderMarkdown('> Запомни\n> это\nтекст'), '<aside class="kb-note">Запомни это</aside>\n<p>текст</p>');
assert.equal(renderMarkdown('<img src=x onerror=alert(1)>'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
assert.equal(renderMarkdown('[x](javascript:alert(1))'), '<p>x)</p>');
assert.equal(renderMarkdown('[x](https://ya.ru")'), '<p>x</p>');
assert.equal(renderMarkdown('![схема](https://evil.example/a.png)'), '<p>схема</p>');
assert.equal(renderMarkdown('![схема](./content/images/a.png)'), '<p><img src="./content/images/a.png" alt="схема" loading="lazy"></p>');
assert.equal(renderMarkdown('[учебник](https://example.org/a)'), '<p><a href="https://example.org/a" target="_blank" rel="noopener">учебник</a></p>');
assert.equal(nextInCourse(materials, [], 8)?.id, 'g8-oxides');
assert.equal(nextInCourse(materials, ['g8-oxides'], 8)?.id, 'g8-acids');
assert.equal(nextInCourse(materials, [], 6), null);
const hash = encodePlan({ done: ['g8-oxides', 'g8-oxides'], next: 'g8-acids', date: '2026-10-27' });
assert.equal(hash, '#plan=1&date=2026-10-27&done=g8-oxides&next=g8-acids');
assert.deepEqual(parsePlan(hash), { done: ['g8-oxides'], next: 'g8-acids', date: '2026-10-27' });
assert.equal(parsePlan(''), null);
assert.equal(parsePlan('#top'), null);
assert.deepEqual(parsePlan('#plan=1'), { done: [], next: null, date: null });
assert.deepEqual(parsePlan('#plan=1&done=a&next=a'), { done: ['a'], next: null, date: null });
for (const broken of ['#plan=2', '#plan=1&done=A', '#plan=1&next=<x>', '#plan=1&date=27.10', `#plan=1&done=${Array.from({ length: 201 }, (_, i) => `t${i}`).join(',')}`]) {
  assert.throws(() => parsePlan(broken), broken);
}
assert.deepEqual(resolvePlan(parsePlan('#plan=1&done=g8-oxides,gone&next=g8-acids'), materials),
  { date: null, done: [materials[0]], next: materials[1], unknown: ['gone'] });
// «Прочитано»: опыт один раз, серия дней, отметки переживают тест и перенос файлом.
let reading = applyRead(emptyProgress(), 'g8-oxides', '2026-10-27');
assert.equal(reading.gained, READ_XP);
assert.deepEqual([reading.progress.xp, reading.progress.read, reading.progress.dayStreak, reading.progress.lastDay], [READ_XP, ['g8-oxides'], 1, '2026-10-27']);
assert.equal(applyRead(reading.progress, 'g8-oxides', '2026-10-27').gained, 0);
reading = applyTest(reading.progress, base, '2026-10-28');
assert.deepEqual(reading.progress.read, ['g8-oxides']);
const movedRead = importData(JSON.parse(JSON.stringify(exportData(reading.progress, { nick: '', avatar: AVATARS[0] }, '2026-10-28'))), emptyProgress(), BADGES.map(b => b.id));
assert.deepEqual(movedRead.progress.read, ['g8-oxides']);
assert.throws(() => importData({ ...exportData(reading.progress, { nick: '', avatar: AVATARS[0] }, '2026-10-28'), progress: { read: ['<x>'] } }, emptyProgress(), []));
console.log(`OK: ${count} вопросов; ${runs} случайных тестов; правильные ответы после перемешивания; пропуски; границы оценок; короткий банк; расчёт таймера; XP, уровни и бейджи; кабинет: серия дней, коллекция, ник, перенос; ОГЭ: ${ogeBank.length} заданий, ${examRuns} вариантов, частичные баллы; база знаний: ${materials.length} материала, Markdown без HTML, план-ссылка.`);
