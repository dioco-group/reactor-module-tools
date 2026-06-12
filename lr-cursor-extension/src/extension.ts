import * as vscode from "vscode";
import { ModulePreviewPanel } from "./previewPanel";
import { lintModuleText } from "./parser/diagnostics";
import { CourseSidebarProvider, CourseItem } from "./sidebarProvider";
import { signIn, getGiteaCredentials, GiteaCredentials } from "./config";
import {
  cloneRepo,
  commitAndPush,
  pullRepo,
  getLocalRepoPath,
  openCourseFolder,
} from "./gitOps";
import { forkRepo, createRepo } from "./giteaClient";
import { ModuleDocumentSymbolProvider } from "./outlineProvider";
import { checkForUpdates } from "./updater";

const diagnosticCollection =
  vscode.languages.createDiagnosticCollection("lr-module");
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(diagnosticCollection);

  checkForUpdates();

  // --- Status bar ---
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    50,
  );
  statusBarItem.command = "lr.signIn";
  context.subscriptions.push(statusBarItem);
  updateStatusBar(context);

  // --- Sidebar ---
  const sidebar = new CourseSidebarProvider(context);
  const treeView = vscode.window.createTreeView("lr.courseExplorer", {
    treeDataProvider: sidebar,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);
  sidebar.refresh();

  // --- Outline view ---
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { language: "module" },
      new ModuleDocumentSymbolProvider(),
    ),
  );

  // --- Auth ---
  context.subscriptions.push(
    vscode.commands.registerCommand("lr.signIn", async () => {
      await signIn(context);
      sidebar.refresh();
      updateStatusBar(context);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("lr.signOut", async () => {
      await context.secrets.delete("lr.giteaToken");
      await context.secrets.delete("lr.giteaUsername");
      await context.secrets.delete("lr.giteaUrl");
      vscode.window.showInformationMessage("Signed out.");
      sidebar.refresh();
      updateStatusBar(context);
    }),
  );

  // --- Course management ---
  context.subscriptions.push(
    vscode.commands.registerCommand("lr.refreshCourses", () =>
      sidebar.refresh(),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("lr.createCourse", async () => {
      const creds = await getGiteaCredentials(context);
      if (!creds) {
        vscode.window.showWarningMessage("Sign in first.");
        return;
      }
      const name = await vscode.window.showInputBox({
        prompt: "Course name (lowercase, hyphens)",
        placeHolder: "my-french-course",
        validateInput: (v) =>
          /^[a-z0-9][a-z0-9-]*$/.test(v)
            ? null
            : "Lowercase letters, numbers, hyphens only",
      });
      if (!name) return;
      const description =
        (await vscode.window.showInputBox({
          prompt: "Course description",
          placeHolder: "A beginner French course",
        })) || "";

      try {
        const repo = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Creating course...",
          },
          () => createRepo(creds, name, description),
        );
        vscode.window.showInformationMessage(`Course "${name}" created!`);
        sidebar.refresh();

        const action = await vscode.window.showInformationMessage(
          `Download "${name}" now?`,
          "Download",
        );
        if (action === "Download") {
          await downloadAndReveal(repo, creds);
          sidebar.refresh();
        }
      } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to create course: ${e.message}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "lr.downloadCourse",
      async (item?: CourseItem) => {
        const creds = await getGiteaCredentials(context);
        if (!creds || !item?.repo) return;
        await downloadAndReveal(item.repo, creds);
        sidebar.refresh();
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "lr.openCourse",
      async (item?: CourseItem) => {
        if (!item?.repo) return;
        openCourseFolder(item.repo.name);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "lr.uploadChanges",
      async (item?: CourseItem) => {
        const repo = item?.repo;
        if (!repo) return;
        const localPath = getLocalRepoPath(repo.name);
        if (!localPath) {
          vscode.window.showWarningMessage("Course not downloaded locally.");
          return;
        }

        if (item.status === "conflict" || item.status === "behind") {
          vscode.window.showWarningMessage(
            "Remote has newer changes. Update first, then upload.",
          );
          return;
        }

        const message = await vscode.window.showInputBox({
          prompt: "Describe your changes",
          placeHolder: "Updated dialogue in lesson 2",
        });
        if (!message) return;

        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Uploading changes...",
            },
            () => commitAndPush(localPath, message),
          );
          vscode.window.showInformationMessage("Changes uploaded!");
          sidebar.refresh();

          // If this is a fork, offer to create a PR
          if (repo.isFork && repo.parentFullName) {
            const pr = await vscode.window.showInformationMessage(
              "Create a Pull Request to propose your changes?",
              "Create PR",
            );
            if (pr === "Create PR") {
              const prUrl = `${repo.htmlUrl.replace(`/${repo.owner}/${repo.name}`, `/${repo.parentOwner}/${repo.parentFullName?.split("/")[1]}`)}/compare/main...${repo.owner}:main`;
              vscode.env.openExternal(vscode.Uri.parse(prUrl));
            }
          }
        } catch (e: any) {
          vscode.window.showErrorMessage(`Upload failed: ${e.message}`);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "lr.updateCourse",
      async (item?: CourseItem) => {
        const repo = item?.repo;
        if (!repo) return;
        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Updating ${repo.name}...`,
            },
            () => pullRepo(repo.name),
          );
          vscode.window.showInformationMessage(`${repo.name} updated!`);
          sidebar.refresh();
        } catch (e: any) {
          vscode.window.showErrorMessage(`Update failed: ${e.message}`);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "lr.forkCourse",
      async (item?: CourseItem) => {
        const creds = await getGiteaCredentials(context);
        const repo = item?.repo;
        if (!creds || !repo) return;
        try {
          const forked = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Forking course...",
            },
            () => forkRepo(creds, repo.owner, repo.name),
          );
          vscode.window.showInformationMessage(
            `Forked "${repo.name}" to your account!`,
          );
          sidebar.refresh();

          const action = await vscode.window.showInformationMessage(
            "Download your fork now?",
            "Download",
          );
          if (action === "Download") {
            await downloadAndReveal(forked, creds);
            sidebar.refresh();
          }
        } catch (e: any) {
          vscode.window.showErrorMessage(`Fork failed: ${e.message}`);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "lr.createPR",
      async (item?: CourseItem) => {
        const repo = item?.repo;
        if (!repo || !repo.isFork || !repo.parentFullName) {
          vscode.window.showWarningMessage(
            "PR creation is only available for forked courses.",
          );
          return;
        }
        const creds = await getGiteaCredentials(context);
        if (!creds) return;

        const [parentOwner, parentName] = repo.parentFullName.split("/");
        const prUrl = `${creds.giteaUrl}/${parentOwner}/${parentName}/compare/main...${repo.owner}:main`;
        vscode.env.openExternal(vscode.Uri.parse(prUrl));
      },
    ),
  );

  // --- Open on Gitea ---
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "lr.openOnGitea",
      async (item?: CourseItem) => {
        if (item?.repo) {
          vscode.env.openExternal(vscode.Uri.parse(item.repo.htmlUrl));
          return;
        }
        // Fallback: open current file on Gitea
        const creds = await getGiteaCredentials(context);
        if (!creds) {
          vscode.window.showWarningMessage("Sign in first.");
          return;
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(
          editor.document.uri,
        );
        if (!workspaceFolder) return;
        const repoName = workspaceFolder.name;
        const relativePath = vscode.workspace.asRelativePath(
          editor.document.uri,
          false,
        );
        const url = `${creds.giteaUrl}/${creds.giteaUsername}/${repoName}/src/branch/main/${relativePath}`;
        vscode.env.openExternal(vscode.Uri.parse(url));
      },
    ),
  );

  // --- Preview ---
  context.subscriptions.push(
    vscode.commands.registerCommand("lr.openPreview", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !isModuleFile(editor.document)) {
        vscode.window.showWarningMessage("Open a .module file first.");
        return;
      }
      const panel = ModulePreviewPanel.createOrShow(
        context.extensionUri,
        vscode.Uri.joinPath(editor.document.uri, ".."),
      );
      panel.update(editor.document);
    }),
  );

  // --- Diagnostics + live update ---
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (isModuleFile(doc)) {
        ModulePreviewPanel.currentPanel?.update(doc);
        updateDiagnostics(doc);
      }
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (isModuleFile(e.document)) updateDiagnostics(e.document);
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && isModuleFile(editor.document)) {
        ModulePreviewPanel.currentPanel?.update(editor.document);
        updateDiagnostics(editor.document);
      }
    }),
  );

  // --- Auto-open preview when .module file is opened ---
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (isModuleFile(doc) && !ModulePreviewPanel.currentPanel) {
        setTimeout(() => {
          if (vscode.window.activeTextEditor?.document === doc) {
            const panel = ModulePreviewPanel.createOrShow(
              context.extensionUri,
              vscode.Uri.joinPath(doc.uri, ".."),
            );
            panel.update(doc);
          }
        }, 500);
      }
    }),
  );

  // Run diagnostics on already-open .module files
  if (
    vscode.window.activeTextEditor &&
    isModuleFile(vscode.window.activeTextEditor.document)
  ) {
    updateDiagnostics(vscode.window.activeTextEditor.document);
  }
}

async function updateStatusBar(
  context: vscode.ExtensionContext,
): Promise<void> {
  const creds = await getGiteaCredentials(context);
  if (creds) {
    statusBarItem.text = `$(person) LR: ${creds.giteaUsername}`;
    statusBarItem.tooltip = `Signed in to ${creds.giteaUrl} as ${creds.giteaUsername}. Click to manage.`;
    statusBarItem.command = "lr.signOut";
  } else {
    statusBarItem.text = "$(sign-in) LR: Sign In";
    statusBarItem.tooltip = "Sign in to LR Courses";
    statusBarItem.command = "lr.signIn";
  }
  statusBarItem.show();
}

async function downloadAndReveal(
  repo: import("./giteaClient").CourseRepo,
  creds: GiteaCredentials,
): Promise<void> {
  try {
    const dir = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Downloading ${repo.name}...`,
      },
      () => cloneRepo(repo, creds),
    );
    vscode.window.showInformationMessage(`Downloaded ${repo.name}!`);
    openCourseFolder(repo.name);
  } catch (e: any) {
    vscode.window.showErrorMessage(`Download failed: ${e.message}`);
  }
}

function isModuleFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith(".module");
}

function updateDiagnostics(doc: vscode.TextDocument): void {
  const results = lintModuleText(doc.getText());
  const diags = results.map((d) => {
    const line = Math.max(0, d.line - 1);
    const range = doc.lineAt(Math.min(line, doc.lineCount - 1)).range;
    const severity =
      d.severity === "error"
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Warning;
    const diag = new vscode.Diagnostic(range, d.message, severity);
    if (d.code) diag.code = d.code;
    diag.source = "lr-module";
    return diag;
  });
  diagnosticCollection.set(doc.uri, diags);
}

export function deactivate(): void {
  diagnosticCollection.dispose();
  statusBarItem?.dispose();
}
