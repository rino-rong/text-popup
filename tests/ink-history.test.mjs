import assert from 'node:assert/strict';
import test from 'node:test';
import { createJiti } from 'jiti';
const { InkHistory } = await createJiti(import.meta.url).import('../src/ink-history.ts');

test('undo restores a cleared drawing and continues through its earlier strokes', () => {
	const page = new InkHistory();
	page.add('A'); page.add('B'); page.clear(); page.clear();
	page.add('C'); page.undo();
	assert.deepEqual(page.strokes, []);
	page.undo();
	assert.deepEqual(page.strokes, ['A', 'B']);
	page.undo(); assert.deepEqual(page.strokes, ['A']);
	page.undo(); page.undo();
	assert.deepEqual(page.strokes, []);
	assert.equal(page.canUndo, false);
});
