import assert from "node:assert/strict";
import test from "node:test";
import { FallbackCrawlerAdapter, FallbackCrawlerError } from "../lib/adapters/fallback-service.ts";

test("fallback adapter sends authenticated search request", async () => {
  let request;
  const adapter = new FallbackCrawlerAdapter("http://127.0.0.1:8010/", "secret", async (url, init) => {
    request = { url: String(url), init };
    return Response.json({ status: "ok", data: [{ nickname: "备用作者", profileUrl: "https://www.douyin.com/user/1", sourceVideoUrl: "" }] });
  });
  const rows = await adapter.searchUsers("科学", 5);
  assert.equal(rows[0].nickname, "备用作者");
  assert.equal(rows[0].douyinUniqueId, "1");
  assert.equal(request.url, "http://127.0.0.1:8010/v1/douyin/search");
  assert.equal(request.init.headers.Authorization, "Bearer secret");
});

test("fallback adapter preserves manual-intervention error type", async () => {
  const adapter = new FallbackCrawlerAdapter("http://127.0.0.1:8010", "", async () => Response.json({ status: "error", errorType: "CAPTCHA_REQUIRED", error: "请人工完成验证码" }, { status: 409 }));
  await assert.rejects(() => adapter.searchUsers("科学", 5), (error) => error instanceof FallbackCrawlerError && error.type === "CAPTCHA_REQUIRED");
});
