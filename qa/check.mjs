import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareQuestions, validateBank, calculateResult, formatTime, remainingSeconds, shuffle, TEST_SECONDS, levelFromXP, xpForTest, applyTest, emptyProgress, BADGES } from '../js/app.js';
import { validateExamBank, prepareVariant, scoreTask, toBlank, isComplete, emptyResponse, examGrade } from '../js/exam.js';
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
assert.equal(BADGES.length, 7);
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
console.log(`OK: ${count} вопросов; ${runs} случайных тестов; правильные ответы после перемешивания; пропуски; границы оценок; короткий банк; расчёт таймера; XP, уровни и бейджи; ОГЭ: ${ogeBank.length} заданий, ${examRuns} вариантов, частичные баллы.`);
