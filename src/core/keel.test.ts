import { describe, expect, it } from 'vitest';
import { binaryCandidates, createClient, findBinary, parseEnvelope, toEnvelope, type ExecResult } from './keel';

const lookup = (overrides: Partial<Parameters<typeof findBinary>[0]> = {}) => ({
	pathEnv: '/usr/bin:/bin',
	setting: '',
	home: '/home/me',
	platform: 'darwin',
	exists: () => false,
	...overrides,
});

describe('binary discovery', () => {
	it('tries PATH first, then the setting, then well-known dirs', () => {
		const c = binaryCandidates(lookup({ setting: '~/bin/keel' }));
		expect(c.slice(0, 3)).toEqual(['/usr/bin/keel', '/bin/keel', '/home/me/bin/keel']);
		expect(c).toContain('/opt/homebrew/bin/keel');
		expect(c).toContain('/home/me/go/bin/keel');
	});

	it('finds the first existing candidate', () => {
		const found = findBinary(lookup({ exists: (p) => p === '/home/me/go/bin/keel' }));
		expect(found).toBe('/home/me/go/bin/keel');
	});

	it('returns null when keel is nowhere', () => {
		expect(findBinary(lookup())).toBeNull();
	});

	it('uses keel.exe and ; on windows', () => {
		const c = binaryCandidates(lookup({ platform: 'win32', pathEnv: 'C:\\a;C:\\b' }));
		expect(c[0]).toBe('C:\\a/keel.exe');
	});
});

describe('envelope parsing', () => {
	it('parses an ok envelope', () => {
		const env = parseEnvelope('{"ok":true,"command":"status","data":{"head":1}}', 'status');
		expect(env).toEqual({ ok: true, command: 'status', data: { head: 1 } });
	});

	it('parses an error envelope', () => {
		const env = parseEnvelope('{"ok":false,"command":"status","error":{"kind":"workspace","message":"no keel.json here"}}', 'status');
		expect(env?.ok).toBe(false);
		if (env && !env.ok) expect(env.error.kind).toBe('workspace');
	});

	it('skips a notice line before the envelope', () => {
		const env = parseEnvelope('keeld started\n{"ok":true,"command":"x","data":null}', 'x');
		expect(env?.ok).toBe(true);
	});

	it('rejects non-envelopes', () => {
		expect(parseEnvelope('not json', 'x')).toBeNull();
		expect(parseEnvelope('{"foo":1}', 'x')).toBeNull();
		expect(parseEnvelope('', 'x')).toBeNull();
	});
});

describe('toEnvelope', () => {
	const base: ExecResult = { stdout: '', stderr: '', code: 0, timedOut: false };

	it('turns a timeout into an error envelope', () => {
		const env = toEnvelope({ ...base, timedOut: true }, 'doctor', 5000);
		expect(env.ok).toBe(false);
		if (!env.ok) expect(env.error.kind).toBe('timeout');
	});

	it('turns a failed start into an error envelope', () => {
		const env = toEnvelope({ ...base, failed: 'cannot run /x/keel: ENOENT' }, 'doctor', 5000);
		if (!env.ok) expect(env.error.message).toContain('ENOENT');
	});

	it('prefers the envelope on stdout even when the exit code is 1', () => {
		const env = toEnvelope({ ...base, code: 1, stdout: '{"ok":false,"command":"save","error":{"kind":"git","message":"nothing to commit"}}', stderr: 'keel: nothing to commit' }, 'save', 5000);
		if (!env.ok) expect(env.error.kind).toBe('git');
	});

	it('falls back to stderr when there is no envelope', () => {
		const env = toEnvelope({ ...base, code: 2, stderr: 'boom' }, 'save', 5000);
		if (!env.ok) expect(env.error.message).toBe('boom');
	});
});

describe('client', () => {
	it('appends --json and runs in cwd', async () => {
		const calls: unknown[] = [];
		const client = createClient(async (bin, args, opts) => {
			calls.push([bin, args, opts.cwd]);
			return { stdout: '{"ok":true,"command":"status","data":{}}', stderr: '', code: 0, timedOut: false };
		}, '/bin/keel', 1000);
		const env = await client.run('/ws', ['status']);
		expect(env.ok).toBe(true);
		expect(calls).toEqual([['/bin/keel', ['status', '--json'], '/ws']]);
	});

	it('never rejects', async () => {
		const client = createClient(() => Promise.reject(new Error('spawn failed')), '/bin/keel');
		const env = await client.run('/ws', ['status']);
		expect(env.ok).toBe(false);
		if (!env.ok) expect(env.error.message).toBe('spawn failed');
	});
});
