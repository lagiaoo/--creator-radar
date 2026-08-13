import type { NormalizeInput, UnifiedCreator } from "./models.ts";

export function normalizeCreator(input: NormalizeInput): UnifiedCreator {
  const { profile, works } = input;
  const profileStatus = input.profileStatus ?? (profile.bio || profile.followers !== undefined ? "COLLECTED" : "PARTIAL");
  const evidenceLevel = profileStatus === "COLLECTED" && works.length
    ? "PROFILE_AND_WORKS"
    : works.length ? "SEARCH_AND_WORKS" : "SEARCH_ONLY";
  const warnings = [input.warning].filter((value): value is string => Boolean(value));
  if (!profile.bio) warnings.push("缺少主页简介");
  if (profile.followers === undefined) warnings.push("缺少粉丝数据");
  if (!works.length) warnings.push("缺少近期作品样本");
  return {
    platform: "DOUYIN",
    platformAccountId: profile.douyinUniqueId || profile.douyinAccount || profile.profileUrl,
    nickname: profile.nickname.trim(), profileUrl: profile.profileUrl, bio: profile.bio?.trim() ?? "",
    followers: profile.followers ?? null, totalLikes: profile.totalLikes ?? null, works,
    evidenceLevel, profileStatus, evidenceWarnings: [...new Set(warnings)],
  };
}
