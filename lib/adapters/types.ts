export type LoginStatus = "AUTHENTICATED" | "LOGIN_REQUIRED" | "NO_PERMISSION";

export type CreatorCandidate = {
  douyinUniqueId?: string;
  douyinAccount?: string;
  nickname: string;
  profileUrl: string;
  sourceVideoUrl: string;
};

export type CreatorProfile = CreatorCandidate & {
  avatarUrl?: string;
  bio?: string;
  followers?: number;
  totalLikes?: number;
};

export type CreatorWork = {
  platformWorkId: string;
  title: string;
  description?: string;
  workUrl: string;
  publishedAt?: string;
};

export interface DouyinSearchAdapter {
  initializeSession(): Promise<void>;
  checkLoginStatus(): Promise<LoginStatus>;
  searchByKeyword(keyword: string, limit: number): Promise<CreatorCandidate[]>;
  collectCreatorProfile(candidate: CreatorCandidate): Promise<CreatorProfile>;
  collectRecentWorks(profile: CreatorProfile, limit: number): Promise<CreatorWork[]>;
  pause(): Promise<void>;
  close(): Promise<void>;
}

export type TianmuCheckResult = {
  originalNickname: string;
  queryNickname: string;
  resultCount: number;
  exactMatchCount: number;
  exactMatchNicknames: string[];
  similarMatchNicknames: string[];
  status:
    | "MATCHED"
    | "NOT_MATCHED"
    | "REVIEW_REQUIRED"
    | "FAILED"
    | "NO_PERMISSION"
    | "LOGIN_EXPIRED";
  requiresManualReview: boolean;
  errorReason?: string;
};

export interface TianmuCheckAdapter {
  initializeSession(): Promise<void>;
  checkLoginStatus(): Promise<LoginStatus>;
  openAuthorPool(): Promise<void>;
  searchByNickname(nickname: string): Promise<TianmuCheckResult>;
  pause(): Promise<void>;
  close(): Promise<void>;
}
