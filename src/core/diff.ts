// Line diff for the handoff view (SPEC-integration §C5). Plain LCS: context.md is short.
// No 'obsidian' import.

export type Kind = 'ctx' | 'add' | 'del';

export interface DiffLine {
	kind: Kind;
	text: string;
}

export interface Hunk {
	/** 1-based first line in the old and new text. */
	oldStart: number;
	newStart: number;
	lines: DiffLine[];
}

const splitLines = (text: string): string[] => (text === '' ? [] : text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n'));

/** Full diff as a flat list; equal lines are `ctx`. */
export function diffLines(before: string, after: string): DiffLine[] {
	const a = splitLines(before);
	const b = splitLines(after);
	// Trim the common prefix and suffix first so the DP only sees the changed middle.
	let start = 0;
	while (start < a.length && start < b.length && a[start] === b[start]) start++;
	let endA = a.length;
	let endB = b.length;
	while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
		endA--;
		endB--;
	}
	const out: DiffLine[] = a.slice(0, start).map((text) => ({ kind: 'ctx', text }));
	out.push(...lcsDiff(a.slice(start, endA), b.slice(start, endB)));
	out.push(...a.slice(endA).map((text): DiffLine => ({ kind: 'ctx', text })));
	return out;
}

function lcsDiff(a: string[], b: string[]): DiffLine[] {
	const n = a.length;
	const m = b.length;
	if (n === 0) return b.map((text) => ({ kind: 'add', text }));
	if (m === 0) return a.map((text) => ({ kind: 'del', text }));
	if (n * m > 4_000_000) return [...a.map((text): DiffLine => ({ kind: 'del', text })), ...b.map((text): DiffLine => ({ kind: 'add', text }))];
	// dp[i][j] = LCS length of a[i..] and b[j..]
	const width = m + 1;
	const dp = new Uint32Array((n + 1) * width);
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			dp[i * width + j] = a[i] === b[j] ? (dp[(i + 1) * width + j + 1] ?? 0) + 1 : Math.max(dp[(i + 1) * width + j] ?? 0, dp[i * width + j + 1] ?? 0);
		}
	}
	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			out.push({ kind: 'ctx', text: a[i] ?? '' });
			i++;
			j++;
		} else if ((dp[(i + 1) * width + j] ?? 0) >= (dp[i * width + j + 1] ?? 0)) {
			out.push({ kind: 'del', text: a[i] ?? '' });
			i++;
		} else {
			out.push({ kind: 'add', text: b[j] ?? '' });
			j++;
		}
	}
	while (i < n) out.push({ kind: 'del', text: a[i++] ?? '' });
	while (j < m) out.push({ kind: 'add', text: b[j++] ?? '' });
	return out;
}

/** Group changes into hunks with `context` unchanged lines around each. */
export function toHunks(lines: DiffLine[], context = 2): Hunk[] {
	const changed = lines.map((l) => l.kind !== 'ctx');
	const keep = lines.map((_, i) => {
		for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) if (changed[k]) return true;
		return false;
	});
	const hunks: Hunk[] = [];
	let oldNo = 1;
	let newNo = 1;
	let cur: Hunk | null = null;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line) continue;
		if (keep[i]) {
			cur ??= { oldStart: oldNo, newStart: newNo, lines: [] };
			cur.lines.push(line);
		} else if (cur) {
			hunks.push(cur);
			cur = null;
		}
		if (line.kind !== 'add') oldNo++;
		if (line.kind !== 'del') newNo++;
	}
	if (cur) hunks.push(cur);
	return hunks;
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
	let added = 0;
	let removed = 0;
	for (const l of lines) {
		if (l.kind === 'add') added++;
		else if (l.kind === 'del') removed++;
	}
	return { added, removed };
}
