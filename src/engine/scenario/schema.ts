import { z } from 'zod';

export const FlagS = z.string();
export const CondS = z.object({ all: z.array(FlagS).optional(), none: z.array(FlagS).optional() });
export const SpeakerS = z.enum(['judge', 'clerk', 'prosecutor', 'defense', 'witness', 'defendant', 'thought']);
// thought: 재판장(플레이어)의 속생각. 법정에서 말해지지 않으므로 좌석·마이크·공판조서와 무관하다.
export const ViolationS = z.object({
  id: z.string(), text: z.string(), affectsJudgment: z.boolean(), lostCards: z.array(z.string()),
});
export const LineS = z.object({
  id: z.string(),
  speaker: SpeakerS,
  text: z.string(),
  when: CondS.optional(),
  sets: z.array(FlagS).optional(),
  yieldsCards: z.array(z.string()).optional(),
  revokesCards: z.array(z.string()).optional(),
  interrupt: z.object({
    legit: z.boolean(), resumeAt: z.string(), sets: z.array(FlagS).optional(), violation: ViolationS.optional(),
  }).optional(),
  objection: z.object({
    by: z.enum(['prosecutor', 'defense']),
    correct: z.enum(['sustain', 'overrule']),
    onSustain: z.object({ resumeAt: z.string(), sets: z.array(FlagS).optional() }),
    onOverrule: z.object({ sets: z.array(FlagS).optional() }).optional(),
    violation: ViolationS,
  }).optional(),
});
export const SuppQuestionS = z.object({
  id: z.string(), cellId: z.string(), kind: z.enum(['clarify', 'proxy', 'bias']), text: z.string(),
  answer: z.array(LineS), violation: ViolationS.optional(),
});
export const ExamS = z.object({
  id: z.string(), kind: z.enum(['witness', 'defendant']), name: z.string(),
  lines: z.array(LineS), supplementary: z.array(SuppQuestionS),
  unlocksEvidence: z.array(z.object({ evidenceId: z.string(), when: CondS.optional() })).optional(),
});
export const EvidenceS = z.object({
  id: z.string(), label: z.string(), submittedBy: z.enum(['prosecutor', 'defense']),
  consent: z.boolean(), body: z.string(), cardId: z.string().optional(),
});
export const CardS = z.object({
  // memo: 겹쳐 더듬기로 찾은 어긋남(판사 메모). 증거가 아니라 쟁점 칸의 판단 근거로만 쓴다.
  id: z.string(), title: z.string(), text: z.string(), kind: z.enum(['evidence', 'fact', 'memo']),
  confession: z.boolean().optional(),
  /** 검사의 입증취지: 이 증거가 나오면 자동으로 막으러 올라가는 칸(쟁점) id. */
  proves: z.array(z.string()).optional(),
  /** 카드를 눌러 회상할 줄 id(들은 것만 재생). 라인 id 또는 보충신문 질문 id. 법정 증언 카드에 쓴다. */
  recall: z.array(z.string()).optional(),
});
export const CellS = z.object({ id: z.string(), name: z.string(), disputed: z.boolean() });
/**
 * 겹쳐 더듬기: 두 기록을 줄(row) 단위로 겹쳐 놓고 문지른다. snag가 있는 줄은 "턱"이 걸리고 메모 카드(kind memo)가 생긴다.
 * 턱이 사소한지 본질적인지는 판정하지 않는다(증명력은 플레이어 몫). requires: 보유 카드·들은 줄이 다 있어야 열린다.
 */
export const RubS = z.object({
  id: z.string(), cellId: z.string(), title: z.string(),
  a: z.object({ label: z.string() }), b: z.object({ label: z.string() }),
  requires: z.object({ cards: z.array(z.string()).optional(), heard: z.array(z.string()).optional() }),
  rows: z.array(z.object({ a: z.string(), b: z.string(), snag: z.object({ id: z.string(), cardId: z.string() }).optional() })),
});
export const AppealViewS = z.object({ cellId: z.string(), proven: z.boolean(), when: CondS.optional() });
export const FactorS = z.object({
  id: z.string(), name: z.string(), tier: z.enum(['special', 'general']), nature: z.enum(['act', 'actor']),
  direction: z.enum(['mitigate', 'aggravate']), actEquivalent: z.boolean().optional(),
  requiresAnyCard: z.array(z.string()), weight: z.number(),
});
export const SuspFactorS = z.object({
  id: z.string(), name: z.string(), tier: z.enum(['major', 'general']),
  direction: z.enum(['positive', 'negative']), requiresAnyCard: z.array(z.string()),
});
export const RangeS = z.object({ min: z.number(), max: z.number() });
export const ScenarioS = z.object({
  meta: z.object({
    id: z.string(), title: z.string(), court: z.enum(['single', 'panel']),
    biasType: z.enum(['none', 'harsh', 'lenient']), truthMemo: z.string(), tutorial: z.boolean(),
  }),
  documents: z.object({
    indictment: z.string(), defenseOpinion: z.string(), facts: z.string(), lawApplied: z.string(),
  }),
  opening: z.array(LineS),
  cells: z.array(CellS),
  evidence: z.array(EvidenceS),
  cards: z.array(CardS),
  rubs: z.array(RubS).default([]),
  exams: z.array(ExamS),
  closing: z.object({ demandMonths: z.number().int(), lines: z.array(LineS) }),
  appealView: z.array(AppealViewS),
  sentencing: z.object({
    guidelineName: z.string(),
    statutoryMaxMonths: z.number().int(),
    ranges: z.object({ mitigated: RangeS, basic: RangeS, aggravated: RangeS }),
    factors: z.array(FactorS),
    suspensionFactors: z.array(SuspFactorS),
    suspensionDeviation: z.number(),
  }),
  appeal: z.object({
    defendant: z.object({ ifImprisoned: z.boolean(), ifConvictedWhileDenying: z.boolean() }),
    denies: z.boolean(),
  }),
});

export type Flag = z.infer<typeof FlagS>;
export type Cond = z.infer<typeof CondS>;
export type Speaker = z.infer<typeof SpeakerS>;
export type Violation = z.infer<typeof ViolationS>;
export type Line = z.infer<typeof LineS>;
export type SuppQuestion = z.infer<typeof SuppQuestionS>;
export type Exam = z.infer<typeof ExamS>;
export type Evidence = z.infer<typeof EvidenceS>;
export type Card = z.infer<typeof CardS>;
export type Cell = z.infer<typeof CellS>;
export type Rub = z.infer<typeof RubS>;
export type AppealView = z.infer<typeof AppealViewS>;
export type Factor = z.infer<typeof FactorS>;
export type SuspFactor = z.infer<typeof SuspFactorS>;
export type Range = z.infer<typeof RangeS>;
export type Scenario = z.infer<typeof ScenarioS>;
