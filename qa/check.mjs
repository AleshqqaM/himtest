import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareQuestions, validateBank, calculateResult, formatTime, remainingSeconds, shuffle, TEST_SECONDS } from '../js/app.js';
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
console.log(`OK: ${count} вопросов; ${runs} случайных тестов; правильные ответы после перемешивания; пропуски; границы оценок; короткий банк; расчёт таймера.`);
