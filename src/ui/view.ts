import { ItemView, MarkdownRenderer, Notice, TFile, type WorkspaceLeaf } from 'obsidian';
import type KeelCockpitPlugin from '../main';
import { addOpenQuestionsHeading, isOpenQuestionsHeading, parseContext, type ContextFile, type Link, type OpenQuestion } from '../core/context';
import { unansweredQuestions, type QuestionBlock } from '../core/questions';
import { summarise } from '../core/summary';
import type { Envelope } from '../core/keel';
import { diffLines, diffStats, toHunks } from '../core/diff';
import { join, type Workspace } from '../core/workspace';

export const VIEW_TYPE = 'keel-cockpit';

interface FoundQuestion extends QuestionBlock {
	path: string;
}

export class CockpitView extends ItemView {
	navigation = false;
	/** The workspace the pane shows; kept when the active file has none so the pane stays useful. */
	private ws: Workspace | null = null;
	private contextMtime = 0;
	private resultEl: HTMLElement | null = null;
	private rendering = false;
	private dirty = false;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: KeelCockpitPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Keel cockpit';
	}

	getIcon(): string {
		return 'gauge';
	}

	async onOpen(): Promise<void> {
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => void this.follow()));
		this.registerEvent(this.app.workspace.on('keel-cockpit:workspace-changed', () => void this.follow(true)));
		this.registerEvent(this.app.workspace.on('keel-cockpit:refresh', () => void this.refresh()));
		this.registerEvent(this.app.workspace.on('keel-cockpit:result', () => this.renderResult()));
		this.registerInterval(window.setInterval(() => void this.pollContext(), 30_000));
		this.registerDomEvent(this.contentEl, 'click', (e) => this.onClick(e));
		await this.follow(true);
	}

	/** Switch to the active file's workspace when it has one; re-render when it changed. */
	private async follow(force = false): Promise<void> {
		const next = this.plugin.currentWorkspace() ?? this.ws;
		const changed = next?.root !== this.ws?.root || next?.project !== this.ws?.project;
		this.ws = next;
		if (changed || force) await this.refresh();
	}

	private async pollContext(): Promise<void> {
		if (!this.ws) return;
		const stat = await this.app.vault.adapter.stat(this.plugin.contextPath(this.ws));
		if ((stat?.mtime ?? 0) !== this.contextMtime) await this.refresh();
	}

	async refresh(): Promise<void> {
		if (this.rendering) {
			this.dirty = true;
			return;
		}
		this.rendering = true;
		try {
			await this.render();
		} finally {
			this.rendering = false;
			if (this.dirty) {
				this.dirty = false;
				await this.refresh();
			}
		}
	}

	private async render(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass('keel-cockpit');
		const ws = this.ws;
		if (!ws) {
			root.createEl('p', { cls: 'keel-cockpit-muted', text: 'No keel workspace here. Open a note under a folder with keel.json.' });
			return;
		}
		this.renderHeader(root, ws);
		this.resultEl = root.createDiv({ cls: 'keel-cockpit-result' });
		this.renderResult();
		const contextPath = this.plugin.contextPath(ws);
		const adapter = this.app.vault.adapter;
		const stat = await adapter.stat(contextPath);
		this.contextMtime = stat?.mtime ?? 0;
		let text: string | null = null;
		if (stat?.type === 'file') {
			try {
				text = await adapter.read(contextPath);
			} catch (e) {
				new Notice(`Keel cockpit: cannot read ${contextPath}: ${e instanceof Error ? e.message : String(e)}`);
			}
		}
		this.renderContext(root, ws, contextPath, text);
		if (text !== null) {
			await this.plugin.recordContext(ws, text);
			await this.renderDiff(root, ws, text);
		}
		await this.renderQuestions(root, ws);
		await this.renderDotfolders(root, ws);
	}

	// ---- header --------------------------------------------------------------------------

	private renderHeader(root: HTMLElement, ws: Workspace): void {
		const head = root.createDiv({ cls: 'keel-cockpit-header' });
		head.createEl('h4', { text: ws.name, cls: 'keel-cockpit-title' });
		const meta = head.createDiv({ cls: 'keel-cockpit-muted' });
		meta.createSpan({ text: ws.root === '' ? 'vault root' : ws.root });
		if (ws.project) meta.createSpan({ text: ` · ${ws.project}` });
		const bin = this.plugin.keelBinary();
		meta.createDiv({ text: bin ? `keel: ${bin}` : 'keel binary not found; set its path in settings', cls: bin ? '' : 'keel-cockpit-warn' });
		const actions = head.createDiv({ cls: 'keel-cockpit-actions' });
		const verb = (label: string, run: () => Promise<unknown>): void => {
			const btn = actions.createEl('button', { text: label });
			btn.disabled = !bin;
			btn.addEventListener('click', () => {
				btn.disabled = true;
				void run().finally(() => (btn.disabled = !this.plugin.keelBinary()));
			});
		};
		verb('Status', () => this.plugin.runStatus(ws));
		verb('Doctor', () => this.plugin.runDoctor(ws));
		verb('Start', () => this.plugin.runStart(ws));
		verb('Save…', () => this.plugin.runSave(ws));
		actions.createEl('button', { text: 'Refresh' }).addEventListener('click', () => void this.refresh());
	}

	// ---- last verb result ---------------------------------------------------------------------

	private renderResult(): void {
		const el = this.resultEl;
		if (!el) return;
		el.empty();
		const last = this.plugin.lastResult;
		if (!last) return;
		const env: Envelope = last.envelope;
		const head = el.createDiv({ cls: 'keel-cockpit-result-head' });
		head.createSpan({ cls: `keel-cockpit-badge keel-cockpit-badge-${env.ok ? 'ok' : 'error'}`, text: env.ok ? 'ok' : 'failed' });
		head.createSpan({ text: ` keel ${env.command}` });
		head.createSpan({ cls: 'keel-cockpit-muted', text: ` · ${last.when}${env.ok && env.seq !== undefined ? ` · seq ${env.seq}` : ''}` });
		const table = el.createEl('table', { cls: 'keel-cockpit-rows' });
		for (const row of summarise(env)) {
			const tr = table.createEl('tr', { cls: row.level ? `keel-cockpit-level-${row.level}` : '' });
			tr.createEl('th', { text: row.label });
			tr.createEl('td', { text: row.value });
		}
		const raw = el.createEl('details', { cls: 'keel-cockpit-raw' });
		raw.createEl('summary', { text: 'Raw JSON' });
		raw.createEl('pre', { text: JSON.stringify(env, null, 2) });
	}

	// ---- context.md -----------------------------------------------------------------------

	private renderContext(root: HTMLElement, ws: Workspace, contextPath: string, text: string | null): void {
		const box = root.createDiv({ cls: 'keel-cockpit-context' });
		if (text === null) {
			box.createEl('p', { cls: 'keel-cockpit-muted', text: `No ${contextPath} yet. keel writes it; run keel start in the workspace.` });
			return;
		}
		const ctx = parseContext(text);
		const title = box.createDiv({ cls: 'keel-cockpit-section-title' });
		title.createEl('strong', { text: ctx.title || 'Context' });
		title.createSpan({ cls: 'keel-cockpit-muted', text: ctx.updated ? ` · updated ${ctx.updated}` : ' · no Updated date' });
		if (ctx.preamble) void this.renderMarkdown(box.createDiv({ cls: 'keel-cockpit-preamble' }), ctx.preamble, contextPath);

		for (const section of ctx.sections) {
			const details = box.createEl('details', { cls: 'keel-cockpit-section' });
			details.open = true;
			details.createEl('summary', { text: section.heading });
			const body = details.createDiv({ cls: 'keel-cockpit-section-body' });
			if (isOpenQuestionsHeading(section.heading)) this.renderOpenQuestions(body, ctx, contextPath);
			else if (section.body) void this.renderMarkdown(body, section.body, contextPath);
			else body.createEl('p', { cls: 'keel-cockpit-muted', text: 'Empty' });
		}

		if (ctx.openQuestions === null) {
			const missing = box.createDiv({ cls: 'keel-cockpit-section keel-cockpit-missing' });
			missing.createSpan({ text: 'No open questions heading. ' });
			const btn = missing.createEl('button', { text: 'Add heading' });
			btn.addEventListener('click', () => void this.addHeading(contextPath));
		}
	}

	private renderOpenQuestions(el: HTMLElement, ctx: ContextFile, sourcePath: string): void {
		const items = ctx.openQuestions ?? [];
		if (items.length === 0) {
			el.createEl('p', { cls: 'keel-cockpit-muted', text: 'None' });
			return;
		}
		const ul = el.createEl('ul', { cls: 'keel-cockpit-links' });
		for (const item of items) this.renderQuestionItem(ul.createEl('li'), item, sourcePath);
	}

	private renderQuestionItem(li: HTMLElement, item: OpenQuestion, sourcePath: string): void {
		const first = item.links[0];
		if (!first) {
			void this.renderMarkdown(li, item.text, sourcePath);
			return;
		}
		this.link(li, first, sourcePath, first.text || first.target);
		const rest = item.text.replace(/\[[^\]]*\]\([^)]*\)|\[\[[^\]]*\]\]/, '').trim();
		if (rest) li.createSpan({ cls: 'keel-cockpit-muted', text: ' ' + rest });
	}

	private link(parent: HTMLElement, link: Link, sourcePath: string, text: string): HTMLAnchorElement {
		const a = parent.createEl('a', { text, cls: 'internal-link', href: link.target });
		a.dataset.href = link.target;
		a.dataset.source = sourcePath;
		return a;
	}

	private async addHeading(contextPath: string): Promise<void> {
		const adapter = this.app.vault.adapter;
		try {
			const before = await adapter.read(contextPath);
			const after = addOpenQuestionsHeading(before);
			if (after !== before) await adapter.write(contextPath, after);
			new Notice('Added the open questions heading to context.md');
		} catch (e) {
			new Notice(`Keel cockpit: cannot update ${contextPath}: ${e instanceof Error ? e.message : String(e)}`);
		}
		await this.refresh();
	}

	// ---- handoff diff ----------------------------------------------------------------------

	private async renderDiff(root: HTMLElement, ws: Workspace, text: string): Promise<void> {
		const details = root.createEl('details', { cls: 'keel-cockpit-section' });
		details.open = true;
		const summary = details.createEl('summary', { text: 'Handoff diff' });
		const body = details.createDiv({ cls: 'keel-cockpit-section-body' });
		const base = await this.plugin.contextBaseline(ws, text);
		if (!base) {
			body.createEl('p', { cls: 'keel-cockpit-muted', text: 'No earlier version yet. The diff appears once context.md has been seen under a previous Updated date, or from git history when the tree is a repo.' });
			return;
		}
		const lines = diffLines(base.text, text);
		const stats = diffStats(lines);
		const current = parseContext(text).updated ?? 'undated';
		summary.setText(`Handoff diff · ${base.date ?? 'undated'} → ${current} · +${stats.added} −${stats.removed}`);
		body.createEl('p', { cls: 'keel-cockpit-muted', text: base.source === 'git' ? 'From git history.' : 'From the copy kept in plugin data.' });
		const hunks = toHunks(lines);
		if (hunks.length === 0) {
			body.createEl('p', { cls: 'keel-cockpit-muted', text: 'No changes.' });
			return;
		}
		const pre = body.createEl('pre', { cls: 'keel-cockpit-diff' });
		for (const h of hunks) {
			pre.createDiv({ cls: 'keel-cockpit-diff-hunk', text: `@@ ${h.oldStart} → ${h.newStart} @@` });
			for (const l of h.lines) {
				const mark = l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' ';
				pre.createDiv({ cls: `keel-cockpit-diff-${l.kind}`, text: `${mark} ${l.text}` });
			}
		}
	}

	// ---- unanswered [!question] blocks in the workspace --------------------------------------

	private async renderQuestions(root: HTMLElement, ws: Workspace): Promise<void> {
		const details = root.createEl('details', { cls: 'keel-cockpit-section' });
		details.open = true;
		const summary = details.createEl('summary', { text: 'Unanswered questions in this workspace' });
		const body = details.createDiv({ cls: 'keel-cockpit-section-body' });
		const found = await this.scanWorkspace(ws);
		summary.setText(`Unanswered questions in this workspace (${found.length})`);
		if (found.length === 0) {
			body.createEl('p', { cls: 'keel-cockpit-muted', text: 'None' });
			return;
		}
		const ul = body.createEl('ul', { cls: 'keel-cockpit-links' });
		for (const q of found) {
			const li = ul.createEl('li');
			const a = li.createEl('a', { text: `${q.id || '?'} ${q.title}`, cls: 'internal-link' });
			a.dataset.path = q.path;
			a.dataset.line = String(q.line);
			li.createSpan({ cls: 'keel-cockpit-muted', text: ` · ${q.path.slice(ws.root === '' ? 0 : ws.root.length + 1)}` });
		}
	}

	private async scanWorkspace(ws: Workspace): Promise<FoundQuestion[]> {
		const prefix = ws.root === '' ? '' : ws.root + '/';
		const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(prefix));
		const out: FoundQuestion[] = [];
		for (const f of files) {
			const text = await this.app.vault.cachedRead(f);
			if (!text.includes('[!question]')) continue;
			for (const q of unansweredQuestions(text)) out.push({ ...q, path: f.path });
		}
		return out.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
	}

	// ---- dotfolders: names only ------------------------------------------------------------

	private async renderDotfolders(root: HTMLElement, ws: Workspace): Promise<void> {
		const details = root.createEl('details', { cls: 'keel-cockpit-section' });
		details.createEl('summary', { text: '.keel folder' });
		const body = details.createDiv({ cls: 'keel-cockpit-section-body' });
		const adapter = this.app.vault.adapter;
		const dir = join(ws.root, '.keel');
		if (!(await adapter.exists(dir))) {
			body.createEl('p', { cls: 'keel-cockpit-muted', text: 'None' });
			return;
		}
		const listed = await adapter.list(dir);
		const ul = body.createEl('ul', { cls: 'keel-cockpit-names' });
		const name = (p: string): string => p.slice(p.lastIndexOf('/') + 1);
		for (const f of listed.files.sort()) ul.createEl('li', { text: name(f) });
		for (const d of listed.folders.sort()) {
			const li = ul.createEl('li', { text: name(d) + '/' });
			if (name(d) !== 'credentials') continue;
			const creds = await adapter.list(d);
			const inner = li.createEl('ul');
			for (const c of creds.files.sort()) inner.createEl('li', { text: name(c), cls: 'keel-cockpit-muted' });
			li.createSpan({ cls: 'keel-cockpit-muted', text: ' names only' });
		}
	}

	// ---- clicks ---------------------------------------------------------------------------

	private onClick(e: MouseEvent): void {
		const target = e.target;
		if (!(target instanceof Node)) return;
		const start = target.instanceOf(Element) ? target : target.parentElement;
		const a = start?.closest('a.internal-link');
		if (!a?.instanceOf(HTMLElement)) return;
		e.preventDefault();
		if (a.dataset.path) {
			const file = this.app.vault.getFileByPath(a.dataset.path);
			if (file instanceof TFile) {
				void this.app.workspace.getLeaf(false).openFile(file, { eState: { line: Number(a.dataset.line ?? 0) } });
			}
			return;
		}
		const href = a.dataset.href ?? a.getAttribute('href') ?? '';
		void this.app.workspace.openLinkText(href, a.dataset.source ?? '', false);
	}

	private async renderMarkdown(el: HTMLElement, markdown: string, sourcePath: string): Promise<void> {
		await MarkdownRenderer.render(this.app, markdown, el, sourcePath, this);
		for (const a of Array.from(el.querySelectorAll('a.internal-link'))) {
			if (a.instanceOf(HTMLElement) && !a.dataset.source) a.dataset.source = sourcePath;
		}
	}
}
