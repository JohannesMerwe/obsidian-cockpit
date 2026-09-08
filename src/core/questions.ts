// The unanswered-question list (SPEC-integration §C2). `keel questions --json` is the primary
// source — one process, the CLI's view of the workspace; the read-only scan for `[!question]`
// blocks below is the fallback when keel is missing or does not know the verb. Keel Open
// Questions owns the grammar; Cockpit only lists unanswered blocks. A ticked option counts as
// an answer. No 'obsidian' import.

import type { Envelope } from './keel';

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

// ---- `keel questions --json` (the primary source) ---------------------------------------------

/** One unanswered question, from either source. */
export interface FoundQuestion {
	id: string;
	title: string;
	/** Path relative to the workspace root, '/'-separated. */
	path: string;
	/** 0-based line of the `> [!question]` header. */
	line: number;
	options: { text: string; ticked: boolean }[];
	blocks: string[];
	/** Prose lines between the header and the options, when keel reports them. */
	context: string[];
}

/** Where the list came from, so the pane can say so. */
export type QuestionSource = 'keel' | 'scan';

export interface QuestionList {
	source: QuestionSource;
	questions: FoundQuestion[];
	/** Why keel was not used, when source is 'scan'. */
	reason?: string;
}

function strings(v: unknown): string[] {
	return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
}

function options(v: unknown): { text: string; ticked: boolean }[] {
	if (!Array.isArray(v)) return [];
	const out: { text: string; ticked: boolean }[] = [];
	for (const o of v) {
		if (typeof o === 'string') {
			out.push({ text: o, ticked: false });
			continue;
		}
		if (typeof o !== 'object' || o === null) continue;
		const r = o as { text?: unknown; rationale?: unknown };
		if (typeof r.text !== 'string') continue;
		const rationale = typeof r.rationale === 'string' && r.rationale.trim() ? ` — ${r.rationale.trim()}` : '';
		out.push({ text: r.text + rationale, ticked: false });
	}
	return out;
}

/**
 * The questions in a `keel questions` envelope, or null when it cannot be used — keel missing,
 * the verb unknown to the installed keel, a timeout, or data of an unexpected shape. Null means
 * "fall back to the scan"; an empty array means "keel looked and found none".
 */
export function questionsFromEnvelope(env: Envelope): FoundQuestion[] | null {
	if (!env.ok) return null;
	const data = env.data;
	if (typeof data !== 'object' || data === null) return null;
	const raw = (data as { questions?: unknown }).questions;
	if (!Array.isArray(raw)) return null;
	const out: FoundQuestion[] = [];
	for (const q of raw) {
		if (typeof q !== 'object' || q === null) continue;
		const r = q as Record<string, unknown>;
		if (typeof r.kind === 'string' && r.kind !== 'question') continue;
		const line = typeof r.line === 'number' && r.line > 0 ? r.line - 1 : 0;
		out.push({
			id: typeof r.id === 'string' ? r.id : '',
			title: typeof r.title === 'string' ? r.title : '',
			path: typeof r.file === 'string' ? r.file : '',
			line,
			options: options(r.options),
			blocks: strings(r.blocks),
			context: strings(r.context),
		});
	}
	return sortQuestions(out);
}

export function sortQuestions(list: FoundQuestion[]): FoundQuestion[] {
	return [...list].sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
}

/** A scanned block as a FoundQuestion, for the fallback path. */
export function fromScan(path: string, block: QuestionBlock): FoundQuestion {
	return { id: block.id, title: block.title, path, line: block.line, options: block.options, blocks: block.blocks, context: [] };
}

/** The message the pane shows when it fell back to the scan. */
export function fallbackReason(env: Envelope): string {
	return env.ok ? 'keel questions returned an unexpected shape' : env.error.message;
}

