import { describe, expect, it } from 'vitest';
import { ancestors, findWorkspace, type VaultFiles } from './workspace';

const vault = (files: Record<string, string>): VaultFiles => ({
	exists: (p) => p in files,
	read: (p) => files[p] ?? null,
});

const manifest = JSON.stringify({ name: 'obsidian', projects: [{ name: 'cockpit-plugin' }, { name: 'board-plugin' }] });

describe('C1 detection', () => {
	it('lists ancestors nearest first, ending at the vault root', () => {
		expect(ancestors('a/b/c.md')).toEqual(['a/b', 'a', '']);
		expect(ancestors('c.md')).toEqual(['']);
	});

	it('finds the nearest keel.json and the project', () => {
		const ws = findWorkspace('obsidian/cockpit-plugin/INDEX.md', vault({ 'obsidian/keel.json': manifest }));
		expect(ws).toEqual({ root: 'obsidian', name: 'obsidian', projects: ['cockpit-plugin', 'board-plugin'], project: 'cockpit-plugin' });
	});

	it('treats notes outside a declared project as workspace-level', () => {
		const ws = findWorkspace('obsidian/specs/SPEC.md', vault({ 'obsidian/keel.json': manifest }));
		expect(ws?.project).toBeNull();
		expect(findWorkspace('obsidian/INDEX.md', vault({ 'obsidian/keel.json': manifest }))?.project).toBeNull();
	});

	it('is plain mode without keel.json', () => {
		expect(findWorkspace('notes/x.md', vault({}))).toBeNull();
	});

	it('handles a vault root workspace and unreadable manifests', () => {
		const ws = findWorkspace('p/x.md', vault({ 'keel.json': '{bad' }));
		expect(ws).toEqual({ root: '', name: 'vault', projects: [], project: null });
	});
});
