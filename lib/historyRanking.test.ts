import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { rankHistoryDays, type HistoryDayRecord } from './historyRanking.ts';

function day(date: string, overrides: Partial<HistoryDayRecord> = {}): HistoryDayRecord {
  return {
    date,
    completed: [],
    exerciseNotes: [],
    health: null,
    session: null,
    ...overrides,
  };
}

function rank(records: HistoryDayRecord[], question: string, overrides: Partial<Parameters<typeof rankHistoryDays>[1]> = {}) {
  return rankHistoryDays(records, {
    question,
    today: '2026-07-14',
    limit: 8,
    ...overrides,
  });
}

test('weights an exact symptom phrase in an exercise note above a generic health match', () => {
  const results = rank([
    day('2026-06-02', {
      exerciseNotes: [{ exerciseId: 'calf', exercise: 'Calf Raise', note: 'Sharp burning under my heel after the second set.' }],
    }),
    day('2026-06-10', { health: { generalNote: 'Some ordinary heel pain today.', pain: 3 } }),
  ], 'When did I write that I had burning under my heel?');

  assert.equal(results[0].date, '2026-06-02');
  assert(results[0].evidence.some(item => /exercise notes|Exact phrase/.test(item)));
});

test('uses deterministic symptom and anatomy synonyms', () => {
  const results = rank([
    day('2026-05-04', { health: { generalNote: 'Tingling along the plantar sole in the evening.' } }),
    day('2026-05-05', { health: { generalNote: 'Ankle felt tired but otherwise normal.' } }),
  ], 'Which day had pins and needles in my foot?');

  assert.equal(results[0].date, '2026-05-04');
  assert(results[0].evidence.some(item => item.startsWith('Related term')));
});

test('recovers a plausible day from a misspelled symptom', () => {
  const results = rank([
    day('2026-04-08', { health: { generalNote: 'Burning under the heel after walking.' } }),
    day('2026-04-09', { health: { generalNote: 'Energy was normal.' } }),
  ], 'When did I mention burnng?');

  assert.equal(results[0].date, '2026-04-08');
  assert(results[0].evidence.some(item => item.startsWith('Fuzzy match')));
});

test('resolves the day after the most recent PT session as an event relationship', () => {
  const results = rank([
    day('2026-05-01', { session: { kind: 'pt', note: 'Manual therapy.' } }),
    day('2026-05-02', { health: { generalNote: 'Older follow-up day.' } }),
    day('2026-06-20', { session: { kind: 'pt', note: 'Worked on balance.' } }),
    day('2026-06-21', { health: { generalNote: 'Ankle was tired the following morning.' } }),
  ], 'What did I log the day after my most recent PT session?');

  assert.equal(results[0].date, '2026-06-21');
  assert(results[0].evidence.includes('Day after PT on 2026-06-20'));
});

test('uses numeric health values for highest-metric questions', () => {
  const results = rank([
    day('2026-03-01', { health: { pain: 8, generalNote: 'Difficult day.' } }),
    day('2026-06-01', { health: { pain: 3, generalNote: 'Manageable day.' } }),
    day('2026-07-01', { health: { pain: 5, generalNote: 'Moderate day.' } }),
  ], 'Which day had my highest pain?');

  assert.equal(results[0].date, '2026-03-01');
  assert(results[0].evidence.includes('pain was 8'));
});

test('interprets best and worst according to the selected metric', () => {
  const records = [
    day('2026-03-01', { health: { pain: 8, sleepQuality: 2 } }),
    day('2026-03-02', { health: { pain: 2, sleepQuality: 8 } }),
  ];

  assert.equal(rank(records, 'Which day had my worst pain?')[0].date, '2026-03-01');
  assert.equal(rank(records, 'Which day had my worst sleep quality?')[0].date, '2026-03-01');
  assert.equal(rank(records, 'Which day had my best sleep quality?')[0].date, '2026-03-02');
});

test('supports before-session relationships', () => {
  const results = rank([
    day('2026-06-19', { health: { generalNote: 'Ankle was already irritated.' } }),
    day('2026-06-20', { session: { kind: 'pt', note: 'Balance session.' } }),
    day('2026-06-21', { health: { generalNote: 'Ankle settled down.' } }),
  ], 'What did I log the day before PT?');

  assert.equal(results[0].date, '2026-06-19');
  assert(results[0].evidence.includes('Day before PT on 2026-06-20'));
});

test('honors earliest and latest ordering after relevance filtering', () => {
  const records = [
    day('2026-02-01', { health: { generalNote: 'Swelling around the ankle.' } }),
    day('2026-05-01', { health: { generalNote: 'Swelling returned briefly.' } }),
    day('2026-06-01', { health: { generalNote: 'No symptoms noted.' } }),
  ];

  assert.equal(rank(records, 'When did I first mention swelling?')[0].date, '2026-02-01');
  assert.equal(rank(records, 'What was the most recent time I mentioned swelling?')[0].date, '2026-05-01');
});

test('always prioritizes an explicitly referenced saved date', () => {
  const results = rank([
    day('2026-01-10', { health: { generalNote: 'No matching words.' } }),
    day('2026-06-15', { health: { generalNote: 'Burning and swelling.' } }),
  ], 'What happened on January 10?', { explicitDates: ['2026-01-10'] });

  assert.equal(results[0].date, '2026-01-10');
  assert(results[0].evidence.includes('Explicitly referenced date'));
});

test('does not pad the result set with unrelated days', () => {
  const results = rank([
    day('2026-01-01', { health: { generalNote: 'Slept well.' } }),
    day('2026-01-02', { health: { generalNote: 'Burning under heel.' } }),
    day('2026-01-03', { completed: ['Calf Raise'] }),
  ], 'When did I mention burning?');

  assert.deepEqual(results.map(result => result.date), ['2026-01-02']);
});
