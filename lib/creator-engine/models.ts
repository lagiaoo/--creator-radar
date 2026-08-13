import type { CreatorProfile, CreatorWork } from "../adapters/types";

export type EvidenceLevel = "PROFILE_AND_WORKS" | "SEARCH_AND_WORKS" | "SEARCH_ONLY";

export type UnifiedCreator = {
  platform: "DOUYIN";
  platformAccountId: string;
  nickname: string;
  profileUrl: string;
  bio: string;
  followers: number | null;
  totalLikes: number | null;
  works: CreatorWork[];
  evidenceLevel: EvidenceLevel;
  profileStatus: "COLLECTED" | "PARTIAL" | "BLOCKED";
  evidenceWarnings: string[];
};

export type CreatorBaseScore = {
  total: number;
  profileCompleteness: number;
  activity: number;
  commercialSignals: number;
  evidenceConfidence: number;
  reasons: string[];
};

export type CreatorEngineResult = {
  creator: UnifiedCreator;
  baseScore: CreatorBaseScore;
};

export type NormalizeInput = {
  profile: CreatorProfile;
  works: CreatorWork[];
  profileStatus?: UnifiedCreator["profileStatus"];
  warning?: string;
};
