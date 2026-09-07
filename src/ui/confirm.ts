import { Modal, Setting, type App } from 'obsidian';
import { checkoutLabel, type Checkout } from '../core/repos';

export interface SaveChoice {
	checkout: Checkout;
	message: string;
}

/** Ask before `keel save`: which checkout, and what changed. Resolves null on cancel. */
export class ConfirmSaveModal extends Modal {
	private choice: SaveChoice | null = null;
	private resolve: ((c: SaveChoice | null) => void) | null = null;

	constructor(app: App, private readonly checkouts: Checkout[]) {
		super(app);
	}

	open(): void {
		super.open();
	}

	ask(): Promise<SaveChoice | null> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	onOpen(): void {
		this.setTitle('Save with keel');
		const first = this.checkouts[0];
		if (!first) {
			this.contentEl.createEl('p', { text: 'No bound checkout to save in. Run keel doctor.' });
			return;
		}
		let checkout = first;
		let message = '';
		let pathEl: Element | null = null;
		this.contentEl.createEl('p', { text: 'Keel stages everything in the checkout, commits with provenance and pushes.' });
		new Setting(this.contentEl)
			.setName('Checkout')
			.setDesc(checkout.path)
			.addDropdown((dd) => {
				for (const [i, c] of this.checkouts.entries()) dd.addOption(String(i), checkoutLabel(c));
				dd.setValue('0');
				dd.onChange((v) => {
					checkout = this.checkouts[Number(v)] ?? first;
					pathEl?.setText(checkout.path);
				});
			});
		pathEl = this.contentEl.querySelector('.setting-item-description');
		new Setting(this.contentEl)
			.setName('What changed')
			.setDesc('Commit message. Empty lets keel write one.')
			.addText((t) => {
				t.setPlaceholder('What changed');
				t.onChange((v) => (message = v));
				t.inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') this.confirm({ checkout, message });
				});
			});
		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((b) => b.setButtonText('Save').setCta().onClick(() => this.confirm({ checkout, message })));
	}

	private confirm(choice: SaveChoice): void {
		this.choice = choice;
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		this.resolve?.(this.choice);
		this.resolve = null;
	}
}
