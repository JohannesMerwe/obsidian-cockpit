// Rows Cockpit shows for a keel envelope. Known verbs get a curated summary; anything else
// (and the raw data behind every summary) is shown as a key/value tree. No 'obsidian' import.
import type { Envelope } from './keel';

export type Level = 'ok' | 'warn' | 'error' | 'info';

export interface Row {
	label: string;
	value: string;
	level?: Level;
}

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string => {
	if (v === null || v === undefined) return '';
	if (typeof v === 'string') return v;
	if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
	return JSON.stringify(v) ?? '';
};
const has = (o: Obj, k: string): boolean => k in o && o[k] !== null && o[k] !== undefined;

export function summarise(env: Envelope): Row[] {
	if (!env.ok) return [{ label: env.error.kind || 'error', value: env.error.message, level: 'error' }];
	const verb = env.command.split(' ')[0] ?? env.command;
	const d = obj(env.data);
	switch (verb) {
		case 'status':
			return statusRows(d);
		case 'doctor':
			return doctorRows(d);
		case 'start':
			return startRows(d);
		case 'save':
			return saveRows(d);
		default:
			return flatten(env.data);
	}
}

function statusRows(d: Obj): Row[] {
	const ws = obj(d.workspace);
	const rows: Row[] = [];
	if (has(ws, 'name')) rows.push({ label: 'Workspace', value: str(ws.name) });
	if (has(d, 'active')) rows.push({ label: 'Active', value: d.active ? 'yes' : 'no', level: d.active ? 'ok' : 'info' });
	if (has(d, 'head')) rows.push({ label: 'Head', value: `${str(d.head)} (applied ${str(d.lastAppliedSeq)})` });
	if (has(d, 'behind')) rows.push({ label: 'Behind', value: str(d.behind), level: Number(d.behind) > 0 ? 'warn' : 'ok' });
	const counts = ['projects', 'repos', 'boards'].filter((k) => has(d, k)).map((k) => `${str(d[k])} ${k}`);
	if (counts.length) rows.push({ label: 'Declared', value: counts.join(', ') });
	if (has(d, 'workingCopy')) rows.push({ label: 'Working copy', value: str(d.workingCopy) });
	if (has(d, 'codeRoot')) rows.push({ label: 'Code root', value: str(d.codeRoot) });
	return rows.length ? rows : flatten(d);
}

function doctorRows(d: Obj): Row[] {
	const rows: Row[] = [];
	if (has(d, 'ok')) {
		const fails = Number(d.failures ?? 0);
		const warns = Number(d.warnings ?? 0);
		rows.push({ label: 'Result', value: d.ok ? 'healthy' : `${fails} failure${fails === 1 ? '' : 's'}`, level: d.ok ? (warns > 0 ? 'warn' : 'ok') : 'error' });
		if (warns > 0) rows.push({ label: 'Warnings', value: str(warns), level: 'warn' });
	}
	const checks = Array.isArray(d.checks) ? (d.checks as unknown[]) : [];
	for (const c of checks) {
		const o = obj(c);
		const level = str(o.level);
		rows.push({ label: str(o.name) || str(o.kind), value: str(o.detail), level: level === 'ok' ? 'ok' : level === 'warn' || level === 'warning' ? 'warn' : level ? 'error' : undefined });
	}
	return rows.length ? rows : flatten(d);
}

function startRows(d: Obj): Row[] {
	const rows: Row[] = [];
	if (has(d, 'workspace')) rows.push({ label: 'Started', value: str(d.workspace), level: 'ok' });
	if (has(d, 'stopped')) rows.push({ label: 'Stopped', value: str(d.stopped), level: 'info' });
	const links = Array.isArray(d.links) ? (d.links as unknown[]) : [];
	for (const l of links) rows.push({ label: 'Linked', value: str(l) });
	const skipped = Array.isArray(d.skipped) ? (d.skipped as unknown[]) : [];
	for (const s of skipped) rows.push({ label: 'Skipped', value: str(s), level: 'info' });
	if (has(d, 'vscode')) rows.push({ label: 'VS Code settings', value: str(d.vscode) });
	return rows.length ? rows : flatten(d);
}

function saveRows(d: Obj): Row[] {
	const rows: Row[] = [];
	if (has(d, 'sha')) rows.push({ label: 'Commit', value: `${str(d.sha).slice(0, 10)} on ${str(d.branch)}`, level: 'ok' });
	if (has(d, 'message')) rows.push({ label: 'Message', value: str(d.message) });
	if (has(d, 'files')) rows.push({ label: 'Files', value: str(d.files) });
	if (has(d, 'pushed')) rows.push({ label: 'Pushed', value: d.pushed ? 'yes' : 'no', level: d.pushed ? 'ok' : 'warn' });
	if (has(d, 'pushError')) rows.push({ label: 'Push error', value: str(d.pushError), level: 'error' });
	if (has(d, 'note')) rows.push({ label: 'Note', value: str(d.note), level: 'info' });
	if (has(d, 'checkout')) rows.push({ label: 'Checkout', value: str(d.checkout) });
	return rows.length ? rows : flatten(d);
}

/** Generic key/value rows for an unknown shape, one level deep, arrays and objects as JSON. */
export function flatten(data: unknown): Row[] {
	if (data === null || data === undefined) return [{ label: 'Data', value: 'none', level: 'info' }];
	if (typeof data !== 'object') return [{ label: 'Data', value: str(data) }];
	if (Array.isArray(data)) return data.map((v, i) => ({ label: String(i), value: str(v) }));
	return Object.entries(data as Obj).map(([k, v]) => ({ label: k, value: str(v) }));
}
