import { readFileSync } from "node:fs";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";

// Pi only uses export.pageBg in HTML exports. Apply the same theme color to
// the live terminal so transcript gaps, dialogs and the footer share its base.
const themeSource = JSON.parse(
	readFileSync(new URL("../../../themes/cc-codex.json", import.meta.url), "utf8"),
);
const background: string = themeSource.vars[themeSource.export.pageBg] ?? themeSource.export.pageBg;

export function createCodexBackground(tui: TUI, getTheme: () => Theme) {
	let disposed = false;
	let applied = false;
	let captured = false;
	let pending = false;
	let previous: { r: number; g: number; b: number } | undefined;

	function restore(): void {
		if (applied) {
			const color = previous
				? `#${[previous.r, previous.g, previous.b].map((n) => n.toString(16).padStart(2, "0")).join("")}`
				: undefined;
			tui.terminal.write(color ? `\x1b]11;${color}\x07` : "\x1b]111\x07");
			applied = false;
		}
		captured = false;
	}

	function sync(): void {
		if (disposed) return;
		if (getTheme()?.name !== "cc-codex") {
			restore();
			return;
		}
		if (applied || pending) return;
		if (captured) {
			tui.terminal.write(`\x1b]11;${background}\x07`);
			applied = true;
			return;
		}
		pending = true;
		void tui
			.queryTerminalBackgroundColor({ timeoutMs: 200 })
			.catch(() => undefined)
			.then((color) => {
				pending = false;
				if (disposed) return;
				previous = color;
				captured = true;
				sync();
				tui.requestRender();
			});
	}

	return {
		sync,
		dispose(): void {
			disposed = true;
			restore();
		},
	};
}
