import { Component } from 'obsidian';
import { InkHistory } from './ink-history';

const NS = 'http://www.w3.org/2000/svg';
const targets = ['.text-popup-canvas-fit', 'svg:not(.svg-icon)', 'img', 'td, th', 'pre'];
type Stroke = {
	selector: string; ordinal: number; width: number; height: number;
	points: [number, number][];
};
type Mark = { stroke: Stroke; node: SVGPolylineElement; anchor: Element | null };

export class ViewerInk extends Component {
	enabled = false;
	private readonly layer: SVGSVGElement;
	private readonly pages = new Map<number, InkHistory<Stroke>>();
	private page = new InkHistory<Stroke>();
	private root: HTMLElement | null = null;
	private marks: Mark[] = [];
	private active: { mark: Mark; id: number } | null = null;
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
			const target = e.target as Element;
			let anchor: Element = this.root, selector = '', ordinal = 0;
			for (const candidate of targets) {
				const el = target.closest(candidate);
				if (el && this.root.contains(el)) {
					anchor = el; selector = candidate;
					ordinal = Array.from(this.root.querySelectorAll(candidate)).indexOf(el);
					break;
				}
			}
			const {width, height} = anchor.getBoundingClientRect();
			if (!width || !height) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			const mark = this.mount({selector, ordinal, width, height, points: []}, anchor);
			this.active = {mark, id: e.pointerId};
			this.scroll.setPointerCapture(e.pointerId);
			this.sample(e);
			this.position(mark, this.stage.getBoundingClientRect());
		}, true);
		this.registerDomEvent(this.scroll, 'pointermove', e => this.sample(e));
		this.registerDomEvent(this.scroll, 'pointerup', e => {
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
		const {mark, id} = this.active;
		this.active = null;
		if (this.scroll.hasPointerCapture(id)) this.scroll.releasePointerCapture(id);
		if (commit && mark.stroke.points.length) this.page.add(mark.stroke);
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
			mark.anchor = stroke.selector ? this.root.querySelectorAll(stroke.selector)[stroke.ordinal] ?? null : this.root;
			if (mark.anchor) this.resize.observe(mark.anchor);
		}
		const box = mark.anchor?.getBoundingClientRect();
		node.style.display = box?.width && box.height ? '' : 'none';
		if (!box?.width || !box.height) return;
		node.setAttribute('transform', `translate(${box.x-stage.x} ${box.y-stage.y}) scale(${box.width/stroke.width} ${box.height/stroke.height})`);
	}
}
