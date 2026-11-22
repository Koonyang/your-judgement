import { ScenarioS, type Line, type Scenario, type Violation } from './schema';

export const END_SENTINEL = '$end';

export class ScenarioError extends Error {
  constructor(public messages: string[]) {
    super(`시나리오 오류 ${messages.length}건:\n${messages.join('\n')}`);
    this.name = 'ScenarioError';
  }
}

export function loadScenario(raw: unknown): Scenario {
  const parsed = ScenarioS.safeParse(raw);
  if (!parsed.success) {
    throw new ScenarioError(
      parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  const s = parsed.data;
  const errors: string[] = [];
  const cardIds = new Set(s.cards.map((c) => c.id));
  const cellIds = new Set(s.cells.map((c) => c.id));
  const evidenceIds = new Set(s.evidence.map((e) => e.id));

  const needCard = (id: string, where: string) => {
    if (!cardIds.has(id)) errors.push(`${where}: 알 수 없는 카드 id '${id}'`);
  };
  const checkViolation = (v: Violation, where: string) =>
    v.lostCards.forEach((id) => needCard(id, `${where}.violation(${v.id}).lostCards`));

  const checkLines = (lines: Line[], where: string) => {
    const ids = new Set(lines.map((l) => l.id));
    const needLine = (id: string, w: string) => {
      if (id !== END_SENTINEL && !ids.has(id)) errors.push(`${w}: 같은 블록에 없는 라인 id '${id}'`);
    };
    for (const l of lines) {
      const w = `${where}/${l.id}`;
      l.yieldsCards?.forEach((id) => needCard(id, `${w}.yieldsCards`));
      l.revokesCards?.forEach((id) => needCard(id, `${w}.revokesCards`));
      if (l.interrupt) {
        needLine(l.interrupt.resumeAt, `${w}.interrupt.resumeAt`);
        if (l.interrupt.violation) checkViolation(l.interrupt.violation, `${w}.interrupt`);
      }
      if (l.objection) {
        needLine(l.objection.onSustain.resumeAt, `${w}.objection.onSustain.resumeAt`);
        checkViolation(l.objection.violation, `${w}.objection`);
      }
    }
  };

  checkLines(s.opening, 'opening');
  checkLines(s.closing.lines, 'closing');
  for (const x of s.exams) {
    checkLines(x.lines, `exam ${x.id}`);
    for (const q of x.supplementary) {
      if (!cellIds.has(q.cellId)) errors.push(`exam ${x.id}/${q.id}.cellId: 알 수 없는 셀 id '${q.cellId}'`);
      checkLines(q.answer, `exam ${x.id}/${q.id}.answer`);
      if (q.violation) checkViolation(q.violation, `exam ${x.id}/${q.id}`);
    }
    x.unlocksEvidence?.forEach((u) => {
      if (!evidenceIds.has(u.evidenceId))
        errors.push(`exam ${x.id}.unlocksEvidence: 알 수 없는 증거 id '${u.evidenceId}'`);
    });
  }
  // 회상·더듬기가 가리키는 줄 id: 모든 블록의 라인 + 보충신문 질문·답변
  const anyLine = new Set<string>([
    ...s.opening, ...s.closing.lines,
    ...s.exams.flatMap((x) => [...x.lines, ...x.supplementary.flatMap((q) => q.answer)]),
  ].map((l) => l.id).concat(s.exams.flatMap((x) => x.supplementary.map((q) => q.id))));
  const needAnyLine = (id: string, where: string) => {
    if (!anyLine.has(id)) errors.push(`${where}: 알 수 없는 줄 id '${id}'`);
  };
  for (const c of s.cards) c.proves?.forEach((id) => {
    if (!cellIds.has(id)) errors.push(`card ${c.id}.proves: 알 수 없는 셀 id '${id}'`);
  });
  // 쟁점 수는 피고인 기물·자리로 나타낼 수 있어야 한다(src/ui/chess.ts layoutFor)
  if (![1, 2, 3, 4, 5, 8].includes(s.cells.length)) errors.push(`cells: 쟁점 ${s.cells.length}개는 판에 놓을 수 없음(1·2·3·4·5·8개만)`);
  for (const c of s.cards) c.recall?.forEach((id) => needAnyLine(id, `card ${c.id}.recall`));
  const kindOf = new Map(s.cards.map((c) => [c.id, c.kind]));
  for (const r of s.rubs) {
    if (!cellIds.has(r.cellId)) errors.push(`rub ${r.id}.cellId: 알 수 없는 셀 id '${r.cellId}'`);
    r.requires.cards?.forEach((id) => needCard(id, `rub ${r.id}.requires.cards`));
    r.requires.heard?.forEach((id) => needAnyLine(id, `rub ${r.id}.requires.heard`));
    for (const row of r.rows) {
      if (!row.snag) continue;
      needCard(row.snag.cardId, `rub ${r.id}.snag(${row.snag.id})`);
      if (kindOf.has(row.snag.cardId) && kindOf.get(row.snag.cardId) !== 'memo')
        errors.push(`rub ${r.id}.snag(${row.snag.id}): 메모 카드(kind memo)여야 함 '${row.snag.cardId}'`);
    }
  }
  for (const e of s.evidence) if (e.cardId) needCard(e.cardId, `evidence ${e.id}.cardId`);
  for (const a of s.appealView)
    if (!cellIds.has(a.cellId)) errors.push(`appealView.cellId: 알 수 없는 셀 id '${a.cellId}'`);
  for (const f of s.sentencing.factors)
    f.requiresAnyCard.forEach((id) => needCard(id, `factor ${f.id}.requiresAnyCard`));
  for (const f of s.sentencing.suspensionFactors)
    f.requiresAnyCard.forEach((id) => needCard(id, `suspensionFactor ${f.id}.requiresAnyCard`));

  if (errors.length) throw new ScenarioError(errors);
  return s;
}
