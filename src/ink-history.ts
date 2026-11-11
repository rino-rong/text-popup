/** Each popup owns one history per source index. Clearing transfers ownership
 * of the old list to the undo stack, without copying stroke geometry. */
export class InkHistory<T> {
	strokes: T[] = [];
	private operations: ({ draw: true } | { cleared: T[] })[] = [];

	get canUndo(): boolean { return this.operations.length > 0; }

	add(stroke: T): void {
		this.strokes.push(stroke);
		this.operations.push({ draw: true });
	}

	clear(): void {
		if (!this.strokes.length) return;
		this.operations.push({ cleared: this.strokes });
		this.strokes = [];
	}

	undo(): void {
		const op = this.operations.pop();
		if (!op) return;
		if ('cleared' in op) this.strokes = op.cleared;
		else this.strokes.pop();
	}
}
