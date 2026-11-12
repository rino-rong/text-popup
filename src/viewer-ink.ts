import { Component } from 'obsidian';
import { InkHistory } from './ink-history';

import { describeAnchor, findAnchor, projectCorner, rectanglePoints, resolveAnchor } from './ink-rectangle';
import type { InkCorner } from './ink-rectangle';

import { inkColors, inkWidths, UsedInkStyles, type InkStyle } from './ink-style';

const NS = 'http://www.w3.org/2000/svg';

type Stroke = {
	tool: 'pen' | 'rectangle'; end?: InkCorner;
	color: string; weight: number;
	selector: string; ordinal: number; width: number; height: number;
	points: [number, number][];
};
type Mark = { stroke: Stroke; node: SVGPolylineElement; anchor: Element | null; endAnchor?: Element | null };

export class ViewerInk extends Component {
	enabled = false;
	tool: Stroke['tool'] = 'pen';
	color: keyof typeof inkColors = 'Red';
	width: keyof typeof inkWidths = 'Medium';
	private readonly layer: SVGSVGElement;
	readonly usedStyles = new UsedInkStyles();
	private readonly pages = new Map<number, InkHistory<Stroke>>();
	private page = new InkHistory<Stroke>();
	private root: HTMLElement | null = null;
	private marks: Mark[] = [];
	private active: { mark: Mark; id: number; style: InkStyle } | null = null;
	private frame = 0;
	private resize!: ResizeObserver;
	onChange = (): void => {};

	constructor(private stage: HTMLElement, private scroll: HTMLElement, private panReady: () => boolean) {
		super();
		this.layer = stage.ownerDocument.createElementNS(NS, 'svg');
		this.layer.classList.add('text-popup-ink-layer');
		this.layer.setAttribute('aria-hidden', 'true');
		stage.prepend(this.layer);
	}

	get canUndo(): boolean { return this.page.canUndo; }
	get canRedo(): boolean { return this.page.canRedo; }
	get canClear(): boolean { return this.page.strokes.length > 0; }

	onload(): void {
		this.resize = new ResizeObserver(this.schedule);
		this.registerDomEvent(this.scroll, 'scroll', this.schedule, true);
		this.registerDomEvent(this.scroll, 'pointerdown', e => {
			if (!this.enabled || this.panReady() || !this.root || !e.isPrimary || e.button !== 0 || this.active) return;
			const anchor = findAnchor(this.root, e.target as Element);
			const {selector, ordinal} = describeAnchor(this.root, anchor);
			const {width, height} = anchor.getBoundingClientRect();
			if (!width || !height) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			const mark = this.mount({tool: this.tool, selector, ordinal, width, height, color: inkColors[this.color], weight: inkWidths[this.width], points: []}, anchor);
			this.scroll.addClass('is-drawing');
			this.active = {mark, id: e.pointerId, style: {tool: this.tool, color: this.color, width: this.width}};
			// Document listeners keep a mouse drag alive outside the content.
			// SVG renderers can reclaim mouse capture in the middle of a stroke.
			if (e.pointerType !== 'mouse') this.scroll.setPointerCapture(e.pointerId);
			this.sample(e);
			this.position(mark, this.stage.getBoundingClientRect());
		}, true);
		this.registerDomEvent(this.scroll.ownerDocument, 'pointermove', e => this.sample(e));
		this.registerDomEvent(this.scroll.ownerDocument, 'pointerup', e => {
			if (e.pointerId !== this.active?.id) return;
			this.sample(e);
			this.finish(true);
		});
		for (const type of ['pointercancel', 'lostpointercapture'] as const) {
			this.registerDomEvent(this.scroll, type, e => {
				if (e.pointerId === this.active?.id) this.finish(false);
			});
		}
		this.registerDomEvent(this.scroll, 'click', e => {
			if (this.enabled) { e.preventDefault(); e.stopImmediatePropagation(); }
		}, true);
		this.registerDomEvent(this.stage.win, 'blur', () => this.finish(false));
		this.register(() => {
			this.finish(false);
			this.stage.win.cancelAnimationFrame(this.frame);
			this.resize.disconnect();
			this.pages.clear();
			this.layer.remove();
		});
	}

	select(index: number, root: HTMLElement): void {
		this.finish(false);
		this.root = root;
		this.page = this.pages.get(index) ?? new InkHistory<Stroke>();
		this.pages.set(index, this.page);
		this.redraw();
	}

	setEnabled(enabled: boolean): void {
		this.finish(false);
		this.enabled = enabled;
		this.stage.toggleClass('is-inking', enabled);
		this.onChange();
	}

	redo(): void { this.finish(false); this.page.redo(); this.redraw(); }
	undo(): void { this.finish(false); this.page.undo(); this.redraw(); }
	clear(): void { this.finish(false); this.page.clear(); this.redraw(); }

	private redraw(): void {
		this.resize.disconnect();
		if (this.root) this.resize.observe(this.root);
		this.layer.replaceChildren();
		this.marks = [];
		for (const stroke of this.page.strokes) this.mount(stroke, null);
		this.schedule();
		this.onChange();
	}

	private mount(stroke: Stroke, anchor: Element | null): Mark {
		const node = this.stage.ownerDocument.createElementNS(NS, 'polyline');
		node.setAttribute('stroke', stroke.color);
		node.setAttribute('stroke-width', String(stroke.weight));
		node.dataset.tool = stroke.tool;
		if (stroke.tool === 'rectangle') node.setAttribute('fill', 'none');
		this.layer.append(node);
		for (const [x,y] of stroke.points) this.appendPoint(node, x, y);
		const mark = { stroke, node, anchor };
		this.marks.push(mark);
		if (anchor) this.resize.observe(anchor);
		return mark;
	}

	private appendPoint(node: SVGPolylineElement, x: number, y: number): void {
		const point = this.layer.createSVGPoint();
		point.x = x; point.y = y;
		node.points.appendItem(point);
	}

	private sample(e: PointerEvent): void {
		if (!this.active || e.pointerId !== this.active.id) return;
		const {stroke, node, anchor} = this.active.mark;
		const box = anchor?.getBoundingClientRect();
		if (!box?.width || !box.height) return;
		if (stroke.tool === 'rectangle' && this.root) {
			const mark = this.active.mark;
			if (!stroke.points.length) stroke.points.push([
				(e.clientX - box.x) * stroke.width / box.width,
				(e.clientY - box.y) * stroke.height / box.height,
			]);
			const hit = this.stage.ownerDocument.elementFromPoint(e.clientX, e.clientY);
			const end = findAnchor(this.root, hit);
			const endBox = end.getBoundingClientRect();
			if (!endBox.width || !endBox.height) return;
			if (mark.endAnchor !== end || !stroke.end) {
				mark.endAnchor = end;
				stroke.end = { ...describeAnchor(this.root, end), x: 0, y: 0 };
			}
			stroke.end.x = (e.clientX - endBox.x) / endBox.width;
			stroke.end.y = (e.clientY - endBox.y) / endBox.height;
			this.position(mark, this.stage.getBoundingClientRect());
			return;
		}
		const samples = e.getCoalescedEvents?.() ?? [];
		for (const p of samples.length ? samples : [e]) {
			const x = (p.clientX - box.left) * stroke.width / box.width;
			const y = (p.clientY - box.top) * stroke.height / box.height;
			const last = stroke.points[stroke.points.length - 1];
			if (last && Math.hypot(x-last[0], y-last[1]) < 0.4) continue;
			// Duplicate the first point so a tap has a round cap too.
			if (!last) { stroke.points.push([x,y]); this.appendPoint(node, x,y); }
			stroke.points.push([x,y]);
			this.appendPoint(node, x,y);
		}
	}

	private finish(commit: boolean): void {
		if (!this.active) return;
		const {mark, id, style} = this.active;
		this.active = null;
		this.scroll.removeClass('is-drawing');
		if (this.scroll.hasPointerCapture(id)) this.scroll.releasePointerCapture(id);
		const rect = mark.stroke.tool === 'rectangle' ? mark.node.getBoundingClientRect() : null;
		if (commit && mark.stroke.points.length && (!rect || (rect.width >= 3 && rect.height >= 3))) {
			this.page.add(mark.stroke);
			this.usedStyles.record(style);
			if (mark.endAnchor) this.resize.observe(mark.endAnchor);
		}
		else { this.marks.pop(); mark.node.remove(); }
		this.onChange();
	}

	// The overlay is outside rendered Markdown (including exports and diagram
	// detection). Project content coordinates only when its layout changes.
	schedule = (): void => {
		if (!this.marks.length || this.frame) return;
		this.frame = this.stage.win.requestAnimationFrame(() => {
			this.frame = 0;
			const stage = this.stage.getBoundingClientRect();
			for (const mark of this.marks) this.position(mark, stage);
		});
	};

	private position(mark: Mark, stage: DOMRect): void {
		const {stroke, node} = mark;
		if (!mark.anchor?.isConnected && this.root) {
			mark.anchor = resolveAnchor(this.root, stroke);
			if (mark.anchor) this.resize.observe(mark.anchor);
		}
		const box = mark.anchor?.getBoundingClientRect();
		node.setAttribute('display', box?.width && box.height ? 'inline' : 'none');
		if (!box?.width || !box.height) return;
		if (stroke.end && stroke.points[0] && this.root) {
			if (!mark.endAnchor?.isConnected) {
				mark.endAnchor = resolveAnchor(this.root, stroke.end);
				if (mark.endAnchor) this.resize.observe(mark.endAnchor);
			}
			const endBox = mark.endAnchor?.getBoundingClientRect();
			if (!endBox?.width || !endBox.height) { node.setAttribute('display', 'none'); return; }
			const endX = projectCorner(stroke.end.x, endBox.x, endBox.width, box.x, box.width, stroke.width);
			const endY = projectCorner(stroke.end.y, endBox.y, endBox.height, box.y, box.height, stroke.height);
			node.setAttribute('points', rectanglePoints(...stroke.points[0], endX, endY));
		}
		node.setAttribute('transform', `translate(${box.x-stage.x} ${box.y-stage.y}) scale(${box.width/stroke.width} ${box.height/stroke.height})`);
	}
}
