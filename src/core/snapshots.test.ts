import { describe, expect, it } from 'vitest';
import { baselineFromHistory, pickBaseline, recordSnapshot } from './snapshots';

describe('recordSnapshot', () => {
	it('starts with latest only', () => {
		const r = recordSnapshot({}, '2026-09-07', 'v1');
		expect(r).toEqual({ pair: { latest: { date: '2026-09-07', text: 'v1' } }, changed: true });
	});

	it('refreshes latest on the same date and skips saves when unchanged', () => {
		const pair = { latest: { date: '2026-09-07', text: 'v1' } };
		expect(recordSnapshot(pair, '2026-09-07', 'v1').changed).toBe(false);
		const r = recordSnapshot(pair, '2026-09-07', 'v1b');
		expect(r.changed).toBe(true);
		expect(r.pair.latest?.text).toBe('v1b');
		expect(r.pair.previous).toBeUndefined();
	});

	it('rotates latest into previous on a newer date', () => {
		const pair = { latest: { date: '2026-09-07', text: 'v1' }, previous: { date: '2026-09-01', text: 'v0' } };
		const r = recordSnapshot(pair, '2026-09-08', 'v2');
		expect(r.pair).toEqual({ previous: { date: '2026-09-07', text: 'v1' }, latest: { date: '2026-09-08', text: 'v2' } });
	});

	it('treats a missing date as the earliest', () => {
		const r = recordSnapshot({ latest: { date: null, text: 'v0' } }, '2026-09-07', 'v1');
		expect(r.pair.previous?.text).toBe('v0');
	});
});

describe('baselines', () => {
	const history = [
		{ date: '2026-09-07', text: 'c' },
		{ date: '2026-09-07', text: 'b' },
		{ date: '2026-09-05', text: 'a' },
	];

	it('takes the newest version dated before the current date', () => {
		expect(baselineFromHistory(history, '2026-09-07')?.text).toBe('a');
		expect(baselineFromHistory(history, '2026-09-05')).toBeNull();
	});

	it('prefers git, then the stored previous snapshot', () => {
		const pair = { previous: { date: '2026-09-06', text: 'p' } };
		expect(pickBaseline(history, pair, '2026-09-07')?.source).toBe('git');
		expect(pickBaseline(null, pair, '2026-09-07')).toEqual({ date: '2026-09-06', text: 'p', source: 'snapshot' });
		expect(pickBaseline([], {}, '2026-09-07')).toBeNull();
	});
});
