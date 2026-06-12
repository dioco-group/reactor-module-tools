import * as vscode from "vscode";

const DEFAULT_GITEA_URL = "https://courses.languagereactor.com";

export interface GiteaCredentials {
  giteaToken: string;
  giteaUsername: string;
  giteaUrl: string;
}

export async function getGiteaCredentials(
  context: vscode.ExtensionContext,
): Promise<GiteaCredentials | null> {
  const token = await context.secrets.get("lr.giteaToken");
  const username = await context.secrets.get("lr.giteaUsername");
  const url = await context.secrets.get("lr.giteaUrl");
  if (!token || !username) return null;
  return {
    giteaToken: token,
    giteaUsername: username,
    giteaUrl: url || DEFAULT_GITEA_URL,
  };
}

export async function setGiteaCredentials(
  context: vscode.ExtensionContext,
  creds: GiteaCredentials,
): Promise<void> {
  await context.secrets.store("lr.giteaToken", creds.giteaToken);
  await context.secrets.store("lr.giteaUsername", creds.giteaUsername);
  await context.secrets.store("lr.giteaUrl", creds.giteaUrl);
}

async function verifyGiteaToken(url: string, token: string): Promise<string> {
  const https = await import("https");
  const http = await import("http");
  const endpoint = new URL(`${url}/api/v1/user`);
  const transport = endpoint.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      endpoint,
      {
        method: "GET",
        headers: { Authorization: `token ${token}` },
        timeout: 10000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode === 200 && parsed.login) {
              resolve(parsed.login);
            } else {
              reject(new Error(parsed.message || "Invalid token"));
            }
          } catch {
            reject(new Error("Invalid response from server"));
          }
        });
      },
    );
    req.on("error", (e: Error) => reject(e));
    req.end();
  });
}

async function createTokenViaBasicAuth(
  giteaUrl: string,
  username: string,
  password: string,
): Promise<string> {
  const https = await import("https");
  const http = await import("http");
  const endpoint = new URL(`${giteaUrl}/api/v1/users/${username}/tokens`);
  const transport = endpoint.protocol === "https:" ? https : http;
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  const body = JSON.stringify({
    name: `lr-cursor-${Date.now()}`,
    scopes: [
      "write:repository",
      "write:user",
      "write:organization",
      "write:issue",
      "read:repository",
      "read:user",
      "read:organization",
      "read:issue",
    ],
  });

  return new Promise((resolve, reject) => {
    const req = transport.request(
      endpoint,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(body)),
        },
        timeout: 10000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode === 201 && parsed.sha1) {
              resolve(parsed.sha1);
            } else {
              reject(new Error(parsed.message || `HTTP ${res.statusCode}`));
            }
          } catch {
            reject(new Error("Invalid response"));
          }
        });
      },
    );
    req.on("error", (e: Error) => reject(e));
    req.write(body);
    req.end();
  });
}

export async function signIn(
  context: vscode.ExtensionContext,
): Promise<GiteaCredentials | null> {
  const giteaUrl = await vscode.window.showInputBox({
    prompt: "Gitea URL",
    value: DEFAULT_GITEA_URL,
    placeHolder: DEFAULT_GITEA_URL,
  });
  if (!giteaUrl) return null;

  const method = await vscode.window.showQuickPick(
    [
      {
        label: "Access Token",
        description:
          "Paste a Gitea access token (from Settings > Applications)",
        value: "token",
      },
      {
        label: "Username & Password",
        description: "Sign in with your Gitea credentials",
        value: "password",
      },
    ],
    { placeHolder: "How would you like to sign in?" },
  );
  if (!method) return null;

  if (method.value === "token") {
    const token = await vscode.window.showInputBox({
      prompt:
        "Gitea Access Token (from Settings > Applications on courses.languagereactor.com)",
      password: true,
    });
    if (!token) return null;

    try {
      const username = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Verifying token...",
        },
        () => verifyGiteaToken(giteaUrl, token),
      );
      const creds: GiteaCredentials = {
        giteaToken: token,
        giteaUsername: username,
        giteaUrl,
      };
      await setGiteaCredentials(context, creds);
      vscode.window.showInformationMessage(`Signed in as ${username}`);
      return creds;
    } catch (e: any) {
      vscode.window.showErrorMessage(`Sign in failed: ${e.message}`);
      return null;
    }
  } else {
    const username = await vscode.window.showInputBox({
      prompt: "Gitea Username",
    });
    if (!username) return null;
    const password = await vscode.window.showInputBox({
      prompt: "Gitea Password",
      password: true,
    });
    if (!password) return null;

    try {
      const token = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Signing in...",
        },
        () => createTokenViaBasicAuth(giteaUrl, username, password),
      );
      const creds: GiteaCredentials = {
        giteaToken: token,
        giteaUsername: username,
        giteaUrl,
      };
      await setGiteaCredentials(context, creds);
      vscode.window.showInformationMessage(`Signed in as ${username}`);
      return creds;
    } catch (e: any) {
      vscode.window.showErrorMessage(`Sign in failed: ${e.message}`);
      return null;
    }
  }
}
