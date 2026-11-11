import { App, Component, Scope, setIcon } from 'obsidian';
import { t } from './lang/helpers';
import { inkColors, inkWidths, ViewerInk } from './viewer-ink';

export class InkPanel {
	private el: HTMLElement;
	private scope: Scope;
	private sync: (() => void)[] = [];

	constructor(private app: App, owner: Component, parent: Scope, private trigger: HTMLElement,
		ink: ViewerInk, activate: () => void) {
		const label = t('Annotation options');
		this.el = trigger.parentElement!.createDiv({ cls: 'text-popup-ink-panel', attr: { role: 'dialog', 'aria-label': label } });
		this.el.hidden = true;
		trigger.setAttribute('aria-haspopup', 'dialog');
		trigger.setAttribute('aria-expanded', 'false');
		this.scope = new Scope(parent);
		this.scope.register([], 'Escape', () => { this.close(); trigger.focus(); return false; });
		const row = (name: string) => {
			const el = this.el.createDiv({ cls: 'tp-ink-row', attr: { role: 'group', 'aria-label': name } });
			el.createSpan({ text: name, cls: 'tp-ink-label' });
			return el;
		};
		const choice = (group: HTMLElement, name: string, selected: () => boolean, apply: () => void) => {
			const b = group.createEl('button', { attr: { type: 'button', title: name, 'aria-label': name } });
			b.createSpan({ text: name });
			owner.registerDomEvent(b, 'click', () => { apply(); activate(); this.refresh(); });
			this.sync.push(() => b.setAttribute('aria-pressed', String(selected())));
			return b;
		};
		const tools = row(t('Tool'));
		for (const tool of ['pen', 'rectangle'] as const) {
			const b = choice(tools, tool === 'pen' ? t('Annotate with pen') : t('Outline rectangle'),
				() => ink.tool === tool, () => { ink.tool = tool; });
			const icon = b.createSpan(); setIcon(icon, tool === 'pen' ? 'pencil' : 'square'); b.prepend(icon);
		}
		const colors = row(t('Color'));
		for (const c of Object.keys(inkColors) as (keyof typeof inkColors)[]) {
			const b = choice(colors, t(c), () => ink.color === c, () => { ink.color = c; });
			b.prepend(b.createSpan({ cls: 'tp-ink-dot' }));
			b.setCssProps({ '--tp-swatch': inkColors[c] });
		}
		const widths = row(t('Width'));
		for (const w of Object.keys(inkWidths) as (keyof typeof inkWidths)[]) {
			const b = choice(widths, t(w), () => ink.width === w, () => { ink.width = w; });
			b.prepend(b.createSpan({ cls: 'tp-ink-line' }));
			b.setCssProps({ '--tp-weight': inkWidths[w] + 'px' });
		}
		const outside = (e: Event) => {
			const node = e.target as Node | null;
			if (!this.el.hidden && !this.el.contains(node) && !trigger.contains(node)) this.close();
		};
		// Dismiss in capture without consuming the pointerdown: the same press starts the stroke.
		owner.registerDomEvent(trigger.ownerDocument, 'pointerdown', outside, true);
		owner.registerDomEvent(trigger.ownerDocument, 'focusin', outside);
		owner.register(() => this.close());
	}

	toggle(): void {
		if (!this.el.hidden) { this.close(); return; }
		this.refresh();
		this.el.hidden = false;
		this.trigger.setAttribute('aria-expanded', 'true');
		this.app.keymap.pushScope(this.scope);
		this.el.querySelector<HTMLButtonElement>('button[aria-pressed=true]')?.focus();
	}

	private refresh(): void { for (const sync of this.sync) sync(); }
	private close(): void {
		if (this.el.hidden) return;
		this.app.keymap.popScope(this.scope);
		this.el.hidden = true;
		this.trigger.setAttribute('aria-expanded', 'false');
	}
}
