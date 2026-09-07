// .keel/context.md as Cockpit reads it (SPEC-integration §C5). keel owns the file; this
// module only parses it, and can add the `## Open questions` heading when it is missing.
// No 'obsidian' import.

export interface Section {
	heading: string;
	/** Markdown between this heading and the next H2 (or the end), without the heading line. */
	body: string;
	/** 0-based line of the heading. */
	line: number;
}

export interface Link {
	text: string;
	/** Link target as written: a relative path, a wiki target, or a URL. */
	target: string;
}

export interface OpenQuestion {
	/** The list item text, markdown stripped of its leading bullet. */
	text: string;
	links: Link[];
}

export interface ContextFile {
	title: string;
	/** The `Updated:` date (YYYY-MM-DD) from the preamble, or null. */
	updated: string | null;
	/** Everything before the first H2 after the title line. */
	preamble: string;
	sections: Section[];
	/** Items under `## Open questions`, or null when the heading is missing. */
	openQuestions: OpenQuestion[] | null;
}

export const OPEN_QUESTIONS = 'Open questions';

export function isOpenQuestionsHeading(heading: string): boolean {
	return heading.trim().toLowerCase() === OPEN_QUESTIONS.toLowerCase();
}

/** The `Updated:` date; the last one wins so a line like `Created: … · Updated: …` works. */
export function readUpdated(text: string): string | null {
	const m = /Updated:\**\s*(\d{4}-\d{2}-\d{2})/i.exec(text);
	return m?.[1] ?? null;
}

export function parseContext(text: string): ContextFile {
	const lines = text.split(/\r?\n/);
	let title = '';
	let titleLine = -1;
	const sections: Section[] = [];
	let inFence = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? '';
		if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
		if (inFence) continue;
		if (titleLine < 0 && /^# /.test(line)) {
			title = line.slice(2).trim();
			titleLine = i;
			continue;
		}
		const h2 = /^## +(.+?)\s*#*\s*$/.exec(line);
		if (h2) sections.push({ heading: h2[1] ?? '', body: '', line: i });
	}
	for (let s = 0; s < sections.length; s++) {
		const cur = sections[s];
		if (!cur) continue;
		const end = sections[s + 1]?.line ?? lines.length;
		cur.body = lines.slice(cur.line + 1, end).join('\n').replace(/^\n+|\n+$/g, '');
	}
	const preambleEnd = sections[0]?.line ?? lines.length;
	const preamble = lines.slice(titleLine + 1, preambleEnd).join('\n').trim();
	const oq = sections.find((s) => isOpenQuestionsHeading(s.heading));
	return {
		title,
		updated: readUpdated(preamble) ?? readUpdated(text),
		preamble,
		sections,
		openQuestions: oq ? parseOpenQuestions(oq.body) : null,
	};
}

/** Every markdown link in a piece of text: `[text](target)` and `[[target|text]]`. */
export function extractLinks(markdown: string): Link[] {
	const out: Link[] = [];
	const md = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
	const wiki = /\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
	for (const m of markdown.matchAll(md)) out.push({ text: m[1] ?? '', target: m[2] ?? '' });
	for (const m of markdown.matchAll(wiki)) out.push({ text: m[3] ?? m[1] ?? '', target: (m[1] ?? '') + (m[2] ?? '') });
	return out;
}

/** Top-level list items under the Open questions heading. `_none_` items are dropped. */
export function parseOpenQuestions(body: string): OpenQuestion[] {
	const out: OpenQuestion[] = [];
	for (const raw of body.split(/\r?\n/)) {
		const m = /^[-*+] +(.*)$/.exec(raw);
		if (!m) {
			// Continuation lines belong to the previous item.
			const last = out[out.length - 1];
			if (last && /^\s+\S/.test(raw)) {
				last.text += ' ' + raw.trim();
				last.links = extractLinks(last.text);
			}
			continue;
		}
		const text = (m[1] ?? '').trim();
		if (/^_?none_?\b/i.test(text)) continue;
		out.push({ text, links: extractLinks(text) });
	}
	return out;
}

/**
 * Add `## Open questions` when missing: before `## Agent State` if present (that is where
 * keel puts it), else at the end. Returns the text unchanged when the heading exists.
 */
export function addOpenQuestionsHeading(text: string): string {
	const parsed = parseContext(text);
	if (parsed.openQuestions !== null) return text;
	const block = `## ${OPEN_QUESTIONS}\n\n`;
	const agent = parsed.sections.find((s) => /^agent state$/i.test(s.heading.trim()));
	const lines = text.split(/\r?\n/);
	if (agent) {
		lines.splice(agent.line, 0, block.trimEnd(), '');
		return lines.join('\n');
	}
	const body = text.replace(/\s+$/, '');
	return (body ? body + '\n\n' : '') + block;
}
