import type { CreatorCandidate, CreatorProfile, CreatorWork } from "./types";

const BASE_URL = "https://api.tikhub.io";

export class TikHubError extends Error {
  readonly type: "UNAUTHORIZED" | "RATE_LIMITED" | "INSUFFICIENT_BALANCE" | "TIMEOUT" | "UPSTREAM";
  readonly endpoint: string;
  readonly statusCode?: number;
  readonly businessCode?: number;
  constructor(message: string, type: "UNAUTHORIZED" | "RATE_LIMITED" | "INSUFFICIENT_BALANCE" | "TIMEOUT" | "UPSTREAM", details: { endpoint: string; statusCode?: number; businessCode?: number }) {
    super(message);
    this.name = "TikHubError";
    this.type = type;
    this.endpoint = details.endpoint;
    this.statusCode = details.statusCode;
    this.businessCode = details.businessCode;
  }
}

type Json = Record<string, unknown>;

export class TikHubDouyinAdapter {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly retryDelayMs: number;
  constructor(apiKey: string, fetcher: typeof fetch = fetch, retryDelayMs = 1200) { this.apiKey = apiKey; this.fetcher = fetcher; this.retryDelayMs = retryDelayMs; }

  async searchUsers(keyword: string, limit: number): Promise<CreatorCandidate[]> {
    const payload = await this.request("/api/v1/douyin/search/fetch_user_search", {
      method: "POST", body: JSON.stringify({ keyword, cursor: 0, douyin_user_fans: "", douyin_user_type: "", search_id: "" }),
    }, "用户搜索", 1);
    return findObjects(payload)
      .map(toCandidate)
      .filter((item): item is CreatorCandidate => Boolean(item?.nickname && item.profileUrl))
      .filter((item, index, rows) => rows.findIndex((row) => row.douyinUniqueId === item.douyinUniqueId || row.profileUrl === item.profileUrl) === index)
      .slice(0, limit);
  }

  async collectProfiles(candidates: CreatorCandidate[]): Promise<CreatorProfile[]> {
    const profiles: CreatorProfile[] = [];
    for (const candidate of candidates) {
      if (!candidate.douyinUniqueId) { profiles.push({ ...candidate }); continue; }
      const query = new URLSearchParams({ sec_user_id: candidate.douyinUniqueId });
      const payload = await this.request(`/api/v1/douyin/app/v3/handler_user_profile?${query}`, {}, "作者主页");
      profiles.push(findObjects(payload).map(toProfile).find((item): item is CreatorProfile => Boolean(item?.nickname)) ?? { ...candidate });
    }
    return profiles;
  }

  async collectWorks(profile: CreatorProfile, limit: number): Promise<CreatorWork[]> {
    if (!profile.douyinUniqueId) return [];
    const query = new URLSearchParams({ sec_user_id: profile.douyinUniqueId, max_cursor: "0", count: String(Math.min(limit, 20)), sort_type: "0" });
    const payload = await this.request(`/api/v1/douyin/app/v3/fetch_user_post_videos?${query}`, {}, "近期作品");
    return findObjects(payload).map(toWork).filter((item): item is CreatorWork => Boolean(item?.platformWorkId && item.title)).slice(0, limit);
  }

  private async request(path: string, init: RequestInit = {}, stage = "接口", retries = 0): Promise<Json> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.requestOnce(path, init, stage); }
      catch (error) {
        if (!(error instanceof TikHubError) || error.type !== "TIMEOUT" || attempt >= retries) throw error;
        await delay(this.retryDelayMs * (attempt + 1));
      }
    }
  }

  private async requestOnce(path: string, init: RequestInit, stage: string): Promise<Json> {
    let response: Response;
    try {
      response = await this.fetcher(`${BASE_URL}${path}`, { ...init, headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", ...init.headers }, signal: AbortSignal.timeout(60000) });
    } catch (error) {
      const timeout = error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name);
      if (timeout) throw new TikHubError(`TikHub ${stage}超时（60 秒，接口 ${path}）`, "TIMEOUT", { endpoint: path });
      throw new TikHubError(`TikHub ${stage}网络请求失败（接口 ${path}）：${error instanceof Error ? error.message : "未知网络错误"}`, "UPSTREAM", { endpoint: path });
    }
    const payload = await parsePayload(response);
    const businessCode = numericCode(payload.code);
    const details = { endpoint: path, statusCode: response.status, businessCode };
    if (response.status === 401 || response.status === 403) throw new TikHubError(`TikHub ${stage}鉴权失败（HTTP ${response.status}，接口 ${path}）`, "UNAUTHORIZED", details);
    if (response.status === 429) throw new TikHubError(`TikHub ${stage}请求频率受限（HTTP 429，接口 ${path}）`, "RATE_LIMITED", details);
    const message = String(payload.message_zh ?? payload.message ?? "TikHub 请求失败");
    if (!response.ok || businessCode !== 200) {
      const suffix = `HTTP ${response.status}${businessCode === undefined ? "" : ` / code ${businessCode}`}，接口 ${path}`;
      if (/余额|balance|credit/i.test(message) || response.status === 402) throw new TikHubError(`TikHub ${stage}余额不足：${message}（${suffix}）`, "INSUFFICIENT_BALANCE", details);
      throw new TikHubError(`TikHub ${stage}失败：${message}（${suffix}）`, "UPSTREAM", details);
    }
    return payload;
  }
}

async function parsePayload(response: Response): Promise<Json> {
  const body = await response.text();
  try { return body ? JSON.parse(body) as Json : {}; }
  catch { return { message: body.slice(0, 200) || "上游返回了无法解析的响应" }; }
}

function numericCode(value: unknown) { const code = Number(value); return Number.isFinite(code) ? code : undefined; }
function delay(ms: number) { return ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve(); }

function findObjects(value: unknown, output: Json[] = []): Json[] {
  if (Array.isArray(value)) value.forEach((item) => findObjects(item, output));
  else if (value && typeof value === "object") { output.push(value as Json); Object.values(value as Json).forEach((item) => findObjects(item, output)); }
  return output;
}

function text(row: Json, ...keys: string[]) { for (const key of keys) if (typeof row[key] === "string" && row[key]) return row[key] as string; return ""; }
function num(row: Json, ...keys: string[]) { for (const key of keys) if (typeof row[key] === "number") return row[key] as number; return undefined; }

function toCandidate(row: Json): CreatorCandidate | null {
  const nickname = text(row, "nickname", "nick_name"); const sec = text(row, "sec_uid", "sec_user_id"); const unique = text(row, "unique_id", "short_id");
  if (!nickname || (!sec && !unique)) return null;
  return { douyinUniqueId: sec || unique, douyinAccount: unique, nickname, profileUrl: sec ? `https://www.douyin.com/user/${sec}` : `https://www.douyin.com/user/${unique}`, sourceVideoUrl: "" };
}
function toProfile(row: Json): CreatorProfile | null { const candidate = toCandidate(row); return candidate ? { ...candidate, bio: text(row, "signature", "bio", "description"), followers: num(row, "follower_count", "followers"), totalLikes: num(row, "total_favorited", "total_likes") } : null; }
function toWork(row: Json): CreatorWork | null { const id = text(row, "aweme_id", "item_id", "id"); const title = text(row, "desc", "title"); if (!id || !title) return null; const timestamp = num(row, "create_time"); return { platformWorkId: id, title, description: title, workUrl: `https://www.douyin.com/video/${id}`, publishedAt: timestamp ? new Date(timestamp * 1000).toISOString() : undefined }; }
