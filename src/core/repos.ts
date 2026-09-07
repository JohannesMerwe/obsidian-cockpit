// Checkout paths from `keel repo list --json` (SPEC-integration §C1: the local path comes
// from keel, never from the vault). No 'obsidian' import.

export interface Checkout {
	project: string;
	url: string;
	path: string;
}

interface RepoEntry {
	id?: unknown;
	url?: unknown;
}

interface ProjectEntry {
	name?: unknown;
	repos?: unknown;
	checkouts?: unknown;
}

/** Every bound checkout in the repo list, in declaration order. */
export function listCheckouts(data: unknown): Checkout[] {
	const out: Checkout[] = [];
	const projects = (data as { projects?: unknown } | null)?.projects;
	if (!Array.isArray(projects)) return out;
	for (const p of projects as ProjectEntry[]) {
		if (typeof p.name !== 'string' || !Array.isArray(p.repos)) continue;
		const checkouts = typeof p.checkouts === 'object' && p.checkouts !== null ? (p.checkouts as Record<string, unknown>) : {};
		for (const r of p.repos as RepoEntry[]) {
			if (typeof r.id !== 'string') continue;
			const path = checkouts[r.id];
			if (typeof path !== 'string' || !path) continue;
			out.push({ project: p.name, url: typeof r.url === 'string' ? r.url : '', path });
		}
	}
	return out;
}

/** Checkouts to offer for `keel save`: the note's project first, then the rest. */
export function checkoutsFor(data: unknown, project: string | null): Checkout[] {
	const all = listCheckouts(data);
	if (!project) return all;
	return [...all.filter((c) => c.project === project), ...all.filter((c) => c.project !== project)];
}

/** Short label for a checkout: `project · repo-name`. */
export function checkoutLabel(c: Checkout): string {
	const repo = c.path.slice(c.path.lastIndexOf('/') + 1);
	return `${c.project} · ${repo}`;
}
