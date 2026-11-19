// 항소 발생과 항소심 판정. phaser/DOM 비의존, 무작위 없음.
import { boardFindings, verdictOf } from './board';
import { evalCond } from './cond';
import { DOUBLE_COUNT_FACTOR, PROSECUTOR_APPEAL_RATIO, SUSPENSION_MAX_MONTHS } from './config';
import {
  availableFactors, deviationPercent, leeway, recommendedRange, suspensionRecommendation,
} from './sentencing';
import type { Factor, Scenario } from './scenario/schema';
import type { AppealOutcome, Appellants, GameState } from './state';

type Reason = AppealOutcome['reasons'][number];
type NewSentence = NonNullable<AppealOutcome['newSentence']>;

export function whoAppeals(sc: Scenario, s: GameState): Appellants {
  const guilty = verdictOf(s.board) === 'guilty';
  const months = s.sentencing.months;
  const prosecutor = !guilty || (months !== null && months < sc.closing.demandMonths * PROSECUTOR_APPEAL_RATIO);
  const d = sc.appeal.defendant;
  const defendant = guilty && (
    (d.ifImprisoned && !s.sentencing.suspended) || (d.ifConvictedWhileDenying && sc.appeal.denies)
  );
  return { prosecutor, defendant };
}

/** 근거 무게: 이탈 슬롯 인자 무게 합. 방향 반대 0, 원심 영역 결정에 쓴 특별인자는 감쇠. */
function supportWeight(sc: Scenario, s: GameState, dir: Factor['direction']): number {
  const byId = new Map(sc.sentencing.factors.map((x) => [x.id, x]));
  const usedSpecial = new Set(s.sentencing.special);
  let w = 0;
  for (const id of s.judgment.deviationSlots) {
    const fac = byId.get(id);
    if (!fac || fac.direction !== dir) continue;
    w += fac.tier === 'special' && usedSpecial.has(id) ? fac.weight * DOUBLE_COUNT_FACTOR : fac.weight;
  }
  return w;
}

function review(sc: Scenario, s: GameState, appellants: Appellants): Omit<AppealOutcome, 'hypothetical'> {
  const reasons: Reason[] = [];
  const remarks: string[] = [];
  const guilty = verdictOf(s.board) === 'guilty';

  // 1. 법리·사실오인 (직권)
  const flags = new Set(s.flags);
  const bf = boardFindings(s.board, sc.cards, sc.appealView, flags);
  if (guilty && bf.corroborationViolation) {
    reasons.push({ code: 'law', text: '자백만으로 유죄를 인정했다 (보강법칙 위반)' });
  }
  if (guilty && bf.factMisfinding.length > 0) {
    reasons.push({ code: 'fact', text: '증거 없이 증명됨으로 본 쟁점이 있다 (사실오인)' });
  }
  const convictOnAppeal = !guilty && appellants.prosecutor && bf.appealDisagree.length > 0;
  if (convictOnAppeal) {
    reasons.push({ code: 'fact', text: '항소심은 의심 남음으로 둔 쟁점을 증명됐다고 본다 (사실오인)' });
  }

  // 2. 절차 위반
  for (const v of s.violations) {
    if (v.affectsJudgment) reasons.push({ code: 'procedure', text: `판결에 영향을 미친 절차 위반: ${v.text}` });
    else remarks.push(v.text);
  }

  // 항소심 인자: 판결에 영향을 미친 위반으로 잃은 카드를 복원한 뒤 계산
  const held = new Set(s.heldCards);
  for (const v of s.violations) if (v.affectsJudgment) for (const c of v.lostCards) held.add(c);
  const factors = availableFactors(sc.sentencing.factors, held);
  const { range } = recommendedRange(sc.sentencing, factors.filter((x) => x.tier === 'special'));
  const rec = suspensionRecommendation(availableFactors(sc.sentencing.suspensionFactors, held));

  // 3. 양형부당
  const months = s.sentencing.months;
  const suspended = s.sentencing.suspended;
  if (guilty && months !== null) {
    const lw = leeway(range, s.judgment.addendum !== '');
    let unfair = false;
    if (months < lw.min || months > lw.max) {
      const { dir, pct } = deviationPercent(range, months);
      const w = supportWeight(sc, s, dir === 'above' ? 'aggravate' : 'mitigate');
      if (w < pct) unfair = true;
    }
    const suspAgainst = (rec === 'prison' && suspended) || (rec === 'suspend' && !suspended);
    if (suspAgainst) {
      const w = supportWeight(sc, s, suspended ? 'mitigate' : 'aggravate');
      if (w < sc.sentencing.suspensionDeviation) unfair = true;
    }
    if (unfair) reasons.push({ code: 'sentencing', text: '권고범위를 벗어난 형에 근거가 모자란다 (양형부당)' });
  }

  if (reasons.length === 0) return { appellants, result: 'dismissed', reasons, remarks, newSentence: null };

  // 파기자판
  // 법리·사실오인 파기면 유무죄는 항소심 판단(appealView, when 충족분)을 따른다 (R7)
  const appellateGuilty = sc.appealView.filter((v) => evalCond(v.when, flags)).every((v) => v.proven);
  const lawOrFact = reasons.some((r) => r.code === 'law' || r.code === 'fact');
  const guiltyOnAppeal = lawOrFact ? appellateGuilty : guilty;
  let newSentence: NewSentence;
  if (!guiltyOnAppeal) {
    newSentence = { verdict: 'acquitted', months: null, suspended: false };
  } else {
    const base = months ?? range.min;
    const m = Math.round(Math.min(Math.max(base, range.min), range.max));
    const susp = months === null
      ? rec !== 'prison'
      : rec === 'suspend' ? true : rec === 'prison' ? false : suspended;
    newSentence = { verdict: 'guilty', months: m, suspended: susp && m <= SUSPENSION_MAX_MONTHS };
  }

  // 4. 불이익변경금지
  if (appellants.defendant && !appellants.prosecutor && guilty && months !== null && newSentence.months !== null) {
    const heavier = newSentence.months > months || (suspended && !newSentence.suspended);
    if (heavier) {
      return {
        appellants,
        result: 'dismissed',
        reasons: [],
        remarks: [...reasons.map((r) => r.text), '피고인만 항소해 더 무거운 형을 선고할 수 없다 (불이익변경금지)', ...remarks],
        newSentence: null,
      };
    }
  }
  return { appellants, result: 'reversed', reasons, remarks, newSentence };
}

export function reviewAppeal(sc: Scenario, s: GameState): AppealOutcome {
  const appellants = whoAppeals(sc, s);
  if (!appellants.prosecutor && !appellants.defendant) {
    let hypothetical: string[] = [];
    if (sc.meta.tutorial) {
      const h = review(sc, s, { prosecutor: true, defendant: true });
      hypothetical = [...h.reasons.map((r) => r.text), ...h.remarks];
    }
    return { appellants, result: 'final', reasons: [], remarks: [], newSentence: null, hypothetical };
  }
  return { ...review(sc, s, appellants), hypothetical: [] };
}
