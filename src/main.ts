import { FileSystemAdapter, Notice, Plugin, PluginSettingTab, TFile, type SettingDefinitionItem } from 'obsidian';
import { createClient, findBinary, type Envelope, type KeelClient } from './core/keel';
import { findWorkspace, join, type VaultFiles, type Workspace } from './core/workspace';
import { nodeEnv, nodeExec } from './shell/exec';
import { DEFAULT_DATA, normaliseData, type CockpitData } from './settings';
import { CockpitView, VIEW_TYPE } from './ui/view';

export default class KeelCockpitPlugin extends Plugin {
	settings: CockpitData = DEFAULT_DATA;
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

		this.addCommand({
			id: 'status',
			name: 'Show keel status',
			checkCallback: (checking) => {
				const ws = this.currentWorkspace();
				if (!ws) return false;
				if (!checking) void this.runVerb(ws, ['status']).then((env) => this.notify(env, ws));
				return true;
			},
		});
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

	notify(env: Envelope, ws: Workspace): void {
		if (env.ok) new Notice(`keel ${env.command}: ok (${ws.name})`);
		else new Notice(`keel ${env.command} failed: ${env.error.message}`, 8000);
	}

	contextPath(ws: Workspace): string {
		return join(ws.root, '.keel/context.md');
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
