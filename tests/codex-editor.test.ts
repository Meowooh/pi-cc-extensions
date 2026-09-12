import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { CustomEditor, Theme } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, visibleWidth } from "@earendil-works/pi-tui";
import codexEditor from "../extensions/feature/shell/codex-editor.ts";

function fixture(themeName = "cc-codex") {
	const source = JSON.parse(
		readFileSync(new URL("../themes/cc-codex.json", import.meta.url), "utf8"),
	);
	const colors = Object.fromEntries(
		Object.entries(source.colors).map(([key, value]) => [
			key,
			source.vars[value as string] ?? value,
		]),
	);
	const palette = new Theme(colors as any, colors as any, "truecolor", { name: themeName });
	const events = new Map<string, Function>();
	let factory: any;
	const ui = {
		theme: palette,
		getEditorComponent: () => factory,
		setEditorComponent: (value: any) => {
			factory = value;
		},
	};
	const ctx = { hasUI: true, mode: "tui", ui };
	codexEditor({ on: (name: string, handler: Function) => events.set(name, handler) } as any);
	return { ctx, palette, emit: (name: string) => events.get(name)!({}, ctx) };
}

test("Codex input keeps native editing, wrapping and cursor while painting a continuous gray surface", () => {
	const f = fixture();
	f.emit("session_start");
	const tui = { terminal: { rows: 40 }, requestRender() {} };
	const editorTheme = { borderColor: (text: string) => f.palette.fg("border", text) };
	const keybindings = { matches: () => false };
	const editor = f.ctx.ui.getEditorComponent()(tui, editorTheme, keybindings) as CustomEditor;
	assert.ok(editor instanceof CustomEditor);
	editor.focused = true;
	editor.setText("输入框 中文🙂\nsecond line");
	editor.handleInput("!");
	assert.equal(editor.getText(), "输入框 中文🙂\nsecond line!");
	const draft = editor.getText();
	const fg = f.palette.getFgAnsi("text");
	const bg = f.palette.getBgAnsi("userMessageBg");
	for (const width of [4, 8, 20, 80]) {
		const rendered = editor.render(width);
		assert.ok(rendered.every((line) => visibleWidth(line) === width));
		assert.equal(rendered.filter((line) => line.includes(CURSOR_MARKER)).length, 1);
		assert.ok(rendered.every((line) => line.startsWith(fg + bg)));
		assert.ok(
			rendered.some((line) => line.includes(`\x1b[0m${fg}${bg}`)),
			"restore the surface after the cursor reset",
		);
		assert.equal(editor.getText(), draft);
	}
	f.ctx.ui.theme = fixture("other").palette;
	assert.ok(
		editor.render(80).every((line) => !line.includes(bg)),
		"switching theme removes the custom input surface",
	);
	f.emit("session_shutdown");
});

test("Codex editor respects other extensions and releases only the editor it owns", () => {
	const f = fixture();
	const external = () => {};
	f.ctx.ui.setEditorComponent(external);
	f.emit("session_start");
	assert.equal(f.ctx.ui.getEditorComponent(), external);
	f.emit("session_shutdown");
	assert.equal(f.ctx.ui.getEditorComponent(), external);
	f.ctx.ui.setEditorComponent(undefined);
	f.ctx.mode = "rpc";
	f.emit("session_start");
	assert.equal(f.ctx.ui.getEditorComponent(), undefined);
	f.ctx.mode = "tui";
	f.emit("session_start");
	const first = f.ctx.ui.getEditorComponent();
	f.emit("session_start");
	assert.notEqual(f.ctx.ui.getEditorComponent(), first);
	f.emit("session_shutdown");
	assert.equal(f.ctx.ui.getEditorComponent(), undefined);
	f.emit("session_start");
	f.ctx.ui.setEditorComponent(external);
	f.emit("session_shutdown");
	assert.equal(f.ctx.ui.getEditorComponent(), external);
});
