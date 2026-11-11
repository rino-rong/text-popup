export interface InkAnchor { selector: string; ordinal: number }
export interface InkCorner extends InkAnchor { x: number; y: number }
const targets = ['.text-popup-canvas-fit', 'svg:not(.svg-icon)', 'img', 'td, th', 'pre'];

export function findAnchor(root: Element, target: Element | null): Element {
	for (const selector of targets) {
		const el = target?.closest(selector);
		if (el && root.contains(el)) return el;
	}
	return root;
}

export function describeAnchor(root: Element, el: Element): InkAnchor {
	const selector = el === root ? '' : targets.find(s => el.matches(s)) ?? '';
	return { selector, ordinal: selector ? Array.from(root.querySelectorAll(selector)).indexOf(el) : 0 };
}

export function resolveAnchor(root: Element, ref: InkAnchor): Element | null {
	return ref.selector ? root.querySelectorAll(ref.selector)[ref.ordinal] ?? null : root;
}

// Keep the frame in the start anchor's coordinate system, so its line weight
// scales like the pen. Its opposite corner can belong to a different cell.
export function projectCorner(
	fraction: number, endOrigin: number, endSize: number,
	startOrigin: number, startSize: number, originalSize: number,
): number {
	return (endOrigin + endSize * fraction - startOrigin) * originalSize / startSize;
}

export function rectanglePoints(x: number, y: number, endX: number, endY: number): string {
	return `${x},${y} ${endX},${y} ${endX},${endY} ${x},${endY} ${x},${y}`;
}
