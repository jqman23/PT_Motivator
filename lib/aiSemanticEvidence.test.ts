import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error Node's type-stripping test runner requires the explicit extension.
import { buildSemanticNoteSources, chunkSemanticNoteSources, explicitSemanticCategoryPlan, filterSemanticNoteSourcesForQuestion, mergeSemanticCategoryPlans, normalizeEvidenceBackedSemanticVisualizations, normalizeSemanticCategoryPlan, visualizationFromSemanticCategoryPlan } from './aiSemanticEvidence.ts';

const records = [{
  date: '2026-07-15', completed: [], exerciseNotes: [], session: null,
  health: { painNote: 'Sharp big joint pain, then big joint burning. Small joint was calm.', generalNote: 'Big joint again.' },
}];

test('builds field-level sources without mixing provenance', () => {
  const sources = buildSemanticNoteSources(records);
  assert.equal(sources.length, 2);
  assert.deepEqual(sources.map(source => source.source), ['Pain note', 'General note']);
  assert.equal(chunkSemanticNoteSources(sources, 30).length, 2);
  assert.deepEqual(filterSemanticNoteSourcesForQuestion(sources, 'Use only my pain notes').map(source => source.source), ['Pain note']);
  assert.deepEqual(filterSemanticNoteSourcesForQuestion(sources, 'Use pain and general notes').map(source => source.source), ['Pain note', 'General note']);
});

test('recomputes semantic counts from verified exact matches and exposes evidence', () => {
  const sources = buildSemanticNoteSources(records);
  const visuals = normalizeEvidenceBackedSemanticVisualizations([{
    id: 'counts', type: 'table', title: 'Joint mentions', columns: ['Joint', 'Mentions'],
    rows: [['Primary joint', 999], ['Secondary joint', 999]],
    drilldowns: [
      { label: 'Primary joint', items: [
        { sourceId: sources[0].id, excerpt: sources[0].text, match: 'big joint' },
        { sourceId: sources[1].id, excerpt: sources[1].text, match: 'Big joint' },
      ] },
      { label: 'Secondary joint', items: [{ sourceId: sources[0].id, excerpt: sources[0].text, match: 'Small joint' }] },
    ],
  }], sources, { expectedCategoryCount: 2 });

  assert.equal(visuals.length, 1);
  assert.deepEqual(visuals[0].type === 'table' ? visuals[0].rows : [], [['Primary joint', '3'], ['Secondary joint', '1']]);
  assert.equal(visuals[0].drilldowns?.[0].items[0].date, '2026-07-15');
});

test('rejects fabricated excerpts and the wrong requested category cardinality', () => {
  const sources = buildSemanticNoteSources(records);
  const raw = [{
    type: 'table', title: 'Counts', columns: ['Category', 'Mentions'], rows: [['Only one', 4]],
    drilldowns: [{ label: 'Only one', items: [{ sourceId: sources[0].id, excerpt: 'not in the saved note', match: 'not' }] }],
  }];
  assert.deepEqual(normalizeEvidenceBackedSemanticVisualizations(raw, sources), []);
  assert.deepEqual(normalizeEvidenceBackedSemanticVisualizations(raw, sources, { expectedCategoryCount: 2 }), []);
});

test('prevents nested alias matches from being double counted across categories', () => {
  const sources = buildSemanticNoteSources(records);
  const visuals = normalizeEvidenceBackedSemanticVisualizations([{
    type: 'table', title: 'Counts', columns: ['Category', 'Mentions'], rows: [['Specific', 0], ['Generic', 0]],
    drilldowns: [
      { label: 'Specific', items: [{ sourceId: sources[0].id, excerpt: sources[0].text, match: 'big joint' }] },
      { label: 'Generic', items: [{ sourceId: sources[0].id, excerpt: sources[0].text, match: 'joint' }] },
    ],
  }], sources);
  assert.deepEqual(visuals[0].type === 'table' ? visuals[0].rows : [], [['Specific', '2'], ['Generic', '1']]);
});

test('turns a compact terminology plan into exact auditable counts', () => {
  const sources = buildSemanticNoteSources(records);
  const plan = normalizeSemanticCategoryPlan({ semanticPlan: {
    title: 'Joint wording frequency',
    categories: [
      { label: 'Primary joint', aliases: ['big joint', 'Big joint', 'invented wording'] },
      { label: 'Secondary joint', aliases: ['Small joint'] },
    ],
  } }, sources, 2);
  assert.ok(plan);
  assert.deepEqual(plan.categories.map(category => category.aliases), [['big joint'], ['Small joint']]);
  const visuals = visualizationFromSemanticCategoryPlan(plan, sources);
  assert.deepEqual(visuals[0].type === 'table' ? visuals[0].rows : [], [['Primary joint', '3'], ['Secondary joint', '1']]);
  assert.equal(visuals[0].drilldowns?.[0].items.length, 2);
  assert.equal(visuals[0].drilldowns?.[0].items.reduce((sum, item) => sum + (item.count ?? 1), 0), 3);
});

test('rejects the wrong category count and merges chunk vocabularies by stable labels', () => {
  const sources = buildSemanticNoteSources(records);
  assert.equal(normalizeSemanticCategoryPlan({ semanticPlan: { categories: [{ label: 'Only', aliases: [] }] } }, sources, 2), null);
  const merged = mergeSemanticCategoryPlans([
    { title: 'Counts', categories: [{ label: 'Group A', aliases: ['alpha'] }, { label: 'Group B', aliases: [] }] },
    { title: 'Counts', categories: [{ label: 'Group A', aliases: ['ALPHA', 'a'] }, { label: 'Group B', aliases: ['beta'] }] },
  ]);
  assert.deepEqual(merged?.categories, [
    { label: 'Group A', aliases: ['ALPHA', 'a'] },
    { label: 'Group B', aliases: ['beta'] },
  ]);
});

test('accepts equivalent nested plan and vocabulary field shapes from fallback models', () => {
  const sources = buildSemanticNoteSources(records);
  const plan = normalizeSemanticCategoryPlan({ result: { output: {
    groups: [
      { name: 'Primary', variants: [{ text: 'big joint' }] },
      { category: 'Secondary', phrases: ['small joint'] },
    ],
  } } }, sources, 2);
  assert.deepEqual(plan?.categories, [
    { label: 'Primary', aliases: ['big joint'] },
    { label: 'Secondary', aliases: ['small joint'] },
  ]);
});

test('builds an exact-wording fallback when the user explicitly supplies every category', () => {
  const sources = buildSemanticNoteSources([{
    date: '2026-07-15', completed: [], exerciseNotes: [], session: null,
    health: { generalNote: 'Burning and tingling today. No swelling.' },
  }]);
  const plan = explicitSemanticCategoryPlan(
    'Make a table showing how many times I mentioned each of these: numbness, tingling, burning, swelling, and bruising. Let me inspect the notes.',
    sources,
    5,
  );
  assert.deepEqual(plan?.categories.map(category => [category.label, category.aliases]), [
    ['numbness', []],
    ['tingling', ['tingling']],
    ['burning', ['burning']],
    ['swelling', ['swelling']],
    ['bruising', []],
  ]);
  const visual = plan ? visualizationFromSemanticCategoryPlan(plan, sources)[0] : null;
  assert.deepEqual(visual?.type === 'table' ? visual.rows : [], [
    ['numbness', '0'], ['tingling', '1'], ['burning', '1'], ['swelling', '1'], ['bruising', '0'],
  ]);
});
