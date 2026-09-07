import { describe, expect, it } from 'vitest';
import { flatten, summarise } from './summary';

describe('summarise', () => {
	it('shows an error envelope as one error row', () => {
		expect(summarise({ ok: false, command: 'status', error: { kind: 'workspace', message: 'no keel.json here' } })).toEqual([{ label: 'workspace', value: 'no keel.json here', level: 'error' }]);
	});

	it('summarises status', () => {
		const rows = summarise({ ok: true, command: 'status', data: { workspace: { name: 'obsidian' }, active: true, head: 20, lastAppliedSeq: 20, behind: 0, projects: 5, repos: 5, boards: 0, workingCopy: '/w', codeRoot: '/c' } });
		expect(rows.map((r) => r.label)).toEqual(['Workspace', 'Active', 'Head', 'Behind', 'Declared', 'Working copy', 'Code root']);
		expect(rows[3]).toEqual({ label: 'Behind', value: '0', level: 'ok' });
		expect(rows[4]?.value).toBe('5 projects, 5 repos, 0 boards');
	});

	it('summarises doctor with a row per check', () => {
		const rows = summarise({ ok: true, command: 'doctor', data: { ok: false, failures: 1, warnings: 1, checks: [{ kind: 'tree', name: 'tree', level: 'ok', detail: 'clean' }, { kind: 'repo', name: 'a/b', level: 'fail', detail: 'missing' }] } });
		expect(rows[0]).toEqual({ label: 'Result', value: '1 failure', level: 'error' });
		expect(rows[1]).toEqual({ label: 'Warnings', value: '1', level: 'warn' });
		expect(rows[2]?.level).toBe('ok');
		expect(rows[3]).toEqual({ label: 'a/b', value: 'missing', level: 'error' });
	});

	it('summarises start and save', () => {
		const start = summarise({ ok: true, command: 'start', seq: 27, data: { workspace: 'obsidian', links: null, skipped: ['claude: nothing'], vscode: '/v', stopped: 'pangolin', seq: 27 } });
		expect(start.map((r) => r.label)).toEqual(['Started', 'Stopped', 'Skipped', 'VS Code settings']);
		const save = summarise({ ok: true, command: 'save', seq: 3, data: { sha: '0123456789abcdef', branch: 'main', message: 'm', files: 2, pushed: false, pushError: 'offline' } });
		expect(save[0]).toEqual({ label: 'Commit', value: '0123456789 on main', level: 'ok' });
		expect(save.find((r) => r.label === 'Pushed')?.level).toBe('warn');
		expect(save.find((r) => r.label === 'Push error')?.level).toBe('error');
	});

	it('falls back to key/value rows for unknown shapes', () => {
		expect(summarise({ ok: true, command: 'repo list', data: { a: 1, b: [1, 2] } })).toEqual([{ label: 'a', value: '1' }, { label: 'b', value: '[1,2]' }]);
		expect(flatten(null)[0]?.value).toBe('none');
		expect(flatten([true])).toEqual([{ label: '0', value: 'true' }]);
	});
});
