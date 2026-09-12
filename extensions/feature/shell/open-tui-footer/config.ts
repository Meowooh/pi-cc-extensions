import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { IconMode } from "./icons.ts";

export interface OpenTuiConfig {
	icons: { mode: IconMode };
	footerSegments: {
		cwd: boolean;
		sessionName: boolean;
		gitBranch: boolean;
		gitStatus: boolean;
		gitCommit: boolean;
		runtime: boolean;
		context: boolean;
		tokens: boolean;
		cost: boolean;
		extensionStatuses: boolean;
	};
}

// Match pi-open-tui's defaults and reuse its existing footer/icon preferences.
// Reading this file never installs the other extension or rewrites its settings.
export function loadFooterConfig(): OpenTuiConfig {
	const config: OpenTuiConfig = {
		icons: { mode: "auto" },
		footerSegments: {
			cwd: true,
			sessionName: false,
			gitBranch: true,
			gitStatus: true,
			gitCommit: false,
			runtime: true,
			context: true,
			tokens: true,
			cost: true,
			extensionStatuses: true,
		},
	};
	try {
		const source = JSON.parse(readFileSync(join(getAgentDir(), "open-tui.json"), "utf8"));
		const mode = source?.icons?.mode;
		if (mode === "auto" || mode === "nerd" || mode === "ascii") config.icons.mode = mode;
		for (const key of Object.keys(
			config.footerSegments,
		) as (keyof OpenTuiConfig["footerSegments"])[]) {
			const value = source?.footerSegments?.[key];
			if (typeof value === "boolean") config.footerSegments[key] = value;
		}
	} catch {
		// Missing or invalid settings use the same defaults as pi-open-tui.
	}
	return config;
}
