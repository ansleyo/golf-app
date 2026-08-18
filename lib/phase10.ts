/** Framework-free Phase 10 rules and state transitions. */

export const COLORS = ["red", "blue", "green", "yellow"] as const;
export type Color = (typeof COLORS)[number];
export type PlayerId = string;
export type Card = {
  id: string;
  kind: "number" | "wild" | "skip";
  value?: number;
  color?: Color;
};
export type Meld = Card[];
export type PhaseMeld = { id: string; cards: Meld; kind?: "set" | "run" | "color" };
export type PhaseNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export const PHASES = [
  "2 sets of 3", "set of 3 + run of 4", "set of 4 + run of 4", "run of 7",
  "run of 8", "run of 9", "2 sets of 4", "7 of one color",
  "set of 5 + set of 2", "set of 5 + run of 3",
] as const;

export type PlayerState = {
  id: PlayerId;
  name?: string;
  avatar?: string;
  hand: Card[];
  phase: PhaseNumber;
  phaseComplete?: boolean;
  score: number;
  laidPhase: PhaseMeld[] | null;
  hits: number;
  skipped: boolean;
};
export type GameStatus = "playing" | "round-over" | "game-over";
export type GameState = {
  players: PlayerState[];
  drawPile: Card[];
  discardPile: Card[];
  currentPlayer: number;
  turnHasDrawn: boolean;
  status: GameStatus;
  skipTarget: PlayerId | null;
  round: number;
  winnerId?: PlayerId;
};
export type Result<T> = { ok: true; state?: T; value?: T } | { ok: false; error: string };
export type Validation = { valid: true } | { valid: false; error: string };

const ok = <T>(state?: T): Result<T> => ({ ok: true, ...(state === undefined ? {} : { state, value: state }) });
const fail = (error: string): Result<never> => ({ ok: false, error });
const isNumber = (c: Card): c is Card & { kind: "number"; value: number } => c.kind === "number" && Number.isInteger(c.value);

export function createDeck(): Card[] {
  const deck: Card[] = [];
  let n = 0;
  for (const color of COLORS) for (let copy = 0; copy < 2; copy++) for (let value = 1; value <= 12; value++)
    deck.push({ id: `n${n++}`, kind: "number", value, color });
  for (let i = 0; i < 8; i++) deck.push({ id: `w${i}`, kind: "wild" });
  for (let i = 0; i < 4; i++) deck.push({ id: `s${i}`, kind: "skip" });
  return deck;
}
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function createGame(playerIds: readonly PlayerId[], random: () => number = Math.random): Result<GameState> {
  if (playerIds.length < 2 || playerIds.length > 4) return fail("Phase 10 requires 2 to 4 players.");
  if (new Set(playerIds).size !== playerIds.length) return fail("Player IDs must be unique.");
  const deck = shuffle(createDeck(), random);
  const players = playerIds.map((id) => ({ id, hand: deck.splice(0, 10), phase: 1 as PhaseNumber, phaseComplete: false, score: 0, laidPhase: null, hits: 0, skipped: false }));
  return ok({ players, drawPile: deck.slice(0, -1), discardPile: [deck[deck.length - 1]], currentPlayer: 0, turnHasDrawn: false, status: "playing", skipTarget: null, round: 1 });
}
export const createGameState = createGame;
export function deal(playerIds: readonly PlayerId[], random: () => number = Math.random): Result<GameState> { return createGame(playerIds, random); }

function validateSet(cards: Meld, count: number): Validation {
  if (cards.length !== count) return { valid: false, error: `Set must contain ${count} cards.` };
  const values = cards.filter(isNumber).map((c) => c.value);
  if (!values.length || new Set(values).size !== 1) return { valid: false, error: "A set needs matching natural numbers and may contain Wilds." };
  return { valid: true };
}
function validateRun(cards: Meld, count: number): Validation {
  if (cards.length !== count) return { valid: false, error: `Run must contain ${count} cards.` };
  const values = cards.filter(isNumber).map((c) => c.value).sort((a, b) => a - b);
  if (!values.length) return { valid: false, error: "A run needs at least one natural card." };
  for (let start = Math.max(1, values[0] - cards.length + 1); start <= values[0]; start++) {
    const expected = new Set(Array.from({ length: cards.length }, (_, i) => start + i));
    if (values.every((v) => expected.has(v)) && new Set(values).size === values.length) return { valid: true };
  }
  return { valid: false, error: "Run cards must be consecutive (Wilds fill gaps)."};
}
export function validateMeld(cards: Meld, kind: "set" | "run" | "color", count?: number): Validation {
  if (!cards.length || cards.some((c) => c.kind === "skip")) return { valid: false, error: "Melds cannot contain Skip cards." };
  if (kind === "set") return validateSet(cards, count ?? cards.length);
  if (kind === "run") return validateRun(cards, count ?? cards.length);
  if (cards.length !== (count ?? 7) || !cards.some((c) => c.kind === "number")) return { valid: false, error: "Color meld has an invalid size." };
  const colors = cards.filter((c) => c.kind === "number").map((c) => c.color);
  return colors.every((c) => c === colors[0]) ? { valid: true } : { valid: false, error: "All natural cards must have one color." };
}
export function validatePhase(phase: PhaseNumber, melds: Meld[]): Validation {
  const checks: Validation[] = (() => {
    switch (phase) {
      case 1: return [validateMeld(melds[0] ?? [], "set", 3), validateMeld(melds[1] ?? [], "set", 3)];
      case 2: return [validateMeld(melds[0] ?? [], "set", 3), validateMeld(melds[1] ?? [], "run", 4)];
      case 3: return [validateMeld(melds[0] ?? [], "set", 4), validateMeld(melds[1] ?? [], "run", 4)];
      case 4: return [validateMeld(melds[0] ?? [], "run", 7)];
      case 5: return [validateMeld(melds[0] ?? [], "run", 8)];
      case 6: return [validateMeld(melds[0] ?? [], "run", 9)];
      case 7: return [validateMeld(melds[0] ?? [], "set", 4), validateMeld(melds[1] ?? [], "set", 4)];
      case 8: return [validateMeld(melds[0] ?? [], "color", 7)];
      case 9: return [validateMeld(melds[0] ?? [], "set", 5), validateMeld(melds[1] ?? [], "set", 2)];
      case 10: return [validateMeld(melds[0] ?? [], "set", 5), validateMeld(melds[1] ?? [], "run", 3)];
    }
  })();
  if (melds.length !== checks.length) return { valid: false, error: `Phase ${phase} requires ${checks.length} melds.` };
  const bad = checks.find((c) => !c.valid);
  return bad && !bad.valid ? bad : { valid: true };
}
export const isValidPhase = (phase: PhaseNumber, melds: Meld[]) => validatePhase(phase, melds).valid;

export function phaseMeldSizes(phase: PhaseNumber): number[] {
  switch (phase) {
    case 1: return [3, 3];
    case 2:
    case 3: return [3, 4];
    case 4: return [7];
    case 5: return [8];
    case 6: return [9];
    case 7: return [4, 4];
    case 8: return [7];
    case 9: return [5, 2];
    case 10: return [5, 3];
  }
}

function phaseMeldKinds(phase: PhaseNumber): Array<"set" | "run" | "color"> {
  if (phase === 8) return ["color"];
  if (phase === 1 || phase === 7 || phase === 9) return ["set", "set"];
  if (phase === 2 || phase === 3 || phase === 10) return ["set", "run"];
  return ["run"];
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [first, ...rest] = items;
  return combinations(rest, size - 1).map((choice) => [first, ...choice])
    .concat(combinations(rest, size));
}

export function findPhaseMelds(phase: PhaseNumber, cards: Meld): Meld[] | null {
  const sizes = phaseMeldSizes(phase);
  const kinds = phaseMeldKinds(phase);
  if (cards.length !== sizes.reduce((sum, size) => sum + size, 0)) return null;
  const search = (remaining: Meld, index: number): Meld[] | null => {
    if (index === sizes.length) return remaining.length === 0 ? [] : null;
    for (const choice of combinations(remaining, sizes[index])) {
      const validation = validateMeld(choice, kinds[index], sizes[index]);
      if (!validation.valid) continue;
      const choiceIds = new Set(choice.map((card) => card.id));
      const next = search(remaining.filter((card) => !choiceIds.has(card.id)), index + 1);
      if (next) return [choice, ...next];
    }
    return null;
  };
  return search(cards, 0);
}

export function cardScore(card: Card): number { return card.kind === "wild" ? 25 : card.kind === "skip" ? 15 : card.value! <= 9 ? 5 : 10; }
export const scoreCards = (cards: readonly Card[]) => cards.reduce((sum, c) => sum + cardScore(c), 0);

function containsCards(hand: Card[], cards: Card[]) { const ids = new Set(hand.map((c) => c.id)); return cards.every((c) => ids.has(c.id)) && new Set(cards.map((c) => c.id)).size === cards.length; }
function replacePlayer(state: GameState, index: number, player: PlayerState): GameState { const players = [...state.players]; players[index] = player; return { ...state, players }; }
function turn(state: GameState) { return state.players[state.currentPlayer]; }
function endTurn(state: GameState): GameState {
  let next = (state.currentPlayer + 1) % state.players.length;
  if (state.skipTarget) { const i = state.players.findIndex((p) => p.id === state.skipTarget); if (i >= 0) next = (i + 1) % state.players.length; }
  return { ...state, currentPlayer: next, turnHasDrawn: false, skipTarget: null, players: state.players.map((p) => ({ ...p, skipped: false })) };
}
export function drawCard(state: GameState, from: "draw" | "discard" = "draw"): Result<GameState> {
  if (state.status !== "playing") return fail("The round is not active.");
  if (state.skipTarget || turn(state).skipped) return fail("This player is skipped.");
  if (state.turnHasDrawn) return fail("The current player has already drawn.");
  let drawPile = [...state.drawPile], discardPile = [...state.discardPile];
  if (!drawPile.length) {
    if (discardPile.length < 2) return fail("No cards remain to draw.");
    const top = discardPile.pop()!; drawPile = shuffle(discardPile); discardPile = [top];
  }
  if (from === "discard") {
    if (!discardPile.length) return fail("The discard pile is empty.");
    const card = discardPile.pop()!; return ok({ ...replacePlayer({ ...state, drawPile, discardPile }, state.currentPlayer, { ...turn(state), hand: [...turn(state).hand, card] }), turnHasDrawn: true });
  }
  const card = drawPile.pop()!; return ok({ ...replacePlayer({ ...state, drawPile, discardPile }, state.currentPlayer, { ...turn(state), hand: [...turn(state).hand, card] }), turnHasDrawn: true });
}
export function discardCard(state: GameState, cardId: string): Result<GameState> {
  const p = turn(state); if (state.status !== "playing" || state.skipTarget || p.hand.length === 0) return fail("Cannot discard now.");
  if (!state.turnHasDrawn) return fail("Draw a card before discarding.");
  if (state.drawPile.length + state.discardPile.length === 0) return fail("No card can be discarded.");
  const i = p.hand.findIndex((c) => c.id === cardId); if (i < 0) return fail("Card is not in the current player's hand.");
  const hand = [...p.hand]; const [card] = hand.splice(i, 1);
  const next = endTurn({ ...replacePlayer(state, state.currentPlayer, { ...p, hand }), discardPile: [...state.discardPile, card] });
  return ok(hand.length === 0 ? { ...next, status: "round-over", winnerId: p.id } : next);
}
export function layPhase(state: GameState, melds: Meld[]): Result<GameState> {
  const p = turn(state); if (state.status !== "playing" || state.skipTarget || p.laidPhase) return fail("Phase has already been laid or turn is unavailable.");
  if (!state.turnHasDrawn) return fail("Draw a card before laying your phase.");
  if (!containsCards(p.hand, melds.flat())) return fail("All phase cards must be in hand.");
  const valid = validatePhase(p.phase, melds); if (!valid.valid) return fail(valid.error);
  const hand = p.hand.filter((c) => !melds.flat().some((m) => m.id === c.id));
  const kinds: Array<"set" | "run" | "color"> = p.phase === 8 ? ["color"] :
    p.phase === 1 || p.phase === 7 || p.phase === 9 ? ["set", "set"] :
    p.phase === 2 ? ["set", "run"] : p.phase === 3 ? ["set", "run"] :
    p.phase === 10 ? ["set", "run"] : ["run"];
  return ok(replacePlayer(state, state.currentPlayer, { ...p, hand, phaseComplete: true, laidPhase: melds.map((cards, i) => ({ id: `${p.id}-phase-${i}`, kind: kinds[i], cards: [...cards] })) }));
}
export function validateHit(card: Card, meld: Meld, kind?: "set" | "run" | "color"): Validation {
  if (card.kind === "skip" || meld.some((c) => c.kind === "skip")) return { valid: false, error: "Skip cards cannot be hit." };
  if (kind === "color") {
    const natural = meld.find(isNumber);
    return card.kind === "wild" || (isNumber(card) && card.color === natural?.color)
      ? { valid: true } : { valid: false, error: "Card must match the meld's color." };
  }
  if (kind === "run") return validateRun([...meld, card], meld.length + 1);
  if (kind === "set") {
    const natural = meld.find(isNumber);
    return card.kind === "wild" || (isNumber(card) && card.value === natural?.value)
      ? { valid: true } : { valid: false, error: "Card does not match the set." };
  }
  if (meld.some((c) => c.kind === "number") && meld.filter(isNumber).every((c) => c.value === meld.filter(isNumber)[0].value))
    return card.kind === "wild" || (isNumber(card) && card.value === meld.filter(isNumber)[0].value) ? { valid: true } : { valid: false, error: "Card does not match the set." };
  const all = [...meld, card]; return validateRun(all, all.length);
}
export function hit(state: GameState, targetPlayerId: PlayerId, meldId: string, cardId: string): Result<GameState> {
  const p = turn(state); if (state.status !== "playing" || !p.laidPhase) return fail("You must lay your phase before hitting.");
  if (!state.turnHasDrawn) return fail("Draw a card before hitting.");
  const target = state.players.find((x) => x.id === targetPlayerId), meld = target?.laidPhase?.find((m) => m.id === meldId);
  if (!target || !meld) return fail("Laid meld not found.");
  const i = p.hand.findIndex((c) => c.id === cardId); if (i < 0) return fail("Card is not in hand.");
  const valid = validateHit(p.hand[i], meld.cards, meld.kind); if (!valid.valid) return fail(valid.error);
  const hand = [...p.hand]; const [card] = hand.splice(i, 1);
  const players = state.players.map((x) => x.id === p.id ? { ...x, hand, hits: x.hits + 1 } : x.id === target.id ? { ...x, laidPhase: x.laidPhase!.map((m) => m.id === meldId ? { ...m, cards: [...m.cards, card] } : m) } : x);
  return ok({ ...state, players });
}
export function useSkip(state: GameState, targetId: PlayerId): Result<GameState> {
  const p = turn(state); if (state.status !== "playing" || state.skipTarget || !state.turnHasDrawn || !p.hand.some((c) => c.kind === "skip")) return fail("Cannot use Skip now.");
  if (!state.players.some((x) => x.id === targetId) || targetId === p.id) return fail("Invalid skip target.");
  const hand = [...p.hand]; hand.splice(hand.findIndex((c) => c.kind === "skip"), 1);
  const skip = p.hand.find((c) => c.kind === "skip")!;
  const targetIndex = state.players.findIndex((x) => x.id === targetId);
  const next = (targetIndex + 1) % state.players.length;
  return ok({ ...replacePlayer(state, state.currentPlayer, { ...p, hand }), discardPile: [...state.discardPile, skip], currentPlayer: next, turnHasDrawn: false, skipTarget: null });
}
export function nextRound(state: GameState): Result<GameState> {
  if (state.status !== "round-over") return fail("The round is not over.");
  const completedFinalPhase = state.winnerId
    ? (() => {
      const winner = state.players.find((p) => p.id === state.winnerId);
      return winner?.phase === 10 && winner.phaseComplete === true;
    })()
    : false;
  const players = state.players.map((p) => ({ ...p, phase: (p.phaseComplete ? Math.min(10, p.phase + 1) : p.phase) as PhaseNumber, phaseComplete: false, score: p.score + scoreCards(p.hand), hand: [], laidPhase: null, hits: 0, skipped: false }));
  if (completedFinalPhase) {
    return ok({ ...state, players, status: "game-over" });
  }
  const dealt = createGame(players.map((p) => p.id));
  if (!dealt.ok) return dealt;
  return ok({ ...dealt.state!, players: dealt.state!.players.map((p, i) => ({ ...p, name: players[i].name, phase: players[i].phase, score: players[i].score })), round: state.round + 1 });
}
export function finishRound(state: GameState): Result<GameState> {
  const winner = state.players.find((p) => p.hand.length === 0);
  return winner ? ok({ ...state, status: "round-over", winnerId: winner.id }) : fail("A player must have no cards to finish the round.");
}
export const layDownPhase = layPhase;
export const useSkipCard = useSkip;
export const hitMeld = hit;

export type GameAction =
  | { type: "draw"; from?: "draw" | "discard" }
  | { type: "discard"; cardId: string }
  | { type: "lay-phase"; melds: Meld[] }
  | { type: "hit"; targetPlayerId: PlayerId; meldId: string; cardId: string }
  | { type: "use-skip"; targetId: PlayerId }
  | { type: "finish-round" }
  | { type: "next-round" };
export function reduceGame(state: GameState, action: GameAction): Result<GameState> {
  switch (action.type) {
    case "draw": return drawCard(state, action.from);
    case "discard": return discardCard(state, action.cardId);
    case "lay-phase": return layPhase(state, action.melds);
    case "hit": return hit(state, action.targetPlayerId, action.meldId, action.cardId);
    case "use-skip": return useSkip(state, action.targetId);
    case "finish-round": return finishRound(state);
    case "next-round": return nextRound(state);
  }
}
