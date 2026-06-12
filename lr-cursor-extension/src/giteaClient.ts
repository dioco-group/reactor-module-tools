import { GiteaCredentials } from "./config";

interface GiteaRepo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  html_url: string;
  clone_url: string;
  owner: { login: string; full_name: string };
  fork: boolean;
  parent?: { full_name: string; owner: { login: string } };
  private: boolean;
  updated_at: string;
  permissions?: { admin: boolean; push: boolean; pull: boolean };
}

export interface CourseRepo {
  name: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  cloneUrl: string;
  owner: string;
  ownerDisplayName: string;
  isFork: boolean;
  parentFullName?: string;
  parentOwner?: string;
  isPrivate: boolean;
  updatedAt: string;
  canPush: boolean;
}

function mapRepo(r: GiteaRepo): CourseRepo {
  return {
    name: r.name,
    fullName: r.full_name,
    description: r.description,
    htmlUrl: r.html_url,
    cloneUrl: r.clone_url,
    owner: r.owner.login,
    ownerDisplayName: r.owner.full_name || r.owner.login,
    isFork: r.fork,
    parentFullName: r.parent?.full_name,
    parentOwner: r.parent?.owner?.login,
    isPrivate: r.private,
    updatedAt: r.updated_at,
    canPush: r.permissions?.push ?? false,
  };
}

async function giteaFetch(
  creds: GiteaCredentials,
  path: string,
  options: { method?: string; body?: string } = {},
): Promise<any> {
  const https = await import("https");
  const http = await import("http");
  const url = new URL(`${creds.giteaUrl}/api/v1${path}`);
  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const method = (options.method || "GET").toUpperCase();
    const body = options.body;
    const req = transport.request(
      url,
      {
        method,
        headers: {
          Authorization: `token ${creds.giteaToken}`,
          "Content-Type": "application/json",
          ...(body
            ? { "Content-Length": String(Buffer.byteLength(body)) }
            : {}),
        },
        timeout: 15000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(parsed.message || `HTTP ${res.statusCode}`));
            } else {
              resolve(parsed);
            }
          } catch {
            resolve(data);
          }
        });
      },
    );
    req.on("error", (e: Error) => reject(e));
    if (body) req.write(body);
    req.end();
  });
}

export async function getMyRepos(
  creds: GiteaCredentials,
): Promise<CourseRepo[]> {
  const repos: GiteaRepo[] = await giteaFetch(
    creds,
    "/user/repos?limit=50&sort=updated",
  );
  return repos.map(mapRepo);
}

export async function searchRepos(
  creds: GiteaCredentials,
  query?: string,
): Promise<CourseRepo[]> {
  const q = query ? `&q=${encodeURIComponent(query)}` : "";
  const result = await giteaFetch(
    creds,
    `/repos/search?limit=50&sort=updated${q}`,
  );
  const repos: GiteaRepo[] = result.data || result;
  return repos.map(mapRepo);
}

export async function forkRepo(
  creds: GiteaCredentials,
  owner: string,
  repo: string,
): Promise<CourseRepo> {
  const result: GiteaRepo = await giteaFetch(
    creds,
    `/repos/${owner}/${repo}/forks`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  return mapRepo(result);
}

export async function createRepo(
  creds: GiteaCredentials,
  name: string,
  description: string,
): Promise<CourseRepo> {
  const result: GiteaRepo = await giteaFetch(creds, "/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name,
      description,
      auto_init: true,
      default_branch: "main",
      private: false,
    }),
  });
  return mapRepo(result);
}

export async function getOrgRepos(
  creds: GiteaCredentials,
  org: string,
): Promise<CourseRepo[]> {
  const repos: GiteaRepo[] = await giteaFetch(
    creds,
    `/orgs/${org}/repos?limit=50&sort=updated`,
  );
  return repos.map(mapRepo);
}

export async function getRepo(
  creds: GiteaCredentials,
  owner: string,
  name: string,
): Promise<CourseRepo> {
  const result: GiteaRepo = await giteaFetch(creds, `/repos/${owner}/${name}`);
  return mapRepo(result);
}
