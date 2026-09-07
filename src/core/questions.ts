// Read-only scan for `[!question]` blocks (SPEC-integration §C2). Keel Open Questions owns
// the grammar; Cockpit only lists unanswered blocks. A ticked option counts as an answer.
// No 'obsidian' import.

export interface QuestionBlock {
	id: string;
	title: string;
	/** 0-based line of the `> [!question]` header. */
	line: number;
	/** True when any option is ticked (an answer without the plugin, §C2). */
	answered: boolean;
	options: { text: string; ticked: boolean }[];
	/** From the `blocks:` field, when present. */
	blocks: string[];
}

const HEADER = /^>\s*\[!question\][+-]?\s*(?:(Q-\d+)\s+)?(.*?)\s*$/i;
const OPTION = /^>\s*[-*+]\s+\[( |x|X)\]\s+(.*?)\s*$/;
const META = /^>\s*(?:asked|decided|pick|log|blocks|by):/i;

export function scanQuestions(text: string): QuestionBlock[] {
	const lines = text.split(/\r?\n/);
	const out: QuestionBlock[] = [];
	let inFence = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? '';
		if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
		if (inFence) continue;
		const h = HEADER.exec(line);
		if (!h) continue;
		const block: QuestionBlock = { id: h[1] ?? '', title: h[2] ?? '', line: i, answered: false, options: [], blocks: [] };
		for (let j = i + 1; j < lines.length; j++) {
			const l = lines[j] ?? '';
			if (!/^>/.test(l)) break;
			const o = OPTION.exec(l);
			if (o) {
				const ticked = o[1] !== ' ';
				block.options.push({ text: o[2] ?? '', ticked });
				if (ticked) block.answered = true;
			} else if (META.test(l)) {
				const b = /blocks:\s*([^·]+)/i.exec(l);
				if (b) block.blocks = (b[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
			}
			i = j;
		}
		out.push(block);
	}
	return out;
}

export function unansweredQuestions(text: string): QuestionBlock[] {
	return scanQuestions(text).filter((q) => !q.answered);
}
