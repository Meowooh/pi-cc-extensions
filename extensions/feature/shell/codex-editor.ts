import {
	CustomEditor,
	type ExtensionAPI,
	type ExtensionContext,
	type Theme,
} from "@earendil-works/pi-coding-agent";

type EditorFactory = NonNullable<ReturnType<ExtensionContext["ui"]["getEditorComponent"]>>;

class CodexEditor extends CustomEditor {
	private getPalette: () => Theme;

	constructor(getPalette: () => Theme, ...args: ConstructorParameters<typeof CustomEditor>) {
		super(...args);
		this.getPalette = getPalette;
	}

	override render(width: number): string[] {
		const lines = super.render(width);
		const palette = this.getPalette();
		if (palette.name !== "cc-codex") return lines;

		const foreground = palette.getFgAnsi("text");
		const background = palette.getBgAnsi("userMessageBg");
		return lines.map((line) => {
			// The native cursor and autocomplete emit resets; keep the input surface
			// continuous after them while preserving their selection and cursor styles.
			const content = line.replace(/\x1b\[(0|39|49)?m/g, (reset, code: string | undefined) => {
				const restore =
					code === "39" ? foreground : code === "49" ? background : foreground + background;
				return reset + restore;
			});
			return `${foreground}${background}${content}\x1b[39m\x1b[49m`;
		});
	}
}

export default function codexEditor(pi: ExtensionAPI): void {
	let dispose: (() => void) | undefined;
	pi.on("session_start", (_event, ctx) => {
		dispose?.();
		dispose = undefined;
		if (!ctx.hasUI || ctx.mode !== "tui" || ctx.ui.getEditorComponent()) return;

		const factory: EditorFactory = (tui, theme, keybindings) => {
			return new CodexEditor(() => ctx.ui.theme, tui, theme, keybindings);
		};
		ctx.ui.setEditorComponent(factory);
		dispose = () => {
			if (ctx.ui.getEditorComponent() === factory) ctx.ui.setEditorComponent(undefined);
		};
	});
	pi.on("session_shutdown", () => {
		dispose?.();
		dispose = undefined;
	});
}
