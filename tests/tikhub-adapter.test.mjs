import assert from "node:assert/strict";
import test from "node:test";
import { TikHubDouyinAdapter, TikHubError } from "../lib/adapters/tikhub.ts";

test("TikHub adapter parses and deduplicates user search results", async () => {
  const adapter = new TikHubDouyinAdapter("test", async () => Response.json({ code: 200, data: { user_list: [
    { user_info: { nickname: "科学小林", sec_uid: "sec-1", unique_id: "science_lin", signature: "科学实验" } },
    { user_info: { nickname: "科学小林", sec_uid: "sec-1", unique_id: "science_lin" } },
  ] } }));
  const rows = await adapter.searchUsers("科学", 10);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nickname, "科学小林");
  assert.equal(rows[0].douyinUniqueId, "sec-1");
});

test("TikHub adapter classifies rate limits", async () => {
  const adapter = new TikHubDouyinAdapter("test", async () => new Response("{}", { status: 429 }));
  await assert.rejects(() => adapter.searchUsers("科学", 10), (error) => error instanceof TikHubError && error.type === "RATE_LIMITED" && error.statusCode === 429 && error.endpoint.includes("fetch_user_search"));
});

test("TikHub user search retries one timeout and then succeeds", async () => {
  let calls = 0;
  const adapter = new TikHubDouyinAdapter("test", async () => {
    calls += 1;
    if (calls === 1) throw new DOMException("timed out", "TimeoutError");
    return Response.json({ code: 200, data: { user_list: [{ user_info: { nickname: "重试成功", sec_uid: "sec-retry" } }] } });
  }, 0);
  const rows = await adapter.searchUsers("科学", 10);
  assert.equal(calls, 2);
  assert.equal(rows[0].nickname, "重试成功");
});

test("TikHub errors contain endpoint and business code", async () => {
  const adapter = new TikHubDouyinAdapter("test", async () => Response.json({ code: 40004, message_zh: "参数无效" }, { status: 400 }));
  await assert.rejects(() => adapter.collectWorks({ nickname: "测试", douyinUniqueId: "sec-1", profileUrl: "https://example.com", sourceVideoUrl: "" }, 3), (error) => error instanceof TikHubError && error.businessCode === 40004 && /近期作品失败/.test(error.message) && /fetch_user_post_videos/.test(error.message));
});

test("TikHub adapter uses low-cost single profile endpoint", async () => {
  const calls = [];
  const adapter = new TikHubDouyinAdapter("test", async (url) => {
    calls.push(String(url));
    return Response.json({ code: 200, data: { user: { nickname: "科学小林", sec_uid: "sec-1", unique_id: "science_lin", signature: "科学实验", follower_count: 1200 } } });
  });
  const rows = await adapter.collectProfiles([{ nickname: "科学小林", douyinUniqueId: "sec-1", profileUrl: "https://www.douyin.com/user/sec-1", sourceVideoUrl: "" }]);
  assert.equal(rows[0].followers, 1200);
  assert.match(calls[0], /\/api\/v1\/douyin\/app\/v3\/handler_user_profile\?sec_user_id=sec-1/);
  assert.doesNotMatch(calls[0], /fetch_batch_user_profile/);
});
