import * as vscode from "vscode";
import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const GITHUB_REPO = "dioco-group/lr-cursor-extension";

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  assets: { name: string; browser_download_url: string }[];
}

function getCurrentVersion(): string {
  const ext = vscode.extensions.getExtension("language-reactor.lr-course-editor");
  return ext?.packageJSON?.version ?? "0.0.0";
}

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

function fetchJSON(url: string): Promise<GitHubRelease> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "lr-course-editor" } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return fetchJSON(res.headers.location!).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`GitHub API ${res.statusCode}`));
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.setTimeout(10_000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (u: string) => {
      https.get(u, { headers: { "User-Agent": "lr-course-editor" } }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          return follow(res.headers.location!);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed: ${res.statusCode}`));
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => { file.close(); resolve(); });
        file.on("error", (e) => { fs.unlinkSync(dest); reject(e); });
      }).on("error", reject);
    };
    follow(url);
  });
}

export async function checkForUpdates(): Promise<void> {
  try {
    const release = await fetchJSON(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
    );

    const current = getCurrentVersion();
    const latest = release.tag_name.replace(/^v/, "");

    if (compareVersions(latest, current) <= 0) return;

    const vsixAsset = release.assets.find((a) => a.name.endsWith(".vsix"));
    if (!vsixAsset) {
      const action = await vscode.window.showInformationMessage(
        `LR Course Editor v${latest} is available (you have v${current}).`,
        "View Release",
      );
      if (action === "View Release") {
        vscode.env.openExternal(vscode.Uri.parse(release.html_url));
      }
      return;
    }

    const action = await vscode.window.showInformationMessage(
      `LR Course Editor v${latest} is available (you have v${current}).`,
      "Install Update",
      "View Release",
    );

    if (action === "View Release") {
      vscode.env.openExternal(vscode.Uri.parse(release.html_url));
    } else if (action === "Install Update") {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Downloading v${latest}...` },
        async () => {
          const tmpPath = path.join(os.tmpdir(), vsixAsset.name);
          await downloadFile(vsixAsset.browser_download_url, tmpPath);
          await vscode.commands.executeCommand(
            "workbench.extensions.installExtension",
            vscode.Uri.file(tmpPath),
          );
          fs.unlinkSync(tmpPath);
        },
      );

      const reload = await vscode.window.showInformationMessage(
        `LR Course Editor updated to v${latest}. Reload to activate.`,
        "Reload Now",
      );
      if (reload === "Reload Now") {
        vscode.commands.executeCommand("workbench.action.reloadWindow");
      }
    }
  } catch {
    // Silent fail — don't bother users if the check fails
  }
}
