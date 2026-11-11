type InkOperation<T> = { drawn: T } | { cleared: T[] };

/** Each popup owns one history per source index. Clearing transfers ownership
 * of the old list to the undo stack, without copying stroke geometry. */
export class InkHistory<T> {
	strokes: T[] = [];
	private operations: InkOperation<T>[] = [];
	private future: InkOperation<T>[] = [];

	get canRedo(): boolean { return this.future.length > 0; }

	get canUndo(): boolean { return this.operations.length > 0; }

	add(stroke: T): void {
		this.strokes.push(stroke);
		this.operations.push({ drawn: stroke });
		this.future.length = 0;
	}

	clear(): void {
		if (!this.strokes.length) return;
		this.future.length = 0;
		this.operations.push({ cleared: this.strokes });
		this.strokes = [];
	}

	undo(): void {
		const op = this.operations.pop();
		if (!op) return;
		if ('cleared' in op) this.strokes = op.cleared;
		else this.strokes.pop();
		this.future.push(op);
	}

	redo(): void {
		const op = this.future.pop();
		if (!op) return;
		if ('cleared' in op) this.strokes = [];
		else this.strokes.push(op.drawn);
		this.operations.push(op);
	}
}
