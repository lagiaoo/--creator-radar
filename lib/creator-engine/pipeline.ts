import type { NormalizeInput, CreatorEngineResult } from "./models.ts";
import { normalizeCreator } from "./normalizer.ts";
import { scoreCreatorBase } from "./scorer.ts";

export function runCreatorEngine(input: NormalizeInput): CreatorEngineResult {
  const creator = normalizeCreator(input);
  return { creator, baseScore: scoreCreatorBase(creator) };
}
