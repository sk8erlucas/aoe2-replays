// Each player's stockpile by resource over time. No DOM.
//
// The replay's syncs carry each player's exact total (food + wood + gold +
// stone), about every 17 s, but not how it splits. Between two syncs this
// estimates what came in (the engine's gatherers at estimated rates) and what
// went out (the game's costs of what was queued, built and researched, market
// trades and tributes, all in the replay), and then
// corrects the estimate to the exact total: whatever is missing is added where
// the income and spending were, whatever is too much is taken from the income first. So the
// total is always the game's, and each resource an estimate that cannot drift
// far, since it is corrected every sync.

import {
  FARM_RATE, GATHER_RATES, MARKET_START_PRICE, MARKET_STEP, MEAT_RATE, STARTING_STOCK, TRIBUTE_FEE,
} from './palette.js';

export const RESOURCES = ['food', 'wood', 'gold', 'stone'];
const STARTING_TOTAL = STARTING_STOCK.reduce((a, b) => a + b, 0);
const FOOD = 0;
const WOOD = 1;
const GOLD = 2;
const STONE = 3;
// Market and tribute resource ids in the replay: 0 food, 1 wood, 2 stone, 3 gold.
const GAME_RESOURCE = { 0: FOOD, 1: WOOD, 2: STONE, 3: GOLD };
// Activity -> [resource, rate per game second].
const INCOME = {
  tree: [WOOD, GATHER_RATES.tree],
  gold: [GOLD, GATHER_RATES.gold],
  stone: [STONE, GATHER_RATES.stone],
  berries: [FOOD, GATHER_RATES.berries],
  hunt: [FOOD, MEAT_RATE],
  shepherd: [FOOD, MEAT_RATE],
  farm: [FOOD, FARM_RATE],
};

/**
 * { players, refused }: per player, the stock at each sync, chronological:
 * [{ t, total, drift, gathered, food, wood, gold, stone }] (drift: game total
 * minus the estimate before correcting it; gathered: everything gathered so far,
 * the game's total less what the estimate says came in or went out otherwise:
 * purchases, refunds, trades and tributes); and the trained units whose purchase the
 * stock couldn't pay (the game would have refused the click). Null if the
 * replay has no totals (parsed before November 2026).
 */
export function stockTimeline(replay) {
  const syncs = replay.data.resource_totals;
  if (!syncs?.length) return null;
  const players = replay.players.map((p) => p.number);
  const flows = new Map(players.map((n) => [n, []])); // player -> [{ t, delta: [4] }]
  const flow = (player, t, delta, unit = null) => flows.get(player)?.push({ t, delta, unit });
  const cost = (c, k = 1) => (c ? c.map((v) => -v * k) : null);

  const units = replay.game?.units ?? {};
  const buildings = replay.game?.buildings ?? {};
  const techs = replay.game?.techs ?? {};
  const prices = [MARKET_START_PRICE, MARKET_START_PRICE, MARKET_START_PRICE, MARKET_START_PRICE];
  for (const e of replay.data.timeline) {
    if (e.type === 'BUY' || e.type === 'SELL') {
      const r = GAME_RESOURCE[e.resource_id];
      if (r == null || r === GOLD) continue;
      const delta = [0, 0, 0, 0];
      for (let i = 0; i < (e.amount ?? 1); i++) {
        if (e.type === 'BUY') {
          delta[GOLD] -= prices[r] * 1.3;
          delta[r] += 100;
          prices[r] += MARKET_STEP;
        } else {
          delta[GOLD] += prices[r] * 0.7;
          delta[r] -= 100;
          prices[r] = Math.max(20, prices[r] - MARKET_STEP);
        }
      }
      flow(e.player, e.t, delta);
    } else if (e.type === 'DE_TRIBUTE') {
      const sent = [e.food ?? 0, e.wood ?? 0, e.gold ?? 0, e.stone ?? 0];
      flow(e.player, e.t, sent.map((v) => -v * (1 + TRIBUTE_FEE)));
      flow(e.target_player_id, e.t, sent);
    }
  }
  // Units queued, buildings placed (each wall piece) and researches, as the
  // engine has them: what was taken out of a queue is not there (its cost came back).
  for (const u of replay.units) {
    if (u.queuedAt == null) continue;
    const c = cost(units[u.queuedType]?.cost);
    if (c) flow(u.player, u.queuedAt, c, u);
  }
  for (const b of replay.buildings) {
    if (b.t <= 0) continue; // the map's
    const c = cost(buildings[b.typeId]?.cost);
    if (c) flow(b.player, b.t, c);
  }
  for (const r of replay.researches) {
    const c = cost(techs[r.techId]?.cost);
    if (c) flow(r.player, r.clickedAt ?? r.t0, c);
  }
  // Taken out of a queue: paid when queued, given back when taken out.
  for (const x of replay.cancelled ?? []) {
    const c = x.techId != null ? techs[x.techId]?.cost : units[x.unitId]?.cost;
    if (!c) continue;
    flow(x.player, x.at, cost(c));
    flow(x.player, x.t, [...c]);
  }

  // Income: what each unit was gathering, as rate changes over time.
  const rates = new Map(players.map((n) => [n, []])); // player -> [{ t, r, rate }]
  for (const u of replay.units) {
    const list = rates.get(u.player);
    if (!list) continue;
    for (const a of u.activities) {
      const what = INCOME[a.kind];
      if (!what) continue;
      const t1 = Math.min(a.t1, u.removedAt);
      if (t1 <= a.t0) continue;
      list.push({ t: a.t0, r: what[0], rate: what[1] / 1000 });
      if (Number.isFinite(t1)) list.push({ t: t1, r: what[0], rate: -what[1] / 1000 });
    }
  }

  // One sweep through time per player: income accrues, each purchase is
  // charged only if it could be paid (the game refuses the click otherwise),
  // and at each sync the estimate is corrected to the game's total.
  const out = new Map();
  const refused = new Set();
  for (const n of players) {
    const moves = flows.get(n).sort((a, b) => a.t - b.t);
    const changes = rates.get(n).sort((a, b) => a.t - b.t);
    const stock = [...STARTING_STOCK];
    const rate = [0, 0, 0, 0];
    let earned = [0, 0, 0, 0];
    let spent = [0, 0, 0, 0];
    let now = 0;
    let moved = 0; // net of everything charged, refunded, traded and tributed
    const advance = (to) => {
      if (to <= now) return;
      for (let i = 0; i < 4; i++) {
        const got = rate[i] * (to - now);
        stock[i] += got;
        earned[i] += got;
      }
      now = to;
    };
    const samples = [];
    let c = 0;
    let m = 0;
    for (const s of syncs) {
      const total = s.players[n];
      if (total == null) continue;
      while (c < changes.length || m < moves.length) {
        const tc = c < changes.length ? changes[c].t : Infinity;
        const tm = m < moves.length ? moves[m].t : Infinity;
        const next = Math.min(tc, tm);
        if (next > s.t) break;
        advance(next);
        if (tc <= tm) {
          const ch = changes[c++];
          rate[ch.r] = Math.max(0, rate[ch.r] + ch.rate);
        } else {
          const { delta, unit } = moves[m++];
          if (!affordable(stock, delta)) {
            if (unit) refused.add(unit);
            continue;
          }
          delta.forEach((v, i) => {
            stock[i] += v;
            moved += v;
            if (v < 0) spent[i] -= v;
          });
        }
      }
      advance(s.t);
      // How far off the estimate was before the correction: how good it is.
      const drift = total - stock.reduce((a, b) => a + b, 0);
      reconcile(stock, total, earned, spent);
      const gathered = Math.max(0, Math.round(total - STARTING_TOTAL - moved));
      samples.push({ t: s.t, total, drift, gathered, food: stock[FOOD], wood: stock[WOOD], gold: stock[GOLD], stone: stock[STONE] });
      earned = [0, 0, 0, 0];
      spent = [0, 0, 0, 0];
    }
    out.set(n, samples);
  }
  return { players: out, refused };
}

// A purchase (only costs) the estimated stock can pay, like the game checks.
// Trades and tributes always go through. (Allowing a dip below zero, for the
// estimate's error, measured worse on two matches.)
function affordable(stock, delta) {
  if (delta.some((v) => v > 0)) return true;
  return delta.every((v, i) => stock[i] + v >= 0);
}

// Makes the four add up to the game's total: what is missing goes where the
// income and the spending were (else where the stock is), what is too much
// comes off the income first, then off the stock.
// Whole numbers, never negative.
export function reconcile(stock, total, earned, spent = [0, 0, 0, 0]) {
  for (let i = 0; i < 4; i++) stock[i] = Math.max(0, stock[i]);
  const sum = stock.reduce((a, b) => a + b, 0);
  const diff = total - sum;
  if (diff > 0) {
    // Short: more came in than guessed, or something charged never happened.
    const moved = earned.map((v, i) => v + spent[i]);
    const w = moved.some((v) => v > 0) ? moved : sum > 0 ? stock : [1, 1, 1, 1];
    const wsum = w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < 4; i++) stock[i] += (diff * w[i]) / wsum;
  } else if (diff < 0) {
    // Too much: first off what came in (the income is the guess), then off the stock.
    let over = -diff;
    for (const w of [earned, stock]) {
      const take = w.map((v, i) => Math.min(Math.max(0, v), stock[i]));
      const room = take.reduce((a, b) => a + b, 0);
      if (room <= 0) continue;
      const k = Math.min(1, over / room);
      for (let i = 0; i < 4; i++) stock[i] -= take[i] * k;
      over -= room * k;
      if (over <= 1e-9) break;
    }
  }
  // Largest remainders, so the whole numbers still add up to the total.
  const floors = stock.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = [0, 1, 2, 3].sort((a, b) => (stock[b] - floors[b]) - (stock[a] - floors[a]));
  for (const i of order) {
    if (left <= 0) break;
    floors[i]++;
    left--;
  }
  for (let i = 0; i < 4; i++) stock[i] = floors[i];
}
