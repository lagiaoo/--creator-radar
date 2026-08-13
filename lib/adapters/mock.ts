import { creators } from "../mock-data";
import { compareNicknameResults } from "../services/nickname";
import type {
  CreatorCandidate,
  CreatorProfile,
  CreatorWork,
  DouyinSearchAdapter,
  LoginStatus,
  TianmuCheckAdapter,
  TianmuCheckResult,
} from "./types";

export class MockDouyinSearchAdapter implements DouyinSearchAdapter {
  async initializeSession() {}
  async checkLoginStatus(): Promise<LoginStatus> {
    return "AUTHENTICATED";
  }
  async searchByKeyword(keyword: string, limit: number): Promise<CreatorCandidate[]> {
    return creators
      .filter((creator) =>
        `${creator.keyword}${creator.subcategory}${creator.reasoning}`.includes(
          keyword.slice(0, 2),
        ),
      )
      .slice(0, limit)
      .map((creator) => ({
        douyinUniqueId: creator.id,
        douyinAccount: creator.douyinAccount,
        nickname: creator.nickname,
        profileUrl: `https://www.douyin.com/user/${creator.id}`,
        sourceVideoUrl: `https://www.douyin.com/video/mock-${creator.id}`,
      }));
  }
  async collectCreatorProfile(candidate: CreatorCandidate): Promise<CreatorProfile> {
    const creator = creators.find((item) => item.nickname === candidate.nickname);
    return {
      ...candidate,
      bio: creator?.bio,
      followers: creator?.followers,
      totalLikes: creator?.totalLikes,
    };
  }
  async collectRecentWorks(profile: CreatorProfile, limit: number): Promise<CreatorWork[]> {
    return (
      creators.find((creator) => creator.nickname === profile.nickname)?.works ?? []
    )
      .slice(0, limit)
      .map((work) => ({
        platformWorkId: work.id,
        title: work.title,
        workUrl: `https://www.douyin.com/video/${work.id}`,
        publishedAt: work.publishedAt,
      }));
  }
  async pause() {}
  async close() {}
}

export class MockTianmuCheckAdapter implements TianmuCheckAdapter {
  async initializeSession() {}
  async checkLoginStatus(): Promise<LoginStatus> {
    return "AUTHENTICATED";
  }
  async openAuthorPool() {}
  async searchByNickname(nickname: string): Promise<TianmuCheckResult> {
    const mockResults =
      nickname === "小林的城市漫游"
        ? [nickname, nickname]
        : creators.some(
              (creator) =>
                creator.nickname === nickname && creator.tianmuStatus === "MATCHED",
            )
          ? [nickname]
          : [];
    const comparison = compareNicknameResults(nickname, mockResults);
    return {
      originalNickname: nickname,
      queryNickname: nickname.trim(),
      resultCount: mockResults.length,
      exactMatchCount: comparison.exactMatchCount,
      exactMatchNicknames: mockResults.filter((item) => item.trim() === nickname.trim()),
      similarMatchNicknames: comparison.similarMatches,
      status: comparison.status,
      requiresManualReview: comparison.status === "REVIEW_REQUIRED",
    };
  }
  async pause() {}
  async close() {}
}
