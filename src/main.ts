import { FileSystemAdapter, Notice, Plugin, PluginSettingTab, TFile, type SettingDefinitionItem } from 'obsidian';
import { createClient, findBinary, type Envelope, type KeelClient } from './core/keel';
import { findWorkspace, join, type VaultFiles, type Workspace } from './core/workspace';
import { nodeEnv, nodeExec } from './shell/exec';
import { DEFAULT_DATA, normaliseData, type CockpitData } from './settings';
import { CockpitView, VIEW_TYPE } from './ui/view';
import { ConfirmSaveModal } from './ui/confirm';
import { checkoutsFor } from './core/repos';
import { readUpdated } from './core/context';
import { pickBaseline, recordSnapshot, type Baseline } from './core/snapshots';
import { gitVersions } from './shell/git';

export interface VerbResult {
	envelope: Envelope;
	/** Local time the verb finished, HH:MM. */
	when: string;
}

export default class KeelCockpitPlugin extends Plugin {
	settings: CockpitData = DEFAULT_DATA;
	lastResult: VerbResult | null = null;
	/** keel.json contents by vault path, filled lazily so C1 detection can stay synchronous. */
	private manifests = new Map<string, string | null>();

	async onload(): Promise<void> {
		this.settings = normaliseData(await this.loadData());
		this.addSettingTab(new CockpitSettingTab(this));

		this.registerEvent(this.app.vault.on('modify', (f) => this.forgetManifest(f.path)));
		this.registerEvent(this.app.vault.on('delete', (f) => this.forgetManifest(f.path)));
		this.registerEvent(this.app.vault.on('create', (f) => this.forgetManifest(f.path)));

		this.registerView(VIEW_TYPE, (leaf) => new CockpitView(leaf, this));
		this.addRibbonIcon('gauge', 'Open keel cockpit', () => void this.activateView());
		this.addCommand({ id: 'open', name: 'Open cockpit', callback: () => void this.activateView() });
		this.addCommand({ id: 'refresh', name: 'Refresh cockpit', callback: () => this.app.workspace.trigger('keel-cockpit:refresh') });

		const verb = (id: string, name: string, run: (ws: Workspace) => Promise<unknown>): void => {
			this.addCommand({
				id,
				name,
				checkCallback: (checking) => {
					const ws = this.currentWorkspace();
					if (!ws) return false;
					if (!checking) void run(ws);
					return true;
				},
			});
		};
		verb('status', 'Run keel status', (ws) => this.runStatus(ws));
		verb('doctor', 'Run keel doctor', (ws) => this.runDoctor(ws));
		verb('start', 'Run keel start', (ws) => this.runStart(ws));
		verb('save', 'Run keel save', (ws) => this.runSave(ws));
	}

	async activateView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
		const leaf = existing ?? this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		if (!existing) await leaf.setViewState({ type: VIEW_TYPE, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	// ---- C1 detection --------------------------------------------------------------------

	/** Workspace of the active note, else of the vault root; null means plain mode. */
	currentWorkspace(): Workspace | null {
		const active = this.app.workspace.getActiveFile();
		return this.workspaceFor(active?.path ?? 'keel.json');
	}

	workspaceFor(notePath: string): Workspace | null {
		const files: VaultFiles = {
			exists: (p) => this.app.vault.getFileByPath(p) !== null,
			read: (p) => this.readManifest(p),
		};
		return findWorkspace(notePath, files);
	}

	private readManifest(path: string): string | null {
		if (this.manifests.has(path)) return this.manifests.get(path) ?? null;
		this.manifests.set(path, null);
		const file = this.app.vault.getFileByPath(path);
		if (file instanceof TFile) {
			void this.app.vault.cachedRead(file).then((text) => {
				this.manifests.set(path, text);
				this.app.workspace.trigger('keel-cockpit:workspace-changed');
			});
		}
		return null;
	}

	private forgetManifest(path: string): void {
		if (path.endsWith('keel.json')) this.manifests.delete(path);
	}

	/** Absolute path of a vault-relative directory. Desktop only, so the adapter is FileSystemAdapter. */
	absolutePath(vaultPath: string): string {
		const adapter = this.app.vault.adapter;
		const base = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : '';
		return vaultPath === '' ? base : base + '/' + vaultPath;
	}

	// ---- keel binary and verbs --------------------------------------------------------------

	keelBinary(): string | null {
		return findBinary({ ...nodeEnv, setting: this.settings.keelPath });
	}

	client(): KeelClient | null {
		const bin = this.keelBinary();
		return bin ? createClient(nodeExec, bin, this.settings.timeoutSeconds * 1000) : null;
	}

	/** Run a keel verb in the workspace root. Errors come back as envelopes, never thrown. */
	async runVerb(ws: Workspace, args: string[]): Promise<Envelope> {
		const client = this.client();
		if (!client) {
			return { ok: false, command: args.join(' '), error: { kind: 'binary', message: 'keel binary not found on PATH; set its path in the plugin settings' } };
		}
		return client.run(this.absolutePath(ws.root), args);
	}

	/** Run a verb in a directory, remember the result, show it in the pane and as a notice. */
	private async verb(cwd: string, args: string[]): Promise<Envelope> {
		const client = this.client();
		const env: Envelope = client
			? await client.run(cwd, args)
			: { ok: false, command: args.join(' '), error: { kind: 'binary', message: 'keel binary not found on PATH; set its path in the plugin settings' } };
		const now = new Date();
		this.lastResult = { envelope: env, when: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` };
		if (env.ok) new Notice(`keel ${env.command}: ok`);
		else new Notice(`keel ${env.command} failed: ${env.error.message}`, 8000);
		await this.activateView();
		this.app.workspace.trigger('keel-cockpit:result');
		return env;
	}

	runStatus(ws: Workspace): Promise<Envelope> {
		return this.verb(this.absolutePath(ws.root), ['status']);
	}

	runDoctor(ws: Workspace): Promise<Envelope> {
		return this.verb(this.absolutePath(ws.root), ['doctor']);
	}

	async runStart(ws: Workspace): Promise<Envelope> {
		const env = await this.verb(this.absolutePath(ws.root), ['start']);
		this.app.workspace.trigger('keel-cockpit:refresh');
		return env;
	}

	/** `keel save` runs inside a checkout; the path comes from `keel repo list`, and the user confirms first. */
	async runSave(ws: Workspace): Promise<Envelope | null> {
		const list = await this.runVerb(ws, ['repo', 'list']);
		if (!list.ok) {
			new Notice(`keel repo list failed: ${list.error.message}`, 8000);
			return list;
		}
		const checkouts = checkoutsFor(list.data, ws.project);
		if (checkouts.length === 0) {
			new Notice('No bound checkout to save in; run keel doctor', 8000);
			return null;
		}
		const choice = await new ConfirmSaveModal(this.app, checkouts).ask();
		if (!choice) return null;
		const args = choice.message.trim() ? ['save', choice.message.trim()] : ['save'];
		const env = await this.verb(choice.checkout.path, args);
		if (env.ok && typeof env.data === 'object' && env.data !== null) (env.data as Record<string, unknown>).checkout ??= choice.checkout.path;
		return env;
	}

	contextPath(ws: Workspace): string {
		return join(ws.root, '.keel/context.md');
	}

	// ---- handoff diff (§C5) -------------------------------------------------------------------

	private snapshotKey(ws: Workspace): string {
		return ws.root === '' ? '.' : ws.root;
	}

	/** Remember the file as read, rotating when its Updated date moved on. */
	async recordContext(ws: Workspace, text: string): Promise<void> {
		const key = this.snapshotKey(ws);
		const r = recordSnapshot(this.settings.snapshots[key] ?? {}, readUpdated(text), text);
		if (!r.changed) return;
		this.settings.snapshots[key] = r.pair;
		await this.saveData(this.settings);
	}

	/** The version to diff against: from git when the tree is a repo, else the stored snapshot. */
	async contextBaseline(ws: Workspace, text: string): Promise<Baseline | null> {
		const date = readUpdated(text);
		const cwd = this.absolutePath(ws.root);
		const history = await gitVersions(nodeExec, cwd, this.absolutePath(this.contextPath(ws)), readUpdated, this.settings.timeoutSeconds * 1000);
		return pickBaseline(history, this.settings.snapshots[this.snapshotKey(ws)] ?? {}, date);
	}
}

class CockpitSettingTab extends PluginSettingTab {
	constructor(readonly plugin: KeelCockpitPlugin) {
		super(plugin.app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Keel binary',
				desc: 'Full path to the keel executable. Tried after PATH, which is often minimal for a desktop app. Leave empty to search PATH and the usual install locations.',
				control: { type: 'text', key: 'keelPath', placeholder: '/usr/local/bin/keel', defaultValue: DEFAULT_DATA.keelPath },
			},
			{
				name: 'Timeout',
				desc: 'Seconds to wait for a keel command before giving up.',
				control: { type: 'number', key: 'timeoutSeconds', min: 1, max: 600, step: 1, defaultValue: DEFAULT_DATA.timeoutSeconds },
			},
		];
	}
}
