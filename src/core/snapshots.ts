// Which earlier version of .keel/context.md to diff against (SPEC-integration §C5): the one
// from before the current `Updated:` date. Sources: git history, else the plugin's own copies.
// No 'obsidian' import.

export interface Version {
	/** The `Updated:` date of that version, or null when it had none. */
	date: string | null;
	text: string;
}

export interface SnapshotPair {
	/** The newest version seen, with the current Updated date. */
	latest?: Version;
	/** The last version with an earlier Updated date: the diff base. */
	previous?: Version;
}

export interface Baseline extends Version {
	source: 'git' | 'snapshot';
}

const key = (d: string | null): string => d ?? '';

/**
 * Fold the file as read now into the stored pair. Same date as `latest` ⇒ the session is still
 * going: refresh `latest`. A newer date ⇒ rotate `latest` into `previous`. Returns whether
 * the pair changed, so the caller can skip a save.
 */
export function recordSnapshot(pair: SnapshotPair, date: string | null, text: string): { pair: SnapshotPair; changed: boolean } {
	const cur = { date, text };
	if (!pair.latest) return { pair: { ...pair, latest: cur }, changed: true };
	if (key(pair.latest.date) === key(date)) {
		if (pair.latest.text === text) return { pair, changed: false };
		return { pair: { ...pair, latest: cur }, changed: true };
	}
	if (key(pair.latest.date) < key(date)) return { pair: { previous: pair.latest, latest: cur }, changed: true };
	// The date went backwards (file restored?): keep the newer as latest, treat this as previous.
	return { pair: { ...pair, previous: cur }, changed: true };
}

/** From newest to oldest, the first version whose Updated date is before `date`. */
export function baselineFromHistory(versions: Version[], date: string | null): Version | null {
	const now = key(date);
	for (const v of versions) {
		if (key(v.date) < now) return v;
	}
	return null;
}

/** git first when it has a suitable version, else the stored previous snapshot. */
export function pickBaseline(history: Version[] | null, pair: SnapshotPair, date: string | null): Baseline | null {
	const fromGit = history ? baselineFromHistory(history, date) : null;
	if (fromGit) return { ...fromGit, source: 'git' };
	if (pair.previous) return { ...pair.previous, source: 'snapshot' };
	return null;
}
