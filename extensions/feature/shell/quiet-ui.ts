import { stripVTControlCharacters } from "node:util";
import { FooterComponent, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { sliceByColumn, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { patchRegistry, QUIET_FOOTER_PATCH } from "../../utils/patch-keys.ts";

type Footer = InstanceType<typeof FooterComponent>;
type FooterRender = (this: Footer, width: number) => string[];
type FooterPatch = { dispose(): void };

/**
 * Keep Pi's native accounting, context warnings, subscription labels and extension
 * statuses. Only reflow its two status columns. A wide measurement prevents Pi's
 * original layout from dropping the model before we can move it to the left.
 */
function modelFirstFooter(lines: string[], width: number): string[] | undefined {
	const status = lines[1];
	if (!status) return undefined;
	// Native FooterComponent separates usage and model with at least two spaces.
	const plain = stripVTControlCharacters(status);
	const gap = / {2,}/.exec(plain);
	if (!gap) return undefined;
	const statsWidth = visibleWidth(plain.slice(0, gap.index));
	const modelStart = statsWidth + gap[0].length;
	const stats = sliceByColumn(status, 0, statsWidth);
	const model = sliceByColumn(status, modelStart, visibleWidth(status) - modelStart);
	const modelWidth = visibleWidth(model);
	const available = Math.max(0, width - 2);
	const statsBudget = Math.min(
		statsWidth,
		available - Math.min(modelWidth, Math.floor(available / 2)),
	);
	const modelBudget = Math.max(0, available - statsBudget);
	const left = truncateToWidth(model, modelBudget, "…");
	// Context is at the end of the usage column: preserve it when space is tight.
	const right =
		statsWidth <= statsBudget
			? stats
			: statsBudget > 1
				? `…${sliceByColumn(status, statsWidth - statsBudget + 1, statsBudget - 1, true)}`
				: "";
	const padding = " ".repeat(Math.max(0, width - visibleWidth(left) - visibleWidth(right)));
	const result = lines.map((line) => truncateToWidth(line, width, "..."));
	result[1] = width < 4 ? truncateToWidth(model, width, "") : left + padding + right;
	return result;
}

export function installModelFirstFooter(): () => void {
	patchRegistry.get<FooterPatch>(QUIET_FOOTER_PATCH)?.dispose();
	const prototype = FooterComponent.prototype;
	const original: FooterRender = prototype.render;
	let active = true;
	const installed: FooterRender = function (width) {
		if (!active) return original.call(this, width);
		const lines = original.call(this, Math.max(4_096, width));
		return modelFirstFooter(lines, width) ?? original.call(this, width);
	};
	const patch: FooterPatch = {
		dispose() {
			active = false;
			if (prototype.render === installed) prototype.render = original;
			patchRegistry.dispose(QUIET_FOOTER_PATCH, patch);
		},
	};
	prototype.render = installed;
	patchRegistry.install(QUIET_FOOTER_PATCH, patch);
	return () => patch.dispose();
}

export default function quietUi(pi: ExtensionAPI): void {
	let disposeFooter: (() => void) | undefined;
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		ctx.ui.setWorkingIndicator();
		ctx.ui.setWorkingMessage("Working");
		ctx.ui.setHiddenThinkingLabel("Thinking");
		disposeFooter = installModelFirstFooter();
	});
	pi.on("session_shutdown", () => {
		disposeFooter?.();
		disposeFooter = undefined;
	});
}
