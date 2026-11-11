import assert from 'node:assert/strict';
import test from 'node:test';
import { createJiti } from 'jiti';
const { projectCorner } = await createJiti(import.meta.url).import('../src/ink-rectangle.ts');

test('opposite corner tracks its own resized cell even after reverse drag and zoom', () => {
	// Start cell is 2x its original size; the end cell is to its left.
	const local = projectCorner(0.75, 100, 80, 300, 120, 60);
	assert.equal(local, -70);
	// Scrolling both cells together must not change their content coordinates.
	assert.equal(projectCorner(0.75, -100, 80, 100, 120, 60), local);
	// An intervening cell grows by 40 screen pixels.
	assert.equal(projectCorner(0.75, 100, 80, 340, 120, 60), local - 20);
});
