import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CREATOR_FILTERS,
  hasActiveCreatorFilters,
  parseCreatorFilters,
  serializeCreatorFilters,
} from "../lib/services/creator-filters.ts";

test("creator filters round-trip as a combined selection", () => {
  const filters = {
    query: "阿城",
    category: "泛知识",
    recommendation: "RECOMMENDED",
    tianmu: "NOT_MATCHED",
    emergingOnly: true,
  };

  assert.deepEqual(parseCreatorFilters(serializeCreatorFilters(filters)), filters);
});

test("invalid stored filters fall back safely while custom categories are preserved", () => {
  assert.deepEqual(parseCreatorFilters("{broken"), DEFAULT_CREATOR_FILTERS);
  assert.deepEqual(
    parseCreatorFilters(
      JSON.stringify({
        query: 42,
        category: "不存在",
        recommendation: "UNKNOWN",
        tianmu: "UNKNOWN",
        emergingOnly: "yes",
      }),
    ),
    { ...DEFAULT_CREATOR_FILTERS, category: "不存在" },
  );
});

test("detects whether creator filters are active", () => {
  assert.equal(hasActiveCreatorFilters(DEFAULT_CREATOR_FILTERS), false);
  assert.equal(
    hasActiveCreatorFilters({
      ...DEFAULT_CREATOR_FILTERS,
      emergingOnly: true,
    }),
    true,
  );
});
