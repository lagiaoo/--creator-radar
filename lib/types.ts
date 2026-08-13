export type Recommendation = "RECOMMENDED" | "REVIEW_REQUIRED" | "NOT_RECOMMENDED";
export type TianmuStatus =
  | "NOT_CHECKED"
  | "MATCHED"
  | "NOT_MATCHED"
  | "REVIEW_REQUIRED"
  | "LOGIN_EXPIRED"
  | "NO_PERMISSION";
export type FinalStatus =
  | "RECOMMENDED_FOR_BD"
  | "ALREADY_IN_TIANMU"
  | "MANUAL_REVIEW"
  | "DO_NOT_CONTACT"
  | "DATA_ERROR";

export type CRMStage =
  | "TO_CONTACT"
  | "CONTACTED"
  | "IN_DISCUSSION"
  | "INTENT_CONFIRMED"
  | "ONBOARDED"
  | "PAUSED"
  | "REJECTED";

export type CRMRecord = {
  id: string;
  creatorId: string;
  stage: CRMStage;
  owner: string;
  contactInfo: string;
  lastContactAt: string;
  nextFollowUpAt: string;
  note: string;
  addedAt: string;
  updatedAt: string;
};

export type Work = {
  id: string;
  title: string;
  format: string;
  infoValue: "高" | "中" | "低";
  baiduFit: "高" | "中" | "低";
  likes: number;
  publishedAt: string;
};

export type Creator = {
  id: string;
  nickname: string;
  douyinAccount: string;
  profileUrl: string;
  category: string;
  subcategory: string;
  bio: string;
  followers: number;
  totalLikes: number;
  verticality: number;
  targetRatio: number;
  originalityRisk: "低" | "中" | "高";
  recommendation: Recommendation;
  tianmuStatus: TianmuStatus;
  finalStatus: FinalStatus;
  emerging: boolean;
  keyword: string;
  reasoning: string;
  avatarColor: string;
  works: Work[];
};

export type SearchTask = {
  id: string;
  name: string;
  category: string;
  keywords: string[];
  targetRequirement: string;
  resultLimitPerKeyword: number;
  worksLimitPerCreator: number;
  estimatedApiCalls: number;
  checkpoint: { keywordIndex: number; creatorIndex: number };
  pauseReason: string;
  failures: TaskFailure[];
  status: "PENDING" | "RUNNING" | "PAUSED" | "WAITING_MANUAL" | "PARTIAL" | "COMPLETED";
  progress: number;
  discovered: number;
  recommended: number;
  checked: number;
  bdReady: number;
  lastRun: string;
};

export type TaskFailure = {
  id: string;
  creatorId?: string;
  creatorName: string;
  stage: "SEARCH" | "PROFILE" | "WORKS" | "TIANMU";
  errorType: "LOGIN_REQUIRED" | "CAPTCHA_REQUIRED" | "PLATFORM_BLOCKED" | "API_TIMEOUT" | "RATE_LIMITED" | "NO_PERMISSION";
  message: string;
  retryCount: number;
  status: "PENDING" | "RETRYING" | "SKIPPED" | "RESOLVED";
};

export type TaskLog = {
  id: string;
  time: string;
  level: "INFO" | "WARN" | "ERROR";
  module: string;
  action: string;
  message: string;
};
