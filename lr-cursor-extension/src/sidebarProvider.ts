import * as vscode from "vscode";
import { GiteaCredentials, getGiteaCredentials } from "./config";
import {
  CourseRepo,
  getMyRepos,
  searchRepos,
  getOrgRepos,
} from "./giteaClient";
import {
  isClonedLocally,
  getLocalStatus,
  fetchRemote,
  LocalRepoStatus,
} from "./gitOps";

const LR_ORG = "LanguageReactor";

type CourseStatus = "remote" | "clean" | "dirty" | "behind" | "conflict";

interface CourseState {
  repo: CourseRepo;
  local: LocalRepoStatus | null;
  status: CourseStatus;
}

function computeStatus(
  repo: CourseRepo,
  local: LocalRepoStatus | null,
): CourseStatus {
  if (!local) return "remote";
  if (local.hasChanges && local.behind > 0) return "conflict";
  if (local.behind > 0) return "behind";
  if (local.hasChanges || local.ahead > 0) return "dirty";
  return "clean";
}

// ---------------------------------------------------------------------------
// Tree items
// ---------------------------------------------------------------------------

class SignInItem extends vscode.TreeItem {
  constructor() {
    super("Sign in to Language Reactor", vscode.TreeItemCollapsibleState.None);
    this.command = { command: "lr.signIn", title: "Sign In" };
    this.iconPath = new vscode.ThemeIcon("sign-in");
  }
}

class SectionItem extends vscode.TreeItem {
  section: "my" | "official" | "community";

  constructor(
    label: string,
    section: "my" | "official" | "community",
    count?: number,
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.section = section;
    this.contextValue = `section-${section}`;
    const iconMap = {
      my: "folder",
      official: "organization",
      community: "globe",
    };
    this.iconPath = new vscode.ThemeIcon(iconMap[section]);
    if (count !== undefined) this.description = `${count}`;
  }
}

export class CourseItem extends vscode.TreeItem {
  repo: CourseRepo;
  status: CourseStatus;

  constructor(state: CourseState) {
    super(state.repo.name, vscode.TreeItemCollapsibleState.None);
    this.repo = state.repo;
    this.status = state.status;

    const canPush = state.repo.canPush;
    const isFork = state.repo.isFork;

    // Description and icon based on status
    switch (state.status) {
      case "remote":
        this.description = "not downloaded";
        this.iconPath = new vscode.ThemeIcon("cloud");
        break;
      case "clean":
        this.description = "\u2713 up to date";
        this.iconPath = new vscode.ThemeIcon("check");
        break;
      case "dirty": {
        const parts: string[] = [];
        if (state.local?.hasChanges) parts.push("modified");
        if (state.local && state.local.ahead > 0)
          parts.push(`${state.local.ahead} unpushed`);
        this.description = `\u25CF ${parts.join(", ")}`;
        this.iconPath = new vscode.ThemeIcon("diff-modified");
        break;
      }
      case "behind":
        this.description = "\u2193 update available";
        this.iconPath = new vscode.ThemeIcon("cloud-download");
        break;
      case "conflict":
        this.description = "\u2191\u2193 update first, then upload";
        this.iconPath = new vscode.ThemeIcon("warning");
        break;
    }

    // Tooltip
    const lines = [state.repo.fullName];
    if (state.repo.description) lines.push(state.repo.description);
    if (isFork && state.repo.parentFullName)
      lines.push(`Forked from ${state.repo.parentFullName}`);
    if (canPush) lines.push("You have push access");
    this.tooltip = lines.join("\n");

    // Context value encodes status + permissions for menu when-clauses
    // Pattern: course_{local|remote}_{status}_{push|readonly}[_fork]
    const loc = state.status === "remote" ? "remote" : "local";
    const perm = canPush ? "push" : "readonly";
    const fork = isFork ? "_fork" : "";
    this.contextValue = `course_${loc}_${state.status}_${perm}${fork}`;
  }
}

class EmptyItem extends vscode.TreeItem {
  constructor(label: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon("info");
  }
}

class ErrorItem extends vscode.TreeItem {
  constructor(message: string) {
    super(`Error: ${message}`, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon("error");
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class CourseSidebarProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChange = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private context: vscode.ExtensionContext;
  private creds: GiteaCredentials | null = null;

  private myStates: CourseState[] = [];
  private officialStates: CourseState[] = [];
  private communityStates: CourseState[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async refresh(): Promise<void> {
    this.creds = await getGiteaCredentials(this.context);
    if (!this.creds) {
      this.myStates = [];
      this.officialStates = [];
      this.communityStates = [];
      this._onDidChange.fire(undefined);
      return;
    }

    try {
      const [myRepos, orgRepos, allRepos] = await Promise.all([
        getMyRepos(this.creds),
        getOrgRepos(this.creds, LR_ORG).catch(() => [] as CourseRepo[]),
        searchRepos(this.creds),
      ]);

      const myNames = new Set(myRepos.map((r) => r.fullName));
      const orgNames = new Set(orgRepos.map((r) => r.fullName));

      // Fetch local status for all local repos in parallel
      const allRepoNames = new Set<string>();
      for (const r of [...myRepos, ...orgRepos, ...allRepos]) {
        allRepoNames.add(r.name);
      }

      const localStatusMap = new Map<string, LocalRepoStatus | null>();
      await Promise.all(
        [...allRepoNames].map(async (name) => {
          if (isClonedLocally(name)) {
            try {
              await fetchRemote(name);
            } catch {
              // fetch may fail if offline
            }
            localStatusMap.set(name, await getLocalStatus(name));
          } else {
            localStatusMap.set(name, null);
          }
        }),
      );

      const toState = (repo: CourseRepo): CourseState => {
        const local = localStatusMap.get(repo.name) ?? null;
        return { repo, local, status: computeStatus(repo, local) };
      };

      this.myStates = myRepos.map(toState);
      this.officialStates = orgRepos
        .filter((r) => !myNames.has(r.fullName))
        .map(toState);
      this.communityStates = allRepos
        .filter(
          (r) =>
            !myNames.has(r.fullName) &&
            !orgNames.has(r.fullName) &&
            r.owner !== this.creds!.giteaUsername,
        )
        .map(toState);
    } catch (e: any) {
      this.myStates = [];
      this.officialStates = [];
      this.communityStates = [];
      vscode.window.showErrorMessage(`Failed to load courses: ${e.message}`);
    }

    this._onDidChange.fire(undefined);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!this.creds) return [new SignInItem()];

    if (!element) {
      const sections: vscode.TreeItem[] = [];
      sections.push(new SectionItem("My Courses", "my", this.myStates.length));
      if (this.officialStates.length > 0) {
        sections.push(
          new SectionItem(
            "LanguageReactor",
            "official",
            this.officialStates.length,
          ),
        );
      }
      if (this.communityStates.length > 0) {
        sections.push(
          new SectionItem(
            "Community",
            "community",
            this.communityStates.length,
          ),
        );
      }
      return sections;
    }

    if (element instanceof SectionItem) {
      const statesMap = {
        my: this.myStates,
        official: this.officialStates,
        community: this.communityStates,
      };
      const states = statesMap[element.section];
      if (states.length === 0) {
        if (element.section === "my")
          return [new EmptyItem('No courses yet. Use "+" to create one.')];
        return [new EmptyItem("No courses found.")];
      }
      return states.map((s) => new CourseItem(s));
    }

    return [];
  }
}
