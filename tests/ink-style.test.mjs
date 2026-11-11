import assert from 'node:assert/strict';
import test from 'node:test';
import { createJiti } from 'jiti';
const { UsedInkStyles } = await createJiti(import.meta.url).import('../src/ink-style.ts');

test('recall tracks the two latest distinct completed styles independently of draft selections', () => {
	const used = new UsedInkStyles();
	const a = {tool:'pen', color:'Red', width:'Medium'};
	const b = {...a, tool:'rectangle'};
	const c = {...b, width:'Thin'};
	used.record(a); used.record({...a}); assert.equal(used.other(b), undefined);
	used.record(b); assert.deepEqual(used.other(b), a);
	assert.deepEqual(used.other(a), b);
	assert.deepEqual(used.other(c), b);
	used.record(a); used.record(c);
	assert.deepEqual(used.other(c), a);
	assert.deepEqual(used.other(b), c);
});
