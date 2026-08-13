import type { CreatorCandidate, CreatorProfile, CreatorWork } from "./types";

export type FallbackStage = "search" | "profile" | "works";

export class FallbackCrawlerError extends Error {
  readonly type: "NOT_CONFIGURED" | "AUTH_REQUIRED" | "CAPTCHA_REQUIRED" | "NO_PERMISSION" | "TIMEOUT" | "UPSTREAM";
  readonly stage: FallbackStage;
  constructor(message: string, type: FallbackCrawlerError["type"], stage: FallbackStage) {
    super(message);
    this.name = "FallbackCrawlerError";
    this.type = type;
    this.stage = stage;
  }
}

type ServiceResponse<T> = { status?: string; data?: T; error?: string; errorType?: FallbackCrawlerError["type"] };

export class FallbackCrawlerAdapter {
  private readonly baseUrl?: string;
  private readonly token?: string;
  private readonly fetcher: typeof fetch;
  constructor(baseUrl?: string, token?: string, fetcher: typeof fetch = fetch) { this.baseUrl = baseUrl; this.token = token; this.fetcher = fetcher; }

  isConfigured() { return Boolean(this.baseUrl); }

  searchUsers(keyword: string, limit: number) {
    return this.request<CreatorCandidate[]>("search", "/v1/douyin/search", { keyword, limit }).then((rows) => rows.map(normalizeCandidate));
  }

  collectProfile(candidate: CreatorCandidate) {
    return this.request<CreatorProfile>("profile", "/v1/douyin/profile", { candidate });
  }

  collectWorks(profile: CreatorProfile, limit: number) {
    return this.request<CreatorWork[]>("works", "/v1/douyin/works", { profile, limit });
  }

  private async request<T>(stage: FallbackStage, path: string, body: unknown): Promise<T> {
    if (!this.baseUrl) throw new FallbackCrawlerError("备用采集服务未配置", "NOT_CONFIGURED", stage);
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90000),
      });
    } catch (error) {
      const timeout = error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name);
      throw new FallbackCrawlerError(timeout ? `备用采集 ${stage} 超时（90 秒）` : `备用采集 ${stage} 网络失败：${error instanceof Error ? error.message : "未知错误"}`, timeout ? "TIMEOUT" : "UPSTREAM", stage);
    }
    const payload = await safeJson<ServiceResponse<T>>(response);
    if (!response.ok || payload.status !== "ok" || payload.data === undefined) {
      throw new FallbackCrawlerError(payload.error || `备用采集 ${stage} 失败（HTTP ${response.status}）`, payload.errorType || mapStatus(response.status), stage);
    }
    return payload.data;
  }
}

async function safeJson<T>(response: Response): Promise<T> {
  try { return await response.json() as T; }
  catch { return {} as T; }
}

function mapStatus(status: number): FallbackCrawlerError["type"] {
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 403) return "NO_PERMISSION";
  return "UPSTREAM";
}

function normalizeCandidate(candidate: CreatorCandidate): CreatorCandidate {
  if (candidate.douyinUniqueId) return candidate;
  const match = candidate.profileUrl.match(/\/user\/([^/?#]+)/);
  return { ...candidate, douyinUniqueId: match?.[1] || candidate.douyinAccount };
}
