import { describe, expect, it } from 'vitest';
import { addOpenQuestionsHeading, extractLinks, parseContext, readUpdated } from './context';

const sample = `# Workspace Context

Workspace: obsidian · Created: 2026-09-01 · Updated: 2026-09-07

---

## Workspace Overview

Five plugins. See [\`../INDEX.md\`](../INDEX.md).

## State

- **cockpit-plugin:** scaffold only.

## Open questions

- _none_ — answered earlier
- [KC question](../cockpit-plugin/INDEX.md#open-threads) about the diff
- [[specs/SPEC-integration#Q-3|Q-3]]
  continued here

## Agent State

- Durable info goes in the project directory.
`;

describe('parseContext', () => {
	it('reads title, updated date and sections in order', () => {
		const c = parseContext(sample);
		expect(c.title).toBe('Workspace Context');
		expect(c.updated).toBe('2026-09-07');
		expect(c.sections.map((s) => s.heading)).toEqual(['Workspace Overview', 'State', 'Open questions', 'Agent State']);
		expect(c.sections[1]?.body).toBe('- **cockpit-plugin:** scaffold only.');
		expect(c.preamble).toContain('Created: 2026-09-01');
	});

	it('lists open questions as items with links, dropping _none_', () => {
		const c = parseContext(sample);
		expect(c.openQuestions).toHaveLength(2);
		expect(c.openQuestions?.[0]?.links).toEqual([{ text: 'KC question', target: '../cockpit-plugin/INDEX.md#open-threads' }]);
		expect(c.openQuestions?.[1]?.links).toEqual([{ text: 'Q-3', target: 'specs/SPEC-integration#Q-3' }]);
		expect(c.openQuestions?.[1]?.text).toContain('continued here');
	});

	it('returns null open questions when the heading is missing', () => {
		expect(parseContext('# T\n\n## State\n\nx\n').openQuestions).toBeNull();
	});

	it('ignores headings inside fences', () => {
		const c = parseContext('# T\n\n```\n## not a heading\n```\n\n## Real\n');
		expect(c.sections.map((s) => s.heading)).toEqual(['Real']);
	});
});

describe('readUpdated', () => {
	it('handles bold and missing dates', () => {
		expect(readUpdated('**Updated:** 2026-01-02')).toBe('2026-01-02');
		expect(readUpdated('nothing')).toBeNull();
	});
});

describe('extractLinks', () => {
	it('reads markdown and wiki links', () => {
		expect(extractLinks('a [b](c.md "t") [[d#e|f]] [[g]]')).toEqual([
			{ text: 'b', target: 'c.md' },
			{ text: 'f', target: 'd#e' },
			{ text: 'g', target: 'g' },
		]);
	});
});

describe('addOpenQuestionsHeading', () => {
	it('leaves a file with the heading untouched', () => {
		expect(addOpenQuestionsHeading(sample)).toBe(sample);
	});

	it('inserts before Agent State', () => {
		const text = '# T\n\n## State\n\nx\n\n## Agent State\n\ny\n';
		expect(addOpenQuestionsHeading(text)).toBe('# T\n\n## State\n\nx\n\n## Open questions\n\n## Agent State\n\ny\n');
	});

	it('appends at the end otherwise', () => {
		expect(addOpenQuestionsHeading('# T\n\n## State\n\nx\n')).toBe('# T\n\n## State\n\nx\n\n## Open questions\n\n');
		expect(addOpenQuestionsHeading('')).toBe('## Open questions\n\n');
	});
});
