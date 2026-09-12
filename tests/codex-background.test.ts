import assert from "node:assert/strict";
import test from "node:test";
import { createCodexBackground } from "../extensions/feature/shell/codex-background.ts";

function fixture() {
	const writes: string[] = [];
	const replies: Array<(color?: { r: number; g: number; b: number }) => void> = [];
	const theme = { name: "cc-dark" };
	const tui = {
		terminal: { write: (value: string) => writes.push(value) },
		queryTerminalBackgroundColor: () => new Promise<any>((resolve) => replies.push(resolve)),
		requestRender() {},
	};
	return {
		theme,
		writes,
		replies,
		background: createCodexBackground(tui as any, () => theme as any),
	};
}

const flush = () => new Promise<void>((resolve) => queueMicrotask(() => queueMicrotask(resolve)));

test("Codex background covers the terminal once and restores its original palette on theme changes", async () => {
	const f = fixture();
	f.background.sync();
	assert.equal(f.replies.length, 0);
	f.theme.name = "cc-codex";
	f.background.sync();
	f.background.sync();
	assert.equal(f.replies.length, 1);
	assert.equal(f.writes.length, 0, "capture the old background before changing it");
	f.replies[0]!({ r: 12, g: 16, b: 24 });
	await flush();
	assert.deepEqual(f.writes, ["\x1b]11;#141414\x07"]);
	f.background.sync();
	assert.equal(
		f.writes.length,
		1,
		"normal renders must not repeatedly change the terminal palette",
	);
	f.theme.name = "cc-light";
	f.background.sync();
	assert.equal(f.writes.at(-1), "\x1b]11;#0c1018\x07");
	f.theme.name = "cc-codex";
	f.background.sync();
	assert.equal(f.replies.length, 2, "capture again after another theme has been active");
	f.replies[1]!({ r: 240, g: 240, b: 240 });
	await flush();
	f.background.dispose();
	assert.equal(f.writes.at(-1), "\x1b]11;#f0f0f0\x07");
	const count = f.writes.length;
	f.background.sync();
	f.background.dispose();
	assert.equal(f.writes.length, count);
});

test("late color replies cannot recolor a disposed or switched-away session", async () => {
	for (const close of ["dispose", "switch"]) {
		const f = fixture();
		f.theme.name = "cc-codex";
		f.background.sync();
		if (close === "dispose") f.background.dispose();
		else {
			f.theme.name = "cc-dark";
			f.background.sync();
		}
		f.replies[0]!({ r: 0, g: 0, b: 0 });
		await flush();
		assert.deepEqual(f.writes, []);
		f.background.dispose();
	}
});

test("terminals without color-query replies return to their configured background on exit", async () => {
	const f = fixture();
	f.theme.name = "cc-codex";
	f.background.sync();
	f.replies[0]!(undefined);
	await flush();
	assert.equal(f.writes[0], "\x1b]11;#141414\x07");
	f.background.dispose();
	assert.equal(f.writes.at(-1), "\x1b]111\x07");
});
