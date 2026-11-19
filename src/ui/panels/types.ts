import type { Scenario } from '../../engine/scenario/schema';
import type { GameState } from '../../engine/state';

export type Panel = { el: HTMLElement; render(s: GameState, sc: Scenario): void };
