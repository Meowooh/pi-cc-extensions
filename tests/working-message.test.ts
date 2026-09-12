import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { installFooter } from "../extensions/feature/shell/open-tui-footer/footer.ts";
import { loadFooterConfig } from "../extensions/feature/shell/open-tui-footer/config.ts";
import {
	createInitialState,
	getModelMeta,
} from "../extensions/feature/shell/open-tui-footer/state.ts";
import workingMessageExtension from "../extensions/feature/shell/working-message.ts";

function install() {
	const events = new Map<string, Function>();
	const messages: (string | undefined)[] = [];
	const state = createInitialState();
	const config = loadFooterConfig();
	config.icons.mode = "ascii";
	let footer: { render(width: number): string[]; dispose(): void };
	let installations = 0;
	let renders = 0;
	const ui = {
		getTheme() {
			return undefined;
		},
		setWorkingMessage(message?: string) {
			messages.push(message);
		},
		setFooter(factory: any) {
			footer?.dispose();
			footer = factory?.(
				{ requestRender: () => renders++ },
				{ fg: (_color: string, text: string) => text },
				{
					onBranchChange: () => () => {},
					getExtensionStatuses: () => new Map(),
				},
			);
			if (factory) installations++;
		},
		setWidget() {
			throw new Error("Run timing belongs inside the footer, not in a separate widget");
		},
	};
	const ctx = {
		hasUI: true,
		mode: "tui",
		ui,
		model: { id: "test-model", provider: "test", reasoning: true, contextWindow: 200000 },
		modelRegistry: { isUsingOAuth: () => false },
		getContextUsage: () => ({ percent: 0, tokens: 0, contextWindow: 200000 }),
		sessionManager: {
			getEntries: () => [],
			getCwd: () => "/project/test",
			getSessionName: () => undefined,
		},
	} as any;
	let requestRender: (() => void) | undefined;
	installFooter(
		ctx,
		() => state,
		() => config,
		() => getModelMeta(ctx, () => "max"),
		{
			setRequestRender: (render) => {
				requestRender = render;
			},
			scheduleGitRefresh() {},
		},
	);
	workingMessageExtension(
		{
			on(name: string, handler: Function) {
				events.set(name, handler);
			},
		} as any,
		(summary) => {
			state.runSummary = summary;
			requestRender?.();
		},
	);
	return {
		events,
		messages,
		ctx,
		bottom: (width = 100) => (state.runSummary ? footer.render(width).join("\n") : undefined),
		get installations() {
			return installations;
		},
		get renders() {
			return renders;
		},
	};
}

test("Working stays plain while whole-second timing shares the two-row footer", async (t) => {
	t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 10_000 });
	const app = install();
	const { events, messages, ctx, bottom } = app;
	t.after(() => events.get("session_shutdown")?.({}, ctx));

	await events.get("agent_start")?.({}, ctx);
	await events.get("turn_start")?.({}, ctx);
	assert.equal(messages.at(-1), "Working");
	assert.match(bottom() ?? "", /o working 0s/);
	t.mock.timers.tick(999);
	assert.match(bottom() ?? "", /o working 0s/);
	t.mock.timers.tick(1);
	assert.match(bottom() ?? "", /o working 1s/);

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
	assert.match(bottom() ?? "", /working 1s[\s\S]*↓ \d+/);
	assert.equal(
		app.installations,
		1,
		"updates repaint the same two-row footer without recreating it",
	);
	for (const width of [0, 1, 3, 10, 20, 40]) {
		for (const line of bottom(width)?.split("\n") ?? []) assert.ok(visibleWidth(line) <= width);
	}

	await events.get("turn_end")?.({}, ctx);
	t.mock.timers.tick(1_000);
	assert.match(bottom() ?? "", /working 2s/, "elapsed time continues between tool turns");
	await events.get("agent_end")?.({}, ctx);
	assert.equal(messages.at(-1), undefined);
	assert.match(bottom() ?? "", /done 2s[\s\S]*↓ \d+/);
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
	assert.match(first, /↓ 1(?: \||$)/);

	await events.get("message_update")?.(
		{ assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "abcd" } },
		ctx,
	);
	assert.match(bottom() ?? "", /↓ 2(?: \||$)/);

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
	assert.match(bottom() ?? "", /↓ 2(?: \||$)/);

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
	assert.match(bottom() ?? "", /↓ 4(?: \||$)/);

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
	assert.match(bottom() ?? "", /↓ 37(?: \||$)/);

	// Tool turns contribute to the same run total without counting a turn twice.
	await events.get("turn_end")?.({}, ctx);
	await events.get("turn_end")?.({}, ctx);
	await events.get("turn_start")?.({}, ctx);
	assert.match(bottom() ?? "", /↓ 37(?: \||$)/);
	await events.get("message_update")?.(
		{ assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "abcdefgh" } },
		ctx,
	);
	assert.match(bottom() ?? "", /↓ 39(?: \||$)/);
	await events.get("message_update")?.(
		{
			assistantMessageEvent: {
				type: "done",
				message: { content: [{ type: "thinking", thinking: "abcdefgh" }] },
			},
		},
		ctx,
	);
	assert.match(bottom() ?? "", /↓ 39(?: \||$)/, "final thinking text keeps its estimated count");
	await events.get("message_end")?.(
		{ message: { role: "assistant", content: [], usage: { output: 10 } } },
		ctx,
	);
	await events.get("turn_end")?.(
		{ message: { role: "assistant", content: [], usage: { output: 10 } } },
		ctx,
	);
	await events.get("agent_end")?.({}, ctx);
	assert.match(bottom() ?? "", /↓ 47(?: \||$)/);

	await events.get("agent_start")?.({}, ctx);
	assert.equal(messages.at(-1), "Working");
	assert.match(
		bottom() ?? "",
		/working 0s[\s\S]*↓ 0(?: \||$)/,
		"a new run clears the previous timer and output count",
	);
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
