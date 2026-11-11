import assert from 'node:assert/strict';
import test from 'node:test';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
	alias: { obsidian: new URL('./stubs/obsidian.mjs', import.meta.url).pathname },
});
const { laserOutline } = await jiti.import('../src/viewer-laser.ts');

test('the old tail retracts while the newer head is still visible', () => {
	const samples = Array.from({ length: 50 }, (_, i) => [4 * i, 40, 100 + 10 * i]);
	const bounds = path => {
		const coords = path.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi).map(Number);
		const xs = coords.filter((_, i) => i % 2 === 0), ys = coords.filter((_, i) => i % 2 === 1);
		return { left: Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
	};
	const fresh = bounds(laserOutline(samples, 600)), fading = bounds(laserOutline(samples, 1430));
	assert.ok(fading.left > fresh.left + 80);
	assert.ok(fading.height > 0 && fading.height < fresh.height);
	assert.equal(laserOutline(samples, 1600), '');
});
