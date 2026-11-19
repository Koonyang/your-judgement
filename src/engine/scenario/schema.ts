import { z } from 'zod';

export const FlagS = z.string();
export const CondS = z.object({ all: z.array(FlagS).optional(), none: z.array(FlagS).optional() });
export const SpeakerS = z.enum(['judge', 'clerk', 'prosecutor', 'defense', 'witness', 'defendant']);
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
  id: z.string(), title: z.string(), text: z.string(), kind: z.enum(['evidence', 'fact']),
  confession: z.boolean().optional(),
});
export const CellS = z.object({ id: z.string(), name: z.string(), disputed: z.boolean() });
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
export type AppealView = z.infer<typeof AppealViewS>;
export type Factor = z.infer<typeof FactorS>;
export type SuspFactor = z.infer<typeof SuspFactorS>;
export type Range = z.infer<typeof RangeS>;
export type Scenario = z.infer<typeof ScenarioS>;
