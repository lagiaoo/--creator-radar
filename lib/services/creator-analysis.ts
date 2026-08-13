import { CREATOR_CATEGORIES, classifyMockCategory } from "../category-taxonomy.ts";
import type { CreatorProfile, CreatorWork } from "../adapters/types.ts";

export type Recommendation = "RECOMMENDED" | "REVIEW_REQUIRED" | "NOT_RECOMMENDED";
export type EvidenceLevel = "STRONG" | "MEDIUM" | "LOW";

export type CreatorAnalysisResult = {
  matchesTarget: boolean;
  category: string;
  secondaryCategories: string[];
  creatorType: string;
  score: number;
  recommendation: Recommendation;
  recommendationLevel: "HIGH" | "OBSERVE" | "MANUAL_REVIEW" | "LOW";
  matchReason: string;
  riskReason: string;
  suggestedAction: string;
  confidence: number;
  evidenceLevel: EvidenceLevel;
  dimensions: { targetFit: number; accountConsistency: number; originality: number; contentValue: number; activityEvidence: number };
};

type RawAnalysis = Partial<CreatorAnalysisResult> & { content_score?: number; content_category?: string[]; creator_type?: string; match_reason?: string; risk_reason?: string; suggested_action?: string; matches_target?: boolean };

const SYSTEM_PROMPT = `你是百度创作者引入团队的创作者运营分析员。你的任务不是评价账号绝对好坏，而是判断“该创作者账号整体是否符合本次具体筛选目标”。

判断规则：
1. 只使用输入中的公开证据，不猜测性别、国籍、地域、身份或商业能力。只有筛选目标明确要求某属性时才判断该属性。
2. 判断对象是账号整体，不是单条命中作品。证据优先级：主页定位与近期作品集合 > 单条命中内容 > 评论等弱信号。主页与单条内容冲突时，以主页及近期作品集合为准。
3. 搜索命中只说明“为什么被发现”，不能直接证明账号长期匹配。识别偶然命中、主题漂移和内容不垂直。
4. 识别风险：标题党、合集搬运、影视切片、无固定真人或主体、无固定主题、导流、卖课、纯带货、强营销、模板化批量内容、疑似低质 AI 内容。风险必须写入 riskReason 并影响分数。
5. 粉丝量只作辅助证据，不能因为粉丝多直接推荐，也不能因为粉丝少直接否定。
6. 证据缺失必须明确说明并降低 confidence；不得把“未提供”写成“没有风险”。

Creator Fit Score：
- 0–39：低匹配，基本不符合本次目标。
- 40–59：存在弱相关或证据不足，必须人工判断。
- 60–79：较匹配但仍需补采、观察或人工复核。
- 80–100：有较完整、相互印证的账号级证据，可优先联系。

请输出一个 JSON 对象，不要输出 Markdown。字段：
matchesTarget(boolean), category, secondaryCategories(string[]), creatorType, score(0-100), matchReason, riskReason, suggestedAction, confidence(0-1), dimensions。
dimensions 必须包含 targetFit, accountConsistency, originality, contentValue, activityEvidence，均为0-100。category 只能从指定类目中选择。`;

export async function analyzeCreator(profile: CreatorProfile, works: CreatorWork[], requirement: string, config: { apiKey?: string; baseUrl?: string; model?: string; fetcher?: typeof fetch }): Promise<CreatorAnalysisResult> {
  if (!config.apiKey) throw new Error("LLM_NOT_CONFIGURED");
  const evidenceLevel = inferEvidenceLevel(profile, works);
  const evidence = [
    `【本次筛选目标】\n${requirement}`,
    `【主页证据（最高优先级）】\n昵称：${profile.nickname}\n简介：${profile.bio || "未获取"}\n粉丝数（仅辅助）：${profile.followers ?? "未获取"}`,
    `【近期作品集合（用于判断长期方向）】\n${works.length ? works.map((work, index) => `${index + 1}. ${work.title}${work.description && work.description !== work.title ? `｜${work.description}` : ""}${work.publishedAt ? `｜${work.publishedAt}` : ""}`).join("\n") : "未获取近期作品"}`,
    `【搜索命中辅助证据】\n来源链接：${profile.sourceVideoUrl || "未提供"}`,
    `【系统证据等级】${evidenceLevel}`,
    `【允许的主类目】${CREATOR_CATEGORIES.join("、")}`,
  ].join("\n\n");
  const response = await (config.fetcher ?? fetch)(`${(config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model ?? "gpt-4.1-mini", temperature: 0.1, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: evidence }] }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`LLM_ERROR_${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return normalizeCreatorAnalysis(parseModelJson(payload.choices?.[0]?.message?.content), profile, works);
}

export function normalizeCreatorAnalysis(raw: RawAnalysis, profile: CreatorProfile, works: CreatorWork[]): CreatorAnalysisResult {
  const evidenceLevel = inferEvidenceLevel(profile, works);
  let score = clamp(raw.score ?? raw.content_score, 0, 100, 0);
  let confidence = clamp(raw.confidence, 0, 1, evidenceLevel === "STRONG" ? 0.75 : evidenceLevel === "MEDIUM" ? 0.55 : 0.3);
  if (evidenceLevel === "LOW") { score = Math.min(score, 59); confidence = Math.min(confidence, 0.49); }
  if (evidenceLevel === "MEDIUM") score = Math.min(score, 79);
  const recommendation: Recommendation = score >= 80 && confidence >= 0.65 && evidenceLevel === "STRONG" ? "RECOMMENDED" : score >= 40 ? "REVIEW_REQUIRED" : "NOT_RECOMMENDED";
  const categoryInput = raw.category;
  const category = CREATOR_CATEGORIES.includes(categoryInput as never) ? categoryInput! : classifyMockCategory(`${profile.bio ?? ""} ${works.map((item) => item.title).join(" ")}`);
  const dimensions = (raw.dimensions ?? {}) as Partial<CreatorAnalysisResult["dimensions"]>;
  return {
    matchesTarget: score >= 60 && (raw.matchesTarget ?? raw.matches_target ?? true),
    category,
    secondaryCategories: stringArray(raw.secondaryCategories ?? raw.content_category).filter((item) => item !== category).slice(0, 5),
    creatorType: cleanText(raw.creatorType ?? raw.creator_type, "待人工确认"),
    score,
    recommendation,
    recommendationLevel: recommendation === "RECOMMENDED" ? "HIGH" : score >= 60 ? "OBSERVE" : score >= 40 ? "MANUAL_REVIEW" : "LOW",
    matchReason: cleanText(raw.matchReason ?? raw.match_reason, "未提供足够的匹配证据说明"),
    riskReason: cleanText(raw.riskReason ?? raw.risk_reason, "证据不足，尚不能排除原创性、稳定性或营销风险"),
    suggestedAction: cleanText(raw.suggestedAction ?? raw.suggested_action, recommendation === "RECOMMENDED" ? "优先联系" : recommendation === "REVIEW_REQUIRED" ? "补采主页及近期作品后人工复核" : "暂不引入"),
    confidence,
    evidenceLevel,
    dimensions: {
      targetFit: clamp(dimensions.targetFit, 0, 100, score),
      accountConsistency: clamp(dimensions.accountConsistency, 0, 100, evidenceLevel === "STRONG" ? 60 : 30),
      originality: clamp(dimensions.originality, 0, 100, 50),
      contentValue: clamp(dimensions.contentValue, 0, 100, 50),
      activityEvidence: clamp(dimensions.activityEvidence, 0, 100, works.some((work) => work.publishedAt) ? 60 : 20),
    },
  };
}

function inferEvidenceLevel(profile: CreatorProfile, works: CreatorWork[]): EvidenceLevel { return profile.bio && works.length >= 3 ? "STRONG" : profile.bio || works.length ? "MEDIUM" : "LOW"; }
function parseModelJson(content?: string): RawAnalysis { if (!content) return {}; try { return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "")) as RawAnalysis; } catch { throw new Error("LLM_INVALID_JSON"); } }
function clamp(value: unknown, min: number, max: number, fallback: number) { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback; }
function cleanText(value: unknown, fallback: string) { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : []; }
