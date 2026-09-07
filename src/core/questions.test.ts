import { describe, expect, it } from 'vitest';
import { scanQuestions, unansweredQuestions } from './questions';

const text = `intro

> [!question] Q-3 Which brand prefix for plugin ids?
> Ids cannot contain "obsidian".
> - [ ] keel — the tool
> - [ ] pangolin — the suite
> asked: 2026-09-07 · by: claude · pick: one · log: INDEX.md#decision-log

> [!question] Q-4 Ticked by hand?
> - [x] yes — done
> - [ ] no
> asked: 2026-09-07 · by: claude · blocks: KB-3, KQ-1

> [!decision] Q-1 Already decided
> **no** — reason

\`\`\`
> [!question] Q-9 inside a fence
\`\`\`
`;

describe('scanQuestions', () => {
	it('finds question blocks with ids, titles, options and lines', () => {
		const qs = scanQuestions(text);
		expect(qs.map((q) => q.id)).toEqual(['Q-3', 'Q-4']);
		expect(qs[0]?.title).toBe('Which brand prefix for plugin ids?');
		expect(qs[0]?.line).toBe(2);
		expect(qs[0]?.options).toHaveLength(2);
		expect(qs[1]?.blocks).toEqual(['KB-3', 'KQ-1']);
	});

	it('treats a ticked option as an answer', () => {
		expect(unansweredQuestions(text).map((q) => q.id)).toEqual(['Q-3']);
	});

	it('tolerates a header without an id and a folded callout', () => {
		const qs = scanQuestions('> [!question]- Untitled thing\n> - [ ] a\n');
		expect(qs[0]?.id).toBe('');
		expect(qs[0]?.title).toBe('Untitled thing');
	});
});
