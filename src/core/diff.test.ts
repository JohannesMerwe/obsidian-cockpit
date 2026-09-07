import { describe, expect, it } from 'vitest';
import { diffLines, diffStats, toHunks } from './diff';

describe('diffLines', () => {
	it('marks additions, deletions and context', () => {
		const d = diffLines('a\nb\nc\n', 'a\nB\nc\nd\n');
		expect(d).toEqual([
			{ kind: 'ctx', text: 'a' },
			{ kind: 'del', text: 'b' },
			{ kind: 'add', text: 'B' },
			{ kind: 'ctx', text: 'c' },
			{ kind: 'add', text: 'd' },
		]);
		expect(diffStats(d)).toEqual({ added: 2, removed: 1 });
	});

	it('handles empty sides and identical texts', () => {
		expect(diffLines('', 'x\ny')).toEqual([{ kind: 'add', text: 'x' }, { kind: 'add', text: 'y' }]);
		expect(diffLines('x', '')).toEqual([{ kind: 'del', text: 'x' }]);
		expect(diffLines('same\n', 'same\n').every((l) => l.kind === 'ctx')).toBe(true);
	});

	it('keeps a moved block minimal', () => {
		const d = diffLines('1\n2\n3\n4\n5', '1\n3\n4\n2\n5');
		expect(diffStats(d)).toEqual({ added: 1, removed: 1 });
	});
});

describe('toHunks', () => {
	it('groups changes with context and numbers them', () => {
		const before = Array.from({ length: 12 }, (_, i) => `l${i + 1}`).join('\n');
		const after = before.replace('l3', 'L3').replace('l11', 'L11');
		const hunks = toHunks(diffLines(before, after), 1);
		expect(hunks).toHaveLength(2);
		expect(hunks[0]?.oldStart).toBe(2);
		expect(hunks[0]?.lines.map((l) => l.text)).toEqual(['l2', 'l3', 'L3', 'l4']);
		expect(hunks[1]?.oldStart).toBe(10);
		expect(hunks[1]?.newStart).toBe(10);
	});

	it('is empty when nothing changed', () => {
		expect(toHunks(diffLines('a\nb', 'a\nb'))).toEqual([]);
	});
});
