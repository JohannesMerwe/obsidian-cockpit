// Earlier versions of a file from git, when the workspace tree is a repo. Runs only `git`
// with fixed arguments inside the vault; never touches .code/.
import type { Exec } from '../core/keel';
import { binaryCandidates } from '../core/keel';
import type { Version } from '../core/snapshots';
import { nodeEnv } from './exec';

const MAX_VERSIONS = 40;

export function findGit(): string | null {
	return binaryCandidates({ ...nodeEnv, setting: '' }, 'git').find((p) => nodeEnv.exists(p)) ?? null;
}

/**
 * Versions of `absFile` in the repo containing `cwd`, newest first, or null when `cwd` is not
 * inside a git repo (or git is missing). `readDate` extracts the Updated date of a version.
 */
export async function gitVersions(exec: Exec, cwd: string, absFile: string, readDate: (text: string) => string | null, timeoutMs: number): Promise<Version[] | null> {
	const git = findGit();
	if (!git) return null;
	const top = await exec(git, ['rev-parse', '--show-toplevel'], { cwd, timeoutMs });
	if (top.failed || top.timedOut || top.code !== 0) return null;
	const root = top.stdout.trim();
	if (!absFile.startsWith(root + '/')) return null;
	const rel = absFile.slice(root.length + 1);
	const log = await exec(git, ['log', '--format=%H', `-n${MAX_VERSIONS}`, '--', rel], { cwd: root, timeoutMs });
	if (log.failed || log.timedOut || log.code !== 0) return null;
	const out: Version[] = [];
	for (const sha of log.stdout.split('\n').map((s) => s.trim()).filter(Boolean)) {
		const show = await exec(git, ['show', `${sha}:${rel}`], { cwd: root, timeoutMs });
		if (show.failed || show.timedOut || show.code !== 0) continue;
		out.push({ date: readDate(show.stdout), text: show.stdout });
	}
	return out;
}
