export type CreatorFilters = {
  query: string;
  category: string;
  recommendation: string;
  tianmu: string;
  emergingOnly: boolean;
};

export const CREATOR_FILTERS_STORAGE_KEY = "creator-radar:creator-filters:v1";

export const DEFAULT_CREATOR_FILTERS: CreatorFilters = {
  query: "",
  category: "全部类目",
  recommendation: "全部结果",
  tianmu: "全部状态",
  emergingOnly: false,
};

const recommendations = new Set([
  "全部结果",
  "RECOMMENDED",
  "REVIEW_REQUIRED",
  "NOT_RECOMMENDED",
]);
const tianmuStatuses = new Set([
  "全部状态",
  "NOT_MATCHED",
  "MATCHED",
  "REVIEW_REQUIRED",
  "NOT_CHECKED",
]);

export function parseCreatorFilters(raw: string | null): CreatorFilters {
  if (!raw) return DEFAULT_CREATOR_FILTERS;

  try {
    const stored = JSON.parse(raw) as Partial<CreatorFilters>;
    return {
      query: typeof stored.query === "string" ? stored.query : "",
      category: typeof stored.category === "string" && stored.category.trim()
        ? stored.category
        : DEFAULT_CREATOR_FILTERS.category,
      recommendation:
        typeof stored.recommendation === "string" &&
        recommendations.has(stored.recommendation)
          ? stored.recommendation
          : DEFAULT_CREATOR_FILTERS.recommendation,
      tianmu:
        typeof stored.tianmu === "string" && tianmuStatuses.has(stored.tianmu)
          ? stored.tianmu
          : DEFAULT_CREATOR_FILTERS.tianmu,
      emergingOnly:
        typeof stored.emergingOnly === "boolean" ? stored.emergingOnly : false,
    };
  } catch {
    return DEFAULT_CREATOR_FILTERS;
  }
}

export function serializeCreatorFilters(filters: CreatorFilters) {
  return JSON.stringify(filters);
}

export function hasActiveCreatorFilters(filters: CreatorFilters) {
  return (
    filters.query !== DEFAULT_CREATOR_FILTERS.query ||
    filters.category !== DEFAULT_CREATOR_FILTERS.category ||
    filters.recommendation !== DEFAULT_CREATOR_FILTERS.recommendation ||
    filters.tianmu !== DEFAULT_CREATOR_FILTERS.tianmu ||
    filters.emergingOnly !== DEFAULT_CREATOR_FILTERS.emergingOnly
  );
}
