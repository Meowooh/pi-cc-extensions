// Adapted from pi-open-tui (MIT); see SOURCE.md and LICENSE in this directory.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 2000;

export interface GitCommitInfo {
	oid: string | null;
	detached: boolean;
	tag: string | null;
}

export interface GitStatus {
	branch: string | undefined;
	ahead: number;
	behind: number;
	modified: number;
	untracked: number;
	staged: number;
	stashed: number;
	conflicted: number;
	renamed: number;
	deleted: number;
	commit: GitCommitInfo | null;
}

export function emptyGitStatus(): GitStatus {
	return {
		branch: undefined,
		ahead: 0,
		behind: 0,
		modified: 0,
		untracked: 0,
		staged: 0,
		stashed: 0,
		conflicted: 0,
		renamed: 0,
		deleted: 0,
		commit: null,
	};
}

async function gitExec(args: string[], cwd: string): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync("git", args, {
			cwd,
			timeout: GIT_TIMEOUT_MS,
			maxBuffer: 1024 * 1024,
		});
		return stdout;
	} catch {
		return null;
	}
}

export async function readGitStatus(
	cwd: string,
	options: { readCommit?: boolean; readTag?: boolean; readCounts?: boolean } = {},
): Promise<GitStatus> {
	const stdout = await gitExec(
		["--no-optional-locks", "status", "--porcelain=v2", "--branch", "--show-stash", "-z"],
		cwd,
	);
	const status = emptyGitStatus();
	if (stdout === null) return status;
	let oid: string | null = null;
	const records = stdout.split("\0");
	for (let index = 0; index < records.length; index++) {
		const record = records[index];
		if (record.startsWith("# branch.head ")) {
			const head = record.slice(14);
			if (head === "(detached)") status.commit = { oid: null, detached: true, tag: null };
			else status.branch = head;
		} else if (record.startsWith("# branch.oid ")) {
			const value = record.slice(13);
			if (value !== "(initial)") oid = value;
		} else if (record.startsWith("# branch.ab ")) {
			const match = record.match(/\+(\d+) -(\d+)/);
			if (match) {
				status.ahead = Number(match[1]);
				status.behind = Number(match[2]);
			}
		} else if (record.startsWith("# stash ")) {
			status.stashed = Number(record.slice(8)) || 0;
		} else {
			// With -z a rename has a second filename record, which must not be parsed as status.
			if (record.startsWith("2 ")) index++;
			if (options.readCounts === false) continue;
			if (record.startsWith("? ")) status.untracked++;
			else if (record.startsWith("u ")) status.conflicted++;
			else if (record.startsWith("1 ") || record.startsWith("2 ")) {
				const xy = record.split(" ")[1];
				if (xy.includes("R")) status.renamed++;
				else if (xy.includes("D")) status.deleted++;
				else {
					if (xy[0] !== ".") status.staged++;
					if (xy[1] !== ".") status.modified++;
				}
			}
		}
	}
	if (options.readCommit && status.commit?.detached) {
		status.commit.oid = oid;
		if (options.readTag) {
			const tag = await gitExec(["describe", "--tags", "--exact-match", "HEAD"], cwd);
			if (tag) status.commit.tag = tag.trim();
		}
	}
	return status;
}

export function hasGitChanges(s: GitStatus): boolean {
	return (
		s.modified > 0 ||
		s.untracked > 0 ||
		s.staged > 0 ||
		s.conflicted > 0 ||
		s.renamed > 0 ||
		s.deleted > 0 ||
		s.ahead > 0 ||
		s.behind > 0
	);
}
