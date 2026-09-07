import { DEFAULT_TIMEOUT_MS } from './core/keel';

export interface Snapshot {
	date: string;
	text: string;
}

export interface SnapshotPair {
	latest?: Snapshot;
	previous?: Snapshot;
}

/** The whole of data.json: settings plus the context.md snapshots (§C5 handoff diff). */
export interface CockpitData {
	keelPath: string;
	timeoutSeconds: number;
	snapshots: Record<string, SnapshotPair>;
}

export const DEFAULT_DATA: CockpitData = {
	keelPath: '',
	timeoutSeconds: DEFAULT_TIMEOUT_MS / 1000,
	snapshots: {},
};

export function normaliseData(raw: unknown): CockpitData {
	const o = typeof raw === 'object' && raw !== null ? (raw as Partial<CockpitData>) : {};
	return {
		keelPath: typeof o.keelPath === 'string' ? o.keelPath : DEFAULT_DATA.keelPath,
		timeoutSeconds: typeof o.timeoutSeconds === 'number' && o.timeoutSeconds > 0 ? o.timeoutSeconds : DEFAULT_DATA.timeoutSeconds,
		snapshots: typeof o.snapshots === 'object' && o.snapshots !== null ? o.snapshots : {},
	};
}
