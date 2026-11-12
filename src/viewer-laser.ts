/*! @excalidraw/laser-pointer — MIT License

Copyright (c) 2023 Excalidraw

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE. */
import { Component } from 'obsidian';
import { LaserPointer } from '@excalidraw/laser-pointer';
import type { Point } from '@excalidraw/laser-pointer';

const DECAY_MS = 1000;
const TRAIL_LENGTH = 50;
// Extra points seed the streamlining filter just behind the invisible tail.
const HISTORY = TRAIL_LENGTH + 12;
const NS = 'http://www.w3.org/2000/svg';

type Stroke = { samples: Point[] };
const ease = (v: number) => 1 - (1 - Math.max(0, Math.min(1, v))) ** 4;

export function laserOutline(samples: Point[], now: number): string {
	const pen = new LaserPointer({
		streamline: 0.4, simplify: 0,
		sizeMapping: ({ pressure: time, totalLength, currentIndex }) =>
			Math.min(ease(1 - (now - time) / DECAY_MS), ease(1 - (totalLength - currentIndex) / TRAIL_LENGTH)),
	});
	for (const p of samples) pen.addPoint(p);
	const points = pen.getStrokeOutline();
	const first = points[0], last = points[points.length - 1];
	if (!first || !last) return '';
	// One closed outline avoids seams where separately faded segments overlap.
	let d = `M${(first[0] + last[0]) / 2} ${(first[1] + last[1]) / 2}`;
	for (let i = 0; i < points.length; ++i) {
		const a = points[i]!, b = points[i + 1] ?? first;
		d += `Q${a[0]} ${a[1]} ${(a[0] + b[0]) / 2} ${(a[1] + b[1]) / 2}`;
	}
	return d + 'Z';
}

export class ViewerLaser extends Component {
	private layer: SVGSVGElement;
	private path: SVGPathElement;
	private box: SVGRectElement;
	private corner: { x: number; y: number } | null = null;
	private fade: Animation | null = null;
	private strokes: Stroke[] = [];
	private current: Stroke | null = null;
	private pointer: number | null = null;
	private frame = 0;
	enabled = false;

	constructor(private stage: HTMLElement, private scroller: HTMLElement, private panReady: () => boolean) {
		super();
		const doc = stage.ownerDocument;
		this.layer = doc.createElementNS(NS, 'svg');
		this.layer.classList.add('text-popup-laser-layer');
		this.layer.setAttribute('aria-hidden', 'true');
		this.path = doc.createElementNS(NS, 'path');
		this.path.setAttribute('fill', '#ff0000');
		this.box = doc.createElementNS(NS, 'rect');
		this.box.setAttribute('fill', 'none');
		this.box.setAttribute('stroke', '#ff0000');
		this.box.setAttribute('stroke-width', '2');
		this.layer.append(this.path, this.box);
		stage.appendChild(this.layer);
	}

	onload(): void {
		const el = this.scroller;
		this.registerDomEvent(el, 'pointerdown', e => {
			if (!this.enabled || this.panReady() || this.pointer !== null || e.button !== 0 || !e.isPrimary) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			this.pointer = e.pointerId;
			el.addClass('is-drawing');
			el.setPointerCapture(e.pointerId);
			if (e.shiftKey) {
				this.resetBox();
				const bounds = this.stage.getBoundingClientRect();
				this.corner = { x: e.clientX - bounds.left, y: e.clientY - bounds.top };
				return;
			}
			this.current = { samples: [] };
			this.strokes.push(this.current);
			this.record(e);
		}, true);
		this.registerDomEvent(el, 'pointermove', e => {
			if (e.pointerId === this.pointer) this.record(e);
		});
		for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
			this.registerDomEvent(el, type, e => {
				if (e.pointerId !== this.pointer) return;
				if (type === 'pointerup') this.record(e);
				if (this.corner) {
					if (type === 'pointerup') this.fadeBox();
					else this.resetBox();
				}
				this.release();
			});
		}
		this.registerDomEvent(el, 'click', e => {
			if (this.enabled) { e.preventDefault(); e.stopImmediatePropagation(); }
		}, true);
		this.registerDomEvent(this.stage.win, 'blur', () => this.clear());
		this.register(() => { this.clear(); this.layer.remove(); });
	}

	setEnabled(on: boolean): void {
		this.clear();
		this.enabled = on;
		this.stage.toggleClass('is-laser', on);
	}

	clear(): void {
		this.release();
		this.resetBox();
		this.strokes = [];
		this.stage.win.cancelAnimationFrame(this.frame);
		this.frame = 0;
		this.path.removeAttribute('d');
	}

	private release(): void {
		const id = this.pointer;
		this.pointer = null;
		if (id !== null) this.scroller.removeClass('is-drawing');
		this.current = null;
		if (id !== null && this.scroller.hasPointerCapture(id)) this.scroller.releasePointerCapture(id);
	}

	private resetBox(): void {
		this.corner = null;
		this.fade?.cancel();
		this.fade = null;
		this.box.removeAttribute('width');
		this.box.removeAttribute('height');
	}

	private fadeBox(): void {
		this.corner = null;
		const animation = this.box.animate([{ opacity: 1 }, { opacity: 0 }], {
			delay: 500, duration: 500, fill: 'forwards',
		});
		this.fade = animation;
		animation.onfinish = () => { if (this.fade === animation) this.resetBox(); };
	}

	private record(e: PointerEvent): void {
		if (this.corner) {
			const bounds = this.stage.getBoundingClientRect();
			const x = e.clientX - bounds.left, y = e.clientY - bounds.top;
			this.box.setAttribute('x', String(Math.min(this.corner.x, x)));
			this.box.setAttribute('y', String(Math.min(this.corner.y, y)));
			this.box.setAttribute('width', String(Math.abs(x - this.corner.x)));
			this.box.setAttribute('height', String(Math.abs(y - this.corner.y)));
			return;
		}
		const stroke = this.current;
		if (!stroke) return;
		const box = this.stage.getBoundingClientRect(), samples = stroke.samples;
		const point: Point = [e.clientX - box.left, e.clientY - box.top, this.stage.win.performance.now()];
		const last = samples[samples.length - 1];
		if (last && last[0] === point[0] && last[1] === point[1]) return;
		if (last && point[2] - last[2] >= DECAY_MS) samples.length = 0;
		samples.push(point);
		if (samples.length > HISTORY) samples.shift();
		if (!this.frame) this.frame = this.stage.win.requestAnimationFrame(this.paint);
	}

	private paint = (now: number): void => {
		this.frame = 0;
		const paths: string[] = [];
		this.strokes = this.strokes.filter(stroke => {
			const last = stroke.samples[stroke.samples.length - 1];
			if (last && now - last[2] < DECAY_MS) {
				paths.push(laserOutline(stroke.samples, now));
				return true;
			}
			// Keep the active stroke ready if the user pauses without lifting.
			return stroke === this.current;
		});
		this.path.setAttribute('d', paths.join(' '));
		if (paths.length) this.frame = this.stage.win.requestAnimationFrame(this.paint);
	};
}
