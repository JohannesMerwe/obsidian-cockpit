import type { EventRef } from 'obsidian';

declare module 'obsidian' {
	interface Workspace {
		on(name: 'keel-cockpit:workspace-changed', callback: () => unknown, ctx?: unknown): EventRef;
		on(name: 'keel-cockpit:refresh', callback: () => unknown, ctx?: unknown): EventRef;
		trigger(name: 'keel-cockpit:workspace-changed'): void;
		trigger(name: 'keel-cockpit:refresh'): void;
	}
}
