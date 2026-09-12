import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadFooterConfig } from "./open-tui-footer/config.ts";
import { installFooter } from "./open-tui-footer/footer.ts";
import { readGitStatus } from "./open-tui-footer/git.ts";
import { readRuntimeInfo } from "./open-tui-footer/runtime.ts";
import {
	createInitialState,
	getModelMeta,
	getUsageTotals,
	invalidateUsageCache,
} from "./open-tui-footer/state.ts";
import type { RunSummary } from "./working-message.ts";

export default function quietUi(pi: ExtensionAPI): (summary: RunSummary | undefined) => void {
	let state = createInitialState();
	let config = loadFooterConfig();
	let activeCtx: ExtensionContext | undefined;
	let disposeFooter: (() => void) | undefined;
	let requestRender: (() => void) | undefined;
	let generation = 0;
	let projectRefresh: Promise<void> | undefined;
	let refreshQueued = false;

	function refreshProject(): void {
		if (!activeCtx) return;
		if (projectRefresh) {
			refreshQueued = true;
			return;
		}
		const current = generation;
		const cwd = activeCtx.cwd;
		const segments = config.footerSegments;
		const task = Promise.all([
			segments.gitBranch || segments.gitStatus
				? readGitStatus(cwd, {
						readCommit: true,
						readTag: segments.gitCommit,
						readCounts: segments.gitStatus,
					})
				: Promise.resolve(state.git),
			segments.runtime ? readRuntimeInfo(cwd) : Promise.resolve(null),
		])
			.then(([git, runtime]) => {
				if (current !== generation) return;
				state.git = git;
				state.runtime = runtime;
				requestRender?.();
			})
			.finally(() => {
				if (projectRefresh !== task) return;
				projectRefresh = undefined;
				if (refreshQueued) {
					refreshQueued = false;
					refreshProject();
				}
			});
		projectRefresh = task;
	}

	function refreshUsage(): void {
		invalidateUsageCache();
		requestRender?.();
	}

	function dispose(): void {
		generation++;
		activeCtx = undefined;
		projectRefresh = undefined;
		refreshQueued = false;
		disposeFooter?.();
		disposeFooter = undefined;
		requestRender = undefined;
	}

	pi.on("session_start", (_event, ctx) => {
		dispose();
		if (!ctx.hasUI || ctx.mode !== "tui") return;
		activeCtx = ctx;
		state = createInitialState();
		config = loadFooterConfig();
		invalidateUsageCache();
		ctx.ui.setWorkingIndicator();
		ctx.ui.setWorkingMessage("Working");
		ctx.ui.setHiddenThinkingLabel("Thinking");
		disposeFooter = installFooter(
			ctx,
			() => state,
			() => config,
			() => getModelMeta(ctx, () => pi.getThinkingLevel()),
			{
				setRequestRender: (render) => {
					requestRender = render;
				},
				scheduleGitRefresh: refreshProject,
			},
		);
		refreshProject();
	});
	pi.on("session_shutdown", dispose);
	pi.on("model_select", refreshUsage);
	pi.on("thinking_level_select", refreshUsage);
	pi.on("message_end", refreshUsage);
	pi.on("turn_end", refreshUsage);
	pi.on("agent_end", refreshUsage);
	pi.on("session_compact", refreshUsage);
	pi.on("session_tree", refreshUsage);
	pi.on("session_info_changed", refreshUsage);
	pi.on("tool_execution_end", () => {
		refreshUsage();
		refreshProject();
	});

	return (summary) => {
		if (summary && !summary.complete && (!state.runSummary || state.runSummary.complete)) {
			state.outputBaseline = activeCtx ? getUsageTotals(activeCtx).output : 0;
		}
		state.runSummary = summary;
		requestRender?.();
	};
}
