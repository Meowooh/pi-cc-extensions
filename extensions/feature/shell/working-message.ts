import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatDuration } from "../../utils/format.ts";

const REFRESH_INTERVAL_MS = 1_000;
type ContentBlock = {
	type?: unknown;
	text?: unknown;
	thinking?: unknown;
	thinkingSignature?: { body?: unknown };
};

type StreamMessage = {
	content?: unknown;
	usage?: { output?: unknown };
};

/** 每个 content index 的可见文本/思考长度；无对应块的 index 保持稀疏洞。 */
function textBlockLengths(message: StreamMessage): number[] {
	const content = message.content;
	if (!Array.isArray(content)) return [];
	const lengths: number[] = [];
	for (let index = 0; index < content.length; index++) {
		const block = content[index] as ContentBlock;
		if (block?.type === "text" && typeof block.text === "string") {
			lengths[index] = block.text.length;
		} else if (block?.type === "thinking") {
			const text = block.thinking ?? block.thinkingSignature?.body;
			if (typeof text === "string") lengths[index] = text.length;
		}
	}
	return lengths;
}

function outputUsage(message: StreamMessage): number {
	const value = Number(message?.usage?.output);
	return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

export type RunSummary = {
	duration: string;
	tokens: number;
	complete: boolean;
};

/**
 * Keep Pi's native spinner and plain `Working` label. Publish run timing and
 * output to the shared two-row footer.
 *
 * Count the whole agent run, including tool calls and subsequent turns. Live
 * tokens use chars/4 until the provider supplies usage.output for that turn.
 */
export default function (
	pi: ExtensionAPI,
	setRunSummary: (summary: RunSummary | undefined) => void,
): void {
	let runActive = false;
	let turnActive = false;
	let agentStartTime: number | undefined;
	let completedOutputTokens = 0;
	let responseLength = 0;
	let responseTextBlockLengths: number[] = [];
	let providerOutputTokens = 0;
	let refreshTimer: ReturnType<typeof setTimeout> | null = null;
	let summary: RunSummary | undefined;
	let activeCtx: ExtensionContext | undefined;

	function tokenCount(): number {
		return providerOutputTokens || Math.max(0, Math.round(responseLength / 4));
	}

	function setTextBlockLength(index: number, length: number): void {
		const previous = responseTextBlockLengths[index] ?? 0;
		responseTextBlockLengths[index] = Math.max(0, length);
		responseLength = Math.max(0, responseLength + responseTextBlockLengths[index] - previous);
	}

	function resetResponseTracking(message?: StreamMessage): void {
		responseTextBlockLengths = message ? textBlockLengths(message) : [];
		responseLength = responseTextBlockLengths.reduce((sum, length) => sum + length, 0);
		providerOutputTokens = message ? outputUsage(message) : 0;
	}

	function updateProviderUsage(message: StreamMessage): void {
		const output = outputUsage(message);
		if (output > 0) providerOutputTokens = output;
	}

	function syncBottomLine(): void {
		if (agentStartTime === undefined) return;
		const next: RunSummary = {
			duration: formatDuration(Math.max(0, Date.now() - agentStartTime)) || "0s",
			tokens: completedOutputTokens + tokenCount(),
			complete: !runActive,
		};
		if (
			next.duration === summary?.duration &&
			next.tokens === summary.tokens &&
			next.complete === summary.complete
		)
			return;
		summary = next;
		setRunSummary(summary);
	}

	function scheduleRefreshTick(): void {
		if (!runActive || refreshTimer) return;
		refreshTimer = setTimeout(() => {
			refreshTimer = null;
			try {
				syncBottomLine();
			} finally {
				scheduleRefreshTick();
			}
		}, REFRESH_INTERVAL_MS);
		refreshTimer.unref?.();
	}

	function stopRefreshLoop(): void {
		if (!refreshTimer) return;
		clearTimeout(refreshTimer);
		refreshTimer = null;
	}

	function clearDisplay(): void {
		stopRefreshLoop();
		runActive = false;
		turnActive = false;
		agentStartTime = undefined;
		completedOutputTokens = 0;
		resetResponseTracking();
		summary = undefined;
		setRunSummary(undefined);
		activeCtx?.ui.setWorkingMessage();
		activeCtx = undefined;
	}

	function startRun(ctx: ExtensionContext): void {
		stopRefreshLoop();
		activeCtx = ctx;
		runActive = true;
		agentStartTime = Date.now();
		completedOutputTokens = 0;
		resetResponseTracking();
		ctx.ui.setWorkingMessage("Working");
		syncBottomLine();
		scheduleRefreshTick();
	}

	pi.on("session_start", () => clearDisplay());

	pi.on("agent_start", (_event, ctx) => {
		if (!ctx.hasUI || ctx.mode !== "tui") return;
		startRun(ctx);
	});

	pi.on("turn_start", async (_event, ctx) => {
		if (!ctx.hasUI || ctx.mode !== "tui") return;
		if (!runActive) startRun(ctx);
		turnActive = true;
		activeCtx = ctx;
		resetResponseTracking();
		syncBottomLine();
	});

	pi.on("message_update", async (event, ctx) => {
		if (!runActive || !turnActive) return;
		activeCtx = ctx;
		const evt = event?.assistantMessageEvent;
		if (!evt) return;

		if (evt.type === "start") {
			resetResponseTracking(evt.partial);
		} else if (evt.type === "thinking_start" || evt.type === "text_start") {
			setTextBlockLength(evt.contentIndex, 0);
			updateProviderUsage(evt.partial);
		} else if (evt.type === "thinking_delta" || evt.type === "text_delta") {
			const add = typeof evt.delta === "string" ? evt.delta.length : 0;
			setTextBlockLength(evt.contentIndex, (responseTextBlockLengths[evt.contentIndex] ?? 0) + add);
			updateProviderUsage(evt.partial);
		} else if (evt.type === "text_end") {
			setTextBlockLength(
				evt.contentIndex,
				typeof evt.content === "string" ? evt.content.length : 0,
			);
			updateProviderUsage(evt.partial);
		} else if (evt.type === "done") {
			resetResponseTracking(evt.message);
		} else if (evt.type === "error") {
			resetResponseTracking(evt.error);
		} else {
			updateProviderUsage(evt.partial);
		}

		syncBottomLine();
	});

	pi.on("message_end", (event) => {
		if (!runActive || !turnActive || event.message?.role !== "assistant") return;
		resetResponseTracking(event.message);
		syncBottomLine();
	});

	pi.on("turn_end", async (event, ctx) => {
		if (!runActive || !turnActive) return;
		turnActive = false;
		activeCtx = ctx;
		if (event.message?.role === "assistant") resetResponseTracking(event.message);
		completedOutputTokens += tokenCount();
		resetResponseTracking();
		syncBottomLine();
	});

	pi.on("agent_end", async () => {
		if (!runActive) return;
		runActive = false;
		turnActive = false;
		stopRefreshLoop();
		syncBottomLine();
		activeCtx?.ui.setWorkingMessage();
		// Keep the final duration visible in the footer until the next run.
		agentStartTime = undefined;
	});

	pi.on("session_shutdown", () => clearDisplay());
}
