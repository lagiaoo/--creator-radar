import type {
  CreatorCandidate,
  CreatorProfile,
  CreatorWork,
  DouyinSearchAdapter,
  LoginStatus,
  TianmuCheckAdapter,
  TianmuCheckResult,
} from "./types";

const NOT_CONFIGURED =
  "真实页面适配器尚未配置。请先由有权限的用户登录页面，并在 selectors 配置中确认稳定定位器。";

export class PlaywrightDouyinSearchAdapter implements DouyinSearchAdapter {
  async initializeSession(): Promise<void> {
    throw new Error(NOT_CONFIGURED);
  }
  async checkLoginStatus(): Promise<LoginStatus> {
    return "LOGIN_REQUIRED";
  }
  async searchByKeyword(keyword: string, limit: number): Promise<CreatorCandidate[]> {
    void keyword;
    void limit;
    throw new Error(NOT_CONFIGURED);
  }
  async collectCreatorProfile(candidate: CreatorCandidate): Promise<CreatorProfile> {
    void candidate;
    throw new Error(NOT_CONFIGURED);
  }
  async collectRecentWorks(profile: CreatorProfile, limit: number): Promise<CreatorWork[]> {
    void profile;
    void limit;
    throw new Error(NOT_CONFIGURED);
  }
  async pause() {}
  async close() {}
}

export class PlaywrightTianmuCheckAdapter implements TianmuCheckAdapter {
  async initializeSession(): Promise<void> {
    throw new Error(NOT_CONFIGURED);
  }
  async checkLoginStatus(): Promise<LoginStatus> {
    return "LOGIN_REQUIRED";
  }
  async openAuthorPool(): Promise<void> {
    throw new Error(NOT_CONFIGURED);
  }
  async searchByNickname(nickname: string): Promise<TianmuCheckResult> {
    void nickname;
    throw new Error(NOT_CONFIGURED);
  }
  async pause() {}
  async close() {}
}
