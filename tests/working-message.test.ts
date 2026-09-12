import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import workingMessageExtension from "../extensions/feature/shell/working-message.ts";

function install() {
	const events = new Map<string, Function>();
	const messages: (string | undefined)[] = [];
	let widget: { render(width: number): string[]; dispose(): void } | undefined;
	let placement: string | undefined;
	let installations = 0;
	let renders = 0;
	const ui = {
		setWorkingMessage(message?: string) {
			messages.push(message);
		},
		setWidget(_key: string, factory: any, options?: { placement: string }) {
			widget?.dispose();
			widget = factory?.(
				{ requestRender: () => renders++ },
				{ fg: (_color: string, text: string) => text },
			);
			placement = options?.placement;
			if (factory) installations++;
		},
	} as any;
	workingMessageExtension({
		on(name: string, handler: Function) {
			events.set(name, handler);
		},
	} as any);
	const ctx = { hasUI: true, mode: "tui", ui };
	return {
		events,
		messages,
		ctx,
		bottom: (width = 100) => widget?.render(width).join("\n"),
		get placement() {
			return placement;
		},
		get installations() {
			return installations;
		},
		get renders() {
			return renders;
		},
	};
}

test("Working stays plain while whole-second timing lives below the editor", async (t) => {
	t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 10_000 });
	const app = install();
	const { events, messages, ctx, bottom } = app;
	t.after(() => events.get("session_shutdown")?.({}, ctx));

	await events.get("agent_start")?.({}, ctx);
	await events.get("turn_start")?.({}, ctx);
	assert.equal(messages.at(-1), "Working");
	assert.equal(app.placement, "belowEditor");
	assert.equal(bottom(), "◷ 0s");
	t.mock.timers.tick(999);
	assert.equal(bottom(), "◷ 0s");
	t.mock.timers.tick(1);
	assert.equal(bottom(), "◷ 1s");

	const delta = "This is a streaming response body long enough to count some tokens.";
	await events.get("message_update")?.(
		{ assistantMessageEvent: { type: "text_start", contentIndex: 0 } },
		ctx,
	);
	await events.get("message_update")?.(
		{ assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta } },
		ctx,
	);
	assert.equal(messages.at(-1), "Working");
	assert.match(bottom() ?? "", /^◷ 1s \| ↓ \d+ tokens$/);
	assert.equal(app.installations, 1, "updates repaint the same widget without recreating it");
	for (const width of [0, 1, 3, 10, 20, 40]) {
		assert.ok(visibleWidth(bottom(width) ?? "") <= width);
	}

	await events.get("turn_end")?.({}, ctx);
	t.mock.timers.tick(1_000);
	assert.match(bottom() ?? "", /^◷ 2s/, "elapsed time continues between tool turns");
	await events.get("agent_end")?.({}, ctx);
	assert.equal(messages.at(-1), undefined);
	assert.match(bottom() ?? "", /^✓ 2s \| ↓ \d+ tokens$/);
	const completed = bottom();
	const renders = app.renders;
	t.mock.timers.tick(60_000);
	assert.equal(bottom(), completed, "completion freezes the timer");
	assert.equal(app.renders, renders, "the refresh timer stops when the run ends");
	assert.ok(messages.every((message) => message === "Working" || message === undefined));

	await events.get("session_start")?.({}, ctx);
	assert.equal(bottom(), undefined, "session switch clears the previous run's status");
	await events.get("session_shutdown")?.({}, ctx);
	await events.get("session_shutdown")?.({}, ctx);
	assert.equal(messages.at(-1), undefined);
});

test("bottom output totals span tool turns, prefer provider usage, and reset for a new run", async (t) => {
	const { events, messages, ctx, bottom } = install();
	t.after(() => events.get("session_shutdown")?.({}, ctx));
	await events.get("turn_start")?.({}, ctx);

	await events.get("message_update")?.(
		{ assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "abcd" } },
		ctx,
	);
	const first = bottom() ?? "";
	assert.match(first, /↓ 1 tokens/);

	await events.get("message_update")?.(
		{ assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "abcd" } },
		ctx,
	);
	assert.match(bottom() ?? "", /↓ 2 tokens/);

	// text_end provides the full block; it must replace, not double-count, deltas.
	await events.get("message_update")?.(
		{
			assistantMessageEvent: {
				type: "text_end",
				contentIndex: 0,
				content: "abcdefgh",
				partial: {},
			},
		},
		ctx,
	);
	assert.match(bottom() ?? "", /↓ 2 tokens/);

	// A second text block accumulates independently by contentIndex.
	await events.get("message_update")?.(
		{ assistantMessageEvent: { type: "text_start", contentIndex: 1, partial: {} } },
		ctx,
	);
	await events.get("message_update")?.(
		{
			assistantMessageEvent: {
				type: "text_delta",
				contentIndex: 1,
				delta: "abcdefgh",
				partial: {},
			},
		},
		ctx,
	);
	assert.match(bottom() ?? "", /↓ 4 tokens/);

	// Provider usage replaces the live chars/4 estimate when available.
	await events.get("message_update")?.(
		{
			assistantMessageEvent: {
				type: "done",
				message: {
					content: [
						{ type: "text", text: "abcdefgh" },
						{ type: "text", text: "abcdefgh" },
					],
					usage: { output: 37 },
				},
			},
		},
		ctx,
	);
	assert.match(bottom() ?? "", /↓ 37 tokens/);

	// Tool turns contribute to the same run total without counting a turn twice.
	await events.get("turn_end")?.({}, ctx);
	await events.get("turn_end")?.({}, ctx);
	await events.get("turn_start")?.({}, ctx);
	assert.match(bottom() ?? "", /↓ 37 tokens/);
	await events.get("message_update")?.(
		{ assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "abcdefgh" } },
		ctx,
	);
	assert.match(bottom() ?? "", /↓ 39 tokens/);
	await events.get("message_update")?.(
		{
			assistantMessageEvent: {
				type: "done",
				message: { content: [{ type: "thinking", thinking: "abcdefgh" }] },
			},
		},
		ctx,
	);
	assert.match(bottom() ?? "", /↓ 39 tokens/, "final thinking text keeps its estimated count");
	await events.get("message_end")?.(
		{ message: { role: "assistant", content: [], usage: { output: 10 } } },
		ctx,
	);
	await events.get("turn_end")?.(
		{ message: { role: "assistant", content: [], usage: { output: 10 } } },
		ctx,
	);
	await events.get("agent_end")?.({}, ctx);
	assert.match(bottom() ?? "", /↓ 47 tokens/);

	await events.get("agent_start")?.({}, ctx);
	assert.equal(messages.at(-1), "Working");
	assert.equal(bottom(), "◷ 0s", "a new run clears the previous timer and output count");
});

test("shutdown cancels live timing and non-TUI modes do not install UI", async (t) => {
	t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 10_000 });
	const app = install();
	const { events, ctx, bottom, messages } = app;
	await events.get("agent_start")?.({}, ctx);
	await events.get("turn_start")?.({}, ctx);
	await events.get("session_shutdown")?.({}, ctx);
	const renders = app.renders;
	t.mock.timers.tick(60_000);
	await events.get("message_update")?.(
		{ assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "late update" } },
		ctx,
	);
	assert.equal(bottom(), undefined);
	assert.equal(app.renders, renders);
	const messageCount = messages.length;
	for (const mode of ["print", "rpc"]) {
		const headless = { ...ctx, mode, hasUI: mode === "rpc" };
		await events.get("agent_start")?.({}, headless);
		await events.get("turn_start")?.({}, headless);
		await events.get("agent_end")?.({}, headless);
	}
	assert.equal(messages.length, messageCount);
	assert.equal(bottom(), undefined);
});
