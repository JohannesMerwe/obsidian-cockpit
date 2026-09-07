import { Notice, Plugin } from 'obsidian';

export default class KeelCockpitPlugin extends Plugin {
	onload(): void {
		this.addCommand({
			id: 'status',
			name: 'Show status',
			callback: () => {
				new Notice('Keel Cockpit ' + this.manifest.version + ' is loaded. Nothing to show yet.');
			},
		});
	}
}
