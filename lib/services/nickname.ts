export type NicknameMatch = {
  status: "MATCHED" | "NOT_MATCHED" | "REVIEW_REQUIRED";
  exactMatchCount: number;
  similarMatches: string[];
};

export function trimNickname(value: string) {
  return value.trim();
}

export function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function compareExact(source: string, target: string) {
  return trimNickname(source) === trimNickname(target);
}

export function compareNicknameResults(
  source: string,
  results: string[],
): NicknameMatch {
  const exact = results.filter((result) => compareExact(source, result));
  if (exact.length === 1) {
    return { status: "MATCHED", exactMatchCount: 1, similarMatches: [] };
  }
  if (exact.length > 1) {
    return {
      status: "REVIEW_REQUIRED",
      exactMatchCount: exact.length,
      similarMatches: exact,
    };
  }
  const compact = normalizeSpaces(source);
  const similar = results.filter((result) => normalizeSpaces(result) === compact);
  return {
    status: similar.length ? "REVIEW_REQUIRED" : "NOT_MATCHED",
    exactMatchCount: 0,
    similarMatches: similar,
  };
}
