import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCreatorAnalysis } from "../lib/services/creator-analysis.ts";

const profile = (overrides = {}) => ({
  douyinUniqueId: "creator-1",
  nickname: "测试作者",
  profileUrl: "https://example.com/creator-1",
  ...overrides,
});

const work = (index) => ({
  platformWorkId: `work-${index}`,
  title: `近期作品 ${index}`,
  workUrl: `https://example.com/work-${index}`,
});

test("单条搜索命中不能凭模型高分直接进入推荐池", () => {
  const result = normalizeCreatorAnalysis({ score: 95, confidence: 0.96, matchesTarget: true }, profile(), []);
  assert.equal(result.evidenceLevel, "LOW");
  assert.equal(result.score, 59);
  assert.equal(result.confidence, 0.49);
  assert.equal(result.recommendation, "REVIEW_REQUIRED");
  assert.equal(result.matchesTarget, false);
});

test("主页与至少三条近期作品相互印证后才允许高优先级推荐", () => {
  const result = normalizeCreatorAnalysis({ score: 88, confidence: 0.86, category: "科技", matchesTarget: true, dimensions: { targetFit: 92, accountConsistency: 84, originality: 78, contentValue: 81, activityEvidence: 74 } }, profile({ bio: "持续分享人工智能工具与科技产品" }), [work(1), work(2), work(3)]);
  assert.equal(result.evidenceLevel, "STRONG");
  assert.equal(result.recommendation, "RECOMMENDED");
  assert.equal(result.recommendationLevel, "HIGH");
  assert.equal(result.category, "科技");
});

test("只有主页或少量作品时最高进入观察复核", () => {
  const result = normalizeCreatorAnalysis({ content_score: 91, confidence: 0.9, content_category: ["科技", "科学"], creator_type: "知识型创作者" }, profile({ bio: "科技科普" }), []);
  assert.equal(result.evidenceLevel, "MEDIUM");
  assert.equal(result.score, 79);
  assert.equal(result.recommendation, "REVIEW_REQUIRED");
  assert.equal(result.recommendationLevel, "OBSERVE");
  assert.equal(result.category, "科学");
  assert.deepEqual(result.secondaryCategories, ["科技"]);
});
