import { describe, expect, it } from 'vitest';
import { fallbackReason, fromScan, questionsFromEnvelope, scanQuestions, sortQuestions, unansweredQuestions } from './questions';
import type { Envelope } from './keel';

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

// Verbatim from `keel questions --json -C ~/personal-workspaces/pangolin` (keel 2026-09-07).
const envelope: Envelope = {
	ok: true,
	command: 'questions',
	data: {
		workspace: 'pangolin',
		files: 220,
		questions: [
			{
				file: 'keel/INDEX.md',
				kind: 'question',
				id: 'Q-1',
				title: 'Where should `keel start` link `copilot-prompt` skills on a machine?',
				context: ['`keel.json` declares `copilot` with `skillsFormat: copilot-prompt`.'],
				asked: '2026-09-07',
				askedBy: 'claude',
				blocks: ['KEEL-42'],
				line: 201,
				endLine: 206,
				options: [
					{ text: '~/.copilot/prompts', rationale: 'a keel-chosen directory beside the Copilot CLI config' },
					{ text: 'VS Code user prompts', rationale: 'what Copilot Chat reads' },
					{ text: 'skip copilot until KEEL-16' },
				],
				pick: 'one',
				log: 'INDEX.md#decision-log',
			},
		],
		answered: [],
	},
};

describe('questionsFromEnvelope', () => {
	it('reads the real keel questions envelope', () => {
		const qs = questionsFromEnvelope(envelope);
		expect(qs).toHaveLength(1);
		expect(qs?.[0]?.id).toBe('Q-1');
		expect(qs?.[0]?.path).toBe('keel/INDEX.md');
		expect(qs?.[0]?.blocks).toEqual(['KEEL-42']);
		expect(qs?.[0]?.context).toHaveLength(1);
	});

	it('converts keel 1-based lines to the 0-based lines the pane scrolls to', () => {
		expect(questionsFromEnvelope(envelope)?.[0]?.line).toBe(200);
	});

	it('folds each option rationale into its text and marks none ticked', () => {
		const options = questionsFromEnvelope(envelope)?.[0]?.options ?? [];
		expect(options.map((o) => o.text)).toEqual([
			'~/.copilot/prompts — a keel-chosen directory beside the Copilot CLI config',
			'VS Code user prompts — what Copilot Chat reads',
			'skip copilot until KEEL-16',
		]);
		expect(options.every((o) => !o.ticked)).toBe(true);
	});

	it('distinguishes "keel found none" from "keel could not answer"', () => {
		expect(questionsFromEnvelope({ ok: true, command: 'questions', data: { questions: [] } })).toEqual([]);
		expect(questionsFromEnvelope({ ok: false, command: 'questions', error: { kind: 'exec', message: 'unknown command "questions"' } })).toBeNull();
	});

	it('falls back when the data has an unexpected shape', () => {
		expect(questionsFromEnvelope({ ok: true, command: 'questions', data: { questions: 'none' } })).toBeNull();
		expect(questionsFromEnvelope({ ok: true, command: 'questions', data: null })).toBeNull();
	});

	it('skips entries that are not questions and tolerates missing fields', () => {
		const qs = questionsFromEnvelope({
			ok: true,
			command: 'questions',
			data: { questions: [{ kind: 'decision', file: 'a.md' }, { file: 'b.md' }] },
		});
		expect(qs).toEqual([{ id: '', title: '', path: 'b.md', line: 0, options: [], blocks: [], context: [] }]);
	});

	it('sorts by path then line', () => {
		const at = (path: string, line: number) => ({ id: '', title: '', path, line, options: [], blocks: [], context: [] });
		expect(sortQuestions([at('b.md', 1), at('a.md', 9), at('a.md', 2)]).map((q) => `${q.path}:${q.line}`)).toEqual(['a.md:2', 'a.md:9', 'b.md:1']);
	});
});

describe('the scan fallback', () => {
	it('yields the same shape as the keel path', () => {
		const block = unansweredQuestions(text)[0];
		expect(block).toBeDefined();
		expect(fromScan('INDEX.md', block!)).toEqual({
			id: 'Q-3',
			title: 'Which brand prefix for plugin ids?',
			path: 'INDEX.md',
			line: block!.line,
			options: block!.options,
			blocks: [],
			context: [],
		});
	});

	it('reports why keel was not used', () => {
		expect(fallbackReason({ ok: false, command: 'questions', error: { kind: 'binary', message: 'keel binary not found' } })).toBe('keel binary not found');
		expect(fallbackReason({ ok: true, command: 'questions', data: {} })).toBe('keel questions returned an unexpected shape');
	});
});
