import type { CreatorBaseScore, UnifiedCreator } from "./models.ts";

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function scoreCreatorBase(creator: UnifiedCreator): CreatorBaseScore {
  const profileCompleteness = clamp(
    20 + (creator.nickname ? 15 : 0) + (creator.bio ? 25 : 0) +
    (creator.followers !== null ? 15 : 0) + (creator.totalLikes !== null ? 10 : 0) +
    Math.min(15, creator.works.length * 3),
  );
  const recentPublished = creator.works.filter((work) => {
    if (!work.publishedAt) return false;
    return Date.now() - new Date(work.publishedAt).getTime() <= 90 * 86400000;
  }).length;
  const activity = clamp(20 + Math.min(50, creator.works.length * 7) + Math.min(30, recentPublished * 6));
  const commercialSignals = clamp(15 + (creator.followers !== null ? Math.min(45, Math.log10(Math.max(10, creator.followers)) * 10) : 0) + (creator.totalLikes ? 15 : 0) + (creator.bio ? 15 : 0));
  const evidenceConfidence = creator.evidenceLevel === "PROFILE_AND_WORKS" ? 95 : creator.evidenceLevel === "SEARCH_AND_WORKS" ? 65 : 35;
  const total = clamp(profileCompleteness * 0.4 + activity * 0.35 + commercialSignals * 0.25);
  return { total, profileCompleteness, activity, commercialSignals, evidenceConfidence, reasons: creator.evidenceWarnings };
}
