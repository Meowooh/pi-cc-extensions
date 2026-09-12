import assert from "node:assert/strict";
import test from "node:test";
import { stripVTControlCharacters as plain } from "node:util";
import { visibleWidth } from "@earendil-works/pi-tui";
import { loadFooterConfig } from "../extensions/feature/shell/open-tui-footer/config.ts";
import { installFooter } from "../extensions/feature/shell/open-tui-footer/footer.ts";
import {
	createInitialState,
	getModelMeta,
	getUsageTotals,
} from "../extensions/feature/shell/open-tui-footer/state.ts";

function install() {
	const config = loadFooterConfig();
	config.icons.mode = "ascii";
	const state = createInitialState();
	state.git.branch = "quiet-ui";
	state.git.modified = 2;
	state.runtime = { name: "nodejs", version: "24.0.0" };
	state.runSummary = { duration: "12s", tokens: 320, complete: false };
	let component: { render(width: number): string[]; dispose(): void } | undefined;
	let unsubscribed = 0;
	let renders = 0;
	let branchChanged = () => {};
	let refreshes = 0;
	const theme = {
		fg: (color: string, text: string) => (color === "error" ? `\x1b[31m${text}\x1b[0m` : text),
	};
	const statuses = new Map<string, string>();
	const entries: any[] = [
		{
			type: "message",
			id: "entry",
			timestamp: "now",
			message: {
				role: "assistant",
				usage: {
					input: 5_000,
					output: 320,
					cacheRead: 20_000,
					cacheWrite: 0,
					cost: { total: 0.12 },
				},
			},
		},
	];
	const usage: { percent: number | null; tokens: number | null; contextWindow: number } = {
		percent: 12.5,
		tokens: 125_000,
		contextWindow: 1_000_000,
	};
	const ctx = {
		model: {
			id: "gpt-6-astra",
			name: "gpt-6-astra",
			provider: "openai-codex",
			reasoning: true,
			contextWindow: 1_000_000,
		},
		modelRegistry: { isUsingOAuth: () => true },
		getContextUsage: () => usage,
		sessionManager: {
			getEntries: () => entries,
			getCwd: () => "/project/demo",
			getSessionName: () => undefined,
		},
		ui: {
			setFooter(factory: any) {
				component?.dispose();
				component = factory?.({ requestRender: () => renders++ }, theme, {
					onBranchChange: (fn: () => void) => {
						branchChanged = fn;
						return () => {
							unsubscribed++;
						};
					},
					getExtensionStatuses: () => statuses,
				});
			},
		},
	} as any;
	const dispose = installFooter(
		ctx,
		() => state,
		() => config,
		() => getModelMeta(ctx, () => "max"),
		{
			setRequestRender() {},
			scheduleGitRefresh() {
				refreshes++;
			},
		},
	);
	return {
		ctx,
		state,
		usage,
		statuses,
		entries,
		dispose,
		render: (width = 160) => component!.render(width),
		branchChanged: () => branchChanged(),
		get unsubscribed() {
			return unsubscribed;
		},
		get refreshes() {
			return refreshes;
		},
		get renders() {
			return renders;
		},
	};
}

test("Open TUI footer places context above usage with model and timing on the left", () => {
	const app = install();
	const lines = app.render().map(plain);
	assert.equal(lines.length, 2, "run timing is part of the footer, without an extra row");
	assert.match(
		lines[0],
		/^@ \/project\/demo \* quiet-ui \[!2\] node 24\.0\.0 o working 12s +# \[##----------\] 12\.5% · 125k\/1\.0M$/,
	);
	assert.match(
		lines[1],
		/^M · Openai-codex · gpt-6-astra · ~ max +↑ 25k \(U 5\.0k \+ R 20k\) \| ↓ 320 \| c 80\.0% \| \$ \$0\.120 \(sub\)$/,
	);
	app.state.runSummary!.complete = true;
	assert.match(plain(app.render()[0]), /\+ done 12s/);
	app.state.outputBaseline = 320;
	app.state.runSummary = { duration: "1s", tokens: 100, complete: false };
	assert.match(plain(app.render()[1]), /↓ 420/);
	app.dispose();
});

test("footer preserves unknown context, warning colors, CJK widths and extension statuses", () => {
	const app = install();
	app.usage.percent = 95;
	assert.ok(app.render()[0].includes("\x1b[31m95.0%"));
	app.usage.percent = null;
	app.usage.tokens = null;
	assert.match(plain(app.render()[0]), /# \[\?\] \?% · \?\/1\.0M$/);
	assert.doesNotMatch(plain(app.render()[0]), /0\.0%/);
	app.ctx.sessionManager.getCwd = () => "/项目/非常长的目录名称/测试项目";
	app.ctx.model.name = "模型测试名字非常长";
	app.state.git.branch = "修改/状态栏排布测试";
	app.statuses.set("z", "MCP connected");
	app.statuses.set("a", "first\nstatus\x1b]9;4;3\x07");
	assert.match(app.render().slice(2).map(plain).join(" "), /& first status \| MCP connected/);
	for (let width = 0; width <= 200; width++) {
		for (const line of app.render(width)) {
			assert.ok(visibleWidth(line) <= width, `width ${width}: ${plain(line)}`);
			assert.ok(!line.includes("\x1b]9;4"));
		}
	}
	app.dispose();
});

test("footer cleanup respects a later replacement and usage caches stay within their session", () => {
	const app = install();
	app.branchChanged();
	assert.equal(app.refreshes, 1);
	assert.equal(app.renders, 1);
	const other = install();
	other.entries[0].message.usage.output = 999;
	assert.equal(getUsageTotals(app.ctx).output, 320);
	assert.equal(getUsageTotals(other.ctx).output, 999);
	app.ctx.ui.setFooter(() => ({ render: () => ["later footer"], dispose() {} }));
	app.dispose();
	assert.deepEqual(app.render(), ["later footer"]);
	assert.equal(app.unsubscribed, 1);
	other.dispose();
});
