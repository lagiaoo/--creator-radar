import assert from "node:assert/strict";
import test from "node:test";
import { runCreatorEngine } from "../lib/creator-engine/pipeline.ts";

const profile = { douyinUniqueId: "sec-1", nickname: "小林实验室", profileUrl: "https://www.douyin.com/user/sec-1", sourceVideoUrl: "", bio: "每周做科学实验", followers: 12000, totalLikes: 300000 };

test("creator engine keeps business-independent evidence scores", () => {
  const result = runCreatorEngine({ profile, works: [
    { platformWorkId: "1", title: "水的表面张力实验", workUrl: "https://www.douyin.com/video/1", publishedAt: new Date().toISOString() },
    { platformWorkId: "2", title: "自制简易显微镜", workUrl: "https://www.douyin.com/video/2", publishedAt: new Date().toISOString() },
  ] });
  assert.equal(result.creator.evidenceLevel, "PROFILE_AND_WORKS");
  assert.equal(result.creator.profileStatus, "COLLECTED");
  assert.ok(result.baseScore.profileCompleteness >= 80);
  assert.ok(result.baseScore.evidenceConfidence >= 90);
});

test("creator engine retains search-only candidates with low confidence", () => {
  const result = runCreatorEngine({ profile: { douyinUniqueId: "sec-2", nickname: "受限作者", profileUrl: "https://www.douyin.com/user/sec-2", sourceVideoUrl: "" }, works: [], profileStatus: "BLOCKED", warning: "主页访问受限" });
  assert.equal(result.creator.evidenceLevel, "SEARCH_ONLY");
  assert.equal(result.creator.profileStatus, "BLOCKED");
  assert.ok(result.baseScore.evidenceConfidence < 50);
  assert.ok(result.baseScore.reasons.includes("主页访问受限"));
});
