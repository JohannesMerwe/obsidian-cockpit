import { describe, expect, it } from 'vitest';
import { checkoutLabel, checkoutsFor, listCheckouts } from './repos';

const data = {
	workspace: 'obsidian',
	projects: [
		{ name: 'board-plugin', repos: [{ id: 'rp_1', url: 'git@github.com:x/obsidian-board.git' }], checkouts: { rp_1: '/code/board-plugin/obsidian-board' } },
		{ name: 'cockpit-plugin', repos: [{ id: 'rp_2', url: 'git@github.com:x/obsidian-cockpit.git' }], checkouts: { rp_2: '/code/cockpit-plugin/obsidian-cockpit' } },
		{ name: 'unbound', repos: [{ id: 'rp_3', url: 'u' }], checkouts: {} },
	],
};

describe('checkouts', () => {
	it('lists bound checkouts only', () => {
		expect(listCheckouts(data).map((c) => c.project)).toEqual(['board-plugin', 'cockpit-plugin']);
	});

	it('puts the note project first', () => {
		expect(checkoutsFor(data, 'cockpit-plugin').map((c) => c.project)).toEqual(['cockpit-plugin', 'board-plugin']);
		expect(checkoutsFor(data, null).map((c) => c.project)).toEqual(['board-plugin', 'cockpit-plugin']);
	});

	it('tolerates junk', () => {
		expect(listCheckouts(null)).toEqual([]);
		expect(listCheckouts({ projects: [{ name: 1 }, { name: 'x', repos: 'no' }] })).toEqual([]);
	});

	it('labels project and repo directory', () => {
		expect(checkoutLabel({ project: 'cockpit-plugin', url: '', path: '/code/cockpit-plugin/obsidian-cockpit' })).toBe('cockpit-plugin · obsidian-cockpit');
	});
});
