import assert from "node:assert/strict";
import test from "node:test";
import {
  compareExact,
  compareNicknameResults,
  normalizeSpaces,
  trimNickname,
} from "../lib/services/nickname.ts";

test("trims only nickname edge whitespace for exact matches", () => {
  assert.equal(trimNickname("  阿城讲古建  "), "阿城讲古建");
  assert.equal(compareExact(" 阿城讲古建", "阿城讲古建 "), true);
});

test("preserves special characters", () => {
  assert.equal(compareExact("小林（旅行）", "小林旅行"), false);
  assert.equal(compareExact("阿梨✨", "阿梨"), false);
});

test("returns matched for one exact result", () => {
  assert.deepEqual(compareNicknameResults("林律师说法", ["林律师说法"]), {
    status: "MATCHED",
    exactMatchCount: 1,
    similarMatches: [],
  });
});

test("requires review for duplicate exact results", () => {
  assert.equal(
    compareNicknameResults("小林", ["小林", "小林"]).status,
    "REVIEW_REQUIRED",
  );
});

test("returns not matched for an empty result", () => {
  assert.equal(compareNicknameResults("小周实验室", []).status, "NOT_MATCHED");
});

test("normalizes repeated spaces only for review hints", () => {
  assert.equal(normalizeSpaces("  阿城   讲古建 "), "阿城 讲古建");
  assert.equal(
    compareNicknameResults("阿城  讲古建", ["阿城 讲古建"]).status,
    "REVIEW_REQUIRED",
  );
});
