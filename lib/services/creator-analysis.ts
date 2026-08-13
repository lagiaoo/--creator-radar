import { CREATOR_CATEGORIES, classifyMockCategory } from "../category-taxonomy";
import type { CreatorProfile, CreatorWork } from "../adapters/types";

export type CreatorAnalysisResult = { category: string; score: number; recommendation: "RECOMMENDED" | "REVIEW_REQUIRED" | "NOT_RECOMMENDED"; matchReason: string; riskReason: string; suggestedAction: string; confidence: number };

export async function analyzeCreator(profile: CreatorProfile, works: CreatorWork[], requirement: string, config: { apiKey?: string; baseUrl?: string; model?: string }): Promise<CreatorAnalysisResult> {
  if (!config.apiKey) throw new Error("LLM_NOT_CONFIGURED");
  const evidence = `筛选目标：${requirement}\n主页昵称：${profile.nickname}\n主页简介：${profile.bio ?? ""}\n粉丝数：${profile.followers ?? "未知"}\n近期作品：${works.map((work) => work.title).join(" | ")}`;
  const response = await fetch(`${(config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: config.model ?? "gpt-4.1-mini", temperature: 0.1, response_format: { type: "json_object" }, messages: [{ role: "system", content: `你是百度创作者引入分析员。判断账号整体而非单条作品。类目只能选：${CREATOR_CATEGORIES.join("、")}。输出 JSON：category, score(0-100), recommendation(RECOMMENDED/REVIEW_REQUIRED/NOT_RECOMMENDED), matchReason, riskReason, suggestedAction, confidence(0-1)。必须引用证据；证据不足要降低置信度。` }, { role: "user", content: evidence }] }) });
  if (!response.ok) throw new Error(`LLM_ERROR_${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}") as Partial<CreatorAnalysisResult>;
  const score = Math.max(0, Math.min(100, Number(parsed.score ?? 0)));
  return { category: CREATOR_CATEGORIES.includes(parsed.category as never) ? parsed.category! : classifyMockCategory(`${profile.bio} ${works.map((item) => item.title).join(" ")}`), score, recommendation: parsed.recommendation ?? (score >= 60 ? "RECOMMENDED" : score >= 40 ? "REVIEW_REQUIRED" : "NOT_RECOMMENDED"), matchReason: parsed.matchReason ?? "", riskReason: parsed.riskReason ?? "", suggestedAction: parsed.suggestedAction ?? "待人工复核", confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5))) };
}
