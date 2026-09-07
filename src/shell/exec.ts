// Node adapter for src/core/keel.ts. Desktop only; the plugin never runs anything but keel.
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import type { Exec, ExecResult } from '../core/keel';

export const nodeExec: Exec = (bin, args, opts) =>
	new Promise<ExecResult>((resolve) => {
		execFile(
			bin,
			args,
			{ cwd: opts.cwd, timeout: opts.timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
			(error, stdout, stderr) => {
				const err = error as (NodeJS.ErrnoException & { killed?: boolean; code?: number | string; signal?: string }) | null;
				if (err && (err.code === 'ENOENT' || err.code === 'EACCES')) {
					resolve({ stdout: '', stderr: '', code: null, timedOut: false, failed: `cannot run ${bin}: ${err.code}` });
					return;
				}
				resolve({
					stdout: String(stdout),
					stderr: String(stderr),
					code: err ? (typeof err.code === 'number' ? err.code : null) : 0,
					timedOut: !!err?.killed && err.signal === 'SIGTERM',
				});
			},
		);
	});

export const nodeEnv = {
	pathEnv: process.env.PATH ?? '',
	home: homedir(),
	platform: process.platform,
	exists: (p: string): boolean => existsSync(p),
};
