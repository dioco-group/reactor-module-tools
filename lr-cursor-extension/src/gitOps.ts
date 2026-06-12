import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import { GiteaCredentials } from "./config";
import { CourseRepo } from "./giteaClient";

export interface LocalRepoStatus {
  hasChanges: boolean;
  ahead: number;
  behind: number;
}

export function getCoursesDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const dir = path.join(home, "lr-courses");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function authedCloneUrl(repo: CourseRepo, creds: GiteaCredentials): string {
  const url = new URL(repo.cloneUrl);
  url.username = creds.giteaUsername;
  url.password = creds.giteaToken;
  return url.toString();
}

function exec(cmd: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.exec(cmd, { cwd, timeout: 60000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

export function getLocalRepoPath(repoName: string): string | null {
  const dir = path.join(getCoursesDir(), repoName);
  return fs.existsSync(dir) ? dir : null;
}

export function isClonedLocally(repoName: string): boolean {
  return getLocalRepoPath(repoName) !== null;
}

export async function cloneRepo(
  repo: CourseRepo,
  creds: GiteaCredentials,
): Promise<string> {
  const coursesDir = getCoursesDir();
  const targetDir = path.join(coursesDir, repo.name);

  if (fs.existsSync(targetDir)) {
    await exec("git pull", targetDir);
    return targetDir;
  }

  const url = authedCloneUrl(repo, creds);
  await exec(`git clone "${url}" "${targetDir}"`, coursesDir);
  await exec(`git config user.email "${creds.giteaUsername}@lr"`, targetDir);
  await exec(`git config user.name "${creds.giteaUsername}"`, targetDir);

  return targetDir;
}

export async function pullRepo(repoName: string): Promise<void> {
  const dir = getLocalRepoPath(repoName);
  if (!dir) throw new Error("Course not downloaded locally");
  await exec("git fetch -q", dir);
  await exec("git pull", dir);
}

export async function hasLocalChanges(repoName: string): Promise<boolean> {
  const dir = getLocalRepoPath(repoName);
  if (!dir) return false;
  const status = await exec("git status --porcelain", dir);
  return status.length > 0;
}

export async function commitAndPush(
  repoDir: string,
  message: string,
): Promise<void> {
  await exec("git add -A", repoDir);
  const status = await exec("git status --porcelain", repoDir);
  if (!status) {
    vscode.window.showInformationMessage("No changes to upload.");
    return;
  }
  await exec(`git commit -m "${message.replace(/"/g, '\\"')}"`, repoDir);
  await exec("git push", repoDir);
}

export async function fetchRemote(repoName: string): Promise<void> {
  const dir = getLocalRepoPath(repoName);
  if (!dir) return;
  await exec("git fetch -q", dir);
}

export async function getLocalStatus(
  repoName: string,
): Promise<LocalRepoStatus | null> {
  const dir = getLocalRepoPath(repoName);
  if (!dir) return null;

  const status = await exec("git status --porcelain", dir);
  const hasChanges = status.length > 0;

  let ahead = 0;
  let behind = 0;
  try {
    const branch = await exec("git rev-parse --abbrev-ref HEAD", dir);
    const tracking = `origin/${branch}`;
    const aheadStr = await exec(`git rev-list ${tracking}..HEAD --count`, dir);
    ahead = parseInt(aheadStr) || 0;
    const behindStr = await exec(`git rev-list HEAD..${tracking} --count`, dir);
    behind = parseInt(behindStr) || 0;
  } catch {
    // No remote tracking branch yet
  }

  return { hasChanges, ahead, behind };
}

export function openCourseFolder(repoName: string): void {
  const dir = getLocalRepoPath(repoName);
  if (!dir) return;
  const uri = vscode.Uri.file(dir);

  const ws = vscode.workspace.getWorkspaceFolder(uri);
  if (ws) {
    vscode.commands.executeCommand("revealInExplorer", uri);
  } else {
    const coursesUri = vscode.Uri.file(getCoursesDir());
    const folders = vscode.workspace.workspaceFolders || [];
    const alreadyAdded = folders.some(
      (f) => f.uri.fsPath === coursesUri.fsPath,
    );
    if (!alreadyAdded) {
      vscode.workspace.updateWorkspaceFolders(folders.length, 0, {
        uri: coursesUri,
        name: "LR Courses",
      });
    }
    setTimeout(
      () => vscode.commands.executeCommand("revealInExplorer", uri),
      500,
    );
  }
}
