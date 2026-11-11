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

test('redo replays draws and clears in order, preserving the next undo cycle', () => {
	const h = new InkHistory();
	h.add('A'); h.add('B'); h.clear(); h.add('C');
	for (let i = 0; i < 4; ++i) h.undo();
	for (const expected of [['A'], ['A','B'], [], ['C']]) {
		h.redo(); assert.deepEqual(h.strokes, expected);
	}
	assert.equal(h.canRedo, false);
	h.undo(); h.undo(); assert.deepEqual(h.strokes, ['A','B']);
	h.clear(); assert.equal(h.canRedo, false);
	h.undo(); h.add('D'); h.redo(); assert.deepEqual(h.strokes, ['A','B','D']);
});
