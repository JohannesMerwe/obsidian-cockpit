// The keel CLI seam: binary discovery, the --json envelope, and a runner with a timeout.
// No 'obsidian' import. Process execution is injected (see src/shell/exec.ts).

export interface KeelError {
	kind: string;
	message: string;
}

export type Envelope<T = unknown> =
	| { ok: true; command: string; seq?: number; data: T }
	| { ok: false; command: string; error: KeelError };

export interface ExecResult {
	stdout: string;
	stderr: string;
	/** Exit code, or null when the process did not exit normally. */
	code: number | null;
	timedOut: boolean;
	/** Set when the process could not be started at all. */
	failed?: string;
}

export interface ExecOptions {
	cwd: string;
	timeoutMs: number;
}

export type Exec = (bin: string, args: string[], opts: ExecOptions) => Promise<ExecResult>;

export const DEFAULT_TIMEOUT_MS = 20_000;

/** Directories tried after PATH and the setting, for a GUI process with a minimal PATH. */
export const WELL_KNOWN_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '~/go/bin', '~/.local/bin'];

export interface BinaryLookup {
	/** PATH as the process sees it, ':'-separated (';' on Windows). */
	pathEnv: string;
	/** The user's explicit setting; '' when unset. */
	setting: string;
	home: string;
	platform: string;
	exists(path: string): boolean;
}

/** Candidate paths in the order they are tried: PATH, then the setting, then well-known dirs. */
export function binaryCandidates(l: BinaryLookup, base = 'keel'): string[] {
	const sep = l.platform === 'win32' ? ';' : ':';
	const name = l.platform === 'win32' ? base + '.exe' : base;
	const expand = (p: string): string => (p.startsWith('~/') ? l.home + p.slice(1) : p);
	const out: string[] = [];
	for (const dir of l.pathEnv.split(sep)) if (dir) out.push(expand(dir) + '/' + name);
	if (l.setting.trim()) out.push(expand(l.setting.trim()));
	for (const dir of WELL_KNOWN_DIRS) out.push(expand(dir) + '/' + name);
	return out.filter((p, i, a) => a.indexOf(p) === i);
}

/** First existing candidate, or null when keel is not installed anywhere we look. */
export function findBinary(l: BinaryLookup): string | null {
	return binaryCandidates(l).find((p) => l.exists(p)) ?? null;
}

function isEnvelope(v: unknown): v is Envelope {
	if (typeof v !== 'object' || v === null) return false;
	const o = v as Record<string, unknown>;
	if (typeof o.ok !== 'boolean' || typeof o.command !== 'string') return false;
	if (o.ok) return 'data' in o;
	const e = o.error as Record<string, unknown> | undefined;
	return typeof e === 'object' && e !== null && typeof e.message === 'string';
}

/** Parse stdout as an envelope. keel prints the envelope even on failure (exit 1). */
export function parseEnvelope(stdout: string, command: string): Envelope | null {
	const text = stdout.trim();
	if (!text) return null;
	try {
		const v: unknown = JSON.parse(text);
		if (isEnvelope(v)) return v;
	} catch {
		/* fall through */
	}
	// keeld may print a notice line before the envelope; try from the first brace.
	const i = text.indexOf('{');
	if (i > 0) return parseEnvelope(text.slice(i), command);
	return null;
}

/** Turn an exec result into an envelope, never throwing. */
export function toEnvelope(result: ExecResult, command: string, timeoutMs: number): Envelope {
	if (result.failed) return { ok: false, command, error: { kind: 'exec', message: result.failed } };
	if (result.timedOut) {
		const within = timeoutMs >= 1000 ? `${Math.round(timeoutMs / 1000)} s` : `${timeoutMs} ms`;
		return { ok: false, command, error: { kind: 'timeout', message: `keel ${command} did not finish within ${within}` } };
	}
	const parsed = parseEnvelope(result.stdout, command);
	if (parsed) return parsed;
	const message = result.stderr.trim() || result.stdout.trim() || `keel ${command} exited with code ${String(result.code)} and no envelope`;
	return { ok: false, command, error: { kind: 'exec', message } };
}

export interface KeelClient {
	/** Run `keel <args...> --json` in cwd. Resolves to an envelope; never rejects. */
	run(cwd: string, args: string[]): Promise<Envelope>;
}

export function createClient(exec: Exec, bin: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): KeelClient {
	return {
		async run(cwd, args) {
			const command = args.join(' ');
			let result: ExecResult;
			try {
				result = await exec(bin, [...args, '--json'], { cwd, timeoutMs });
			} catch (e) {
				result = { stdout: '', stderr: '', code: null, timedOut: false, failed: e instanceof Error ? e.message : String(e) };
			}
			return toEnvelope(result, command, timeoutMs);
		},
	};
}
