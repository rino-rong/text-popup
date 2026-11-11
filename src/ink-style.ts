export const inkColors = { Red: '#ed4656', Blue: '#3985e8', Green: '#259d65' } as const;
export const inkWidths = { Thin: 2, Medium: 3, Thick: 5 } as const;
export interface InkStyle {
	tool: 'pen' | 'rectangle';
	color: keyof typeof inkColors;
	width: keyof typeof inkWidths;
}

function same(a: InkStyle, b: InkStyle): boolean {
	return a.tool === b.tool && a.color === b.color && a.width === b.width;
}

export class UsedInkStyles {
	private recent: InkStyle[] = [];
	record(style: InkStyle): void {
		this.recent = [{ ...style }, ...this.recent.filter(s => !same(s, style))].slice(0, 2);
	}
	other(current: InkStyle): InkStyle | undefined {
		return this.recent.length === 2 ? this.recent.find(s => !same(s, current)) : undefined;
	}
}
