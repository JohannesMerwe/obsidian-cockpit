// Contract C1 — workspace and project detection (SPEC-integration §C1). Reference implementation, copied by
// the other keel plugins. No 'obsidian' import. Paths are vault-relative, '/'-separated, no leading slash; '' is the vault root.

export interface VaultFiles {
	/** True when a file (not a folder) exists at this vault path. */
	exists(path: string): boolean;
	/** File contents, or null when unreadable. Only called for paths that exist. */
	read(path: string): string | null;
}

export interface Workspace {
	/** Directory holding keel.json ('' for the vault root). */
	root: string;
	/** Workspace name from keel.json, else the root directory's name. */
	name: string;
	/** Project names declared in keel.json. */
	projects: string[];
	/** Project of the note, or null when the note is workspace-level. */
	project: string | null;
}

export function dirname(path: string): string {
	const i = path.lastIndexOf('/');
	return i < 0 ? '' : path.slice(0, i);
}

export function join(dir: string, name: string): string {
	return dir === '' ? name : dir + '/' + name;
}

/** Every ancestor directory of a path, nearest first, ending with the vault root ''. */
export function ancestors(path: string): string[] {
	const out: string[] = [];
	for (let dir = dirname(path); ; dir = dirname(dir)) {
		out.push(dir);
		if (dir === '') return out;
	}
}

/** Nearest ancestor holding keel.json, else null (plain mode: hide keel features, no error). */
export function findWorkspace(notePath: string, files: VaultFiles): Workspace | null {
	for (const root of ancestors(notePath)) {
		const manifest = join(root, 'keel.json');
		if (!files.exists(manifest)) continue;
		const keel = parseManifest(files.read(manifest));
		const projects = (Array.isArray(keel.projects) ? keel.projects : [])
			.map((p: unknown) => (typeof p === 'object' && p !== null ? (p as { name?: unknown }).name : p))
			.filter((n): n is string => typeof n === 'string');
		const rest = root === '' ? notePath : notePath.slice(root.length + 1);
		const first = rest.split('/')[0] ?? '';
		const project = rest.includes('/') && projects.includes(first) ? first : null;
		const name = typeof keel.name === 'string' ? keel.name : root.split('/').pop() || 'vault';
		return { root, name, projects, project };
	}
	return null;
}

function parseManifest(json: string | null): Record<string, unknown> {
	try { const v: unknown = JSON.parse(json ?? ''); return typeof v === 'object' && v !== null ? v as Record<string, unknown> : {}; } catch { return {}; }
}
