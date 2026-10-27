// Per-player analysis computed from the parser JSON. No DOM.
//
// Exact: when each command was given (APM, build order clicks, age-up clicks).
// Estimated: when an age was reached (click time + research time; queues,
// cancellations and missing resources are not visible in a replay).

// Commands that are not deliberate player actions, or whose meaning is unclear
// (DE_TRANSFORM shows up dozens of times in the first second, targeting trees).
const NOT_ACTIONS = new Set(['GAME', 'RESIGN', 'DE_TRANSFORM']);

// Research time in game seconds, keyed by the tech name in the legend.
export const AGES = [
  { key: 'feudal', label: 'Feudal', tech: 'Feudal Age', seconds: 130 },
  { key: 'castle', label: 'Castillo', tech: 'Castle Age', seconds: 160 },
  { key: 'imperial', label: 'Imperial', tech: 'Imperial Age', seconds: 190 },
];

const NICE_BUCKETS_S = [10, 15, 30, 60, 120, 300];

/** Bucket size so an activity chart has at most ~maxBars bars. */
export function bucketSize(durationMs, maxBars = 30) {
  const seconds = durationMs / 1000 / maxBars;
  return (NICE_BUCKETS_S.find((s) => s >= seconds) ?? 600) * 1000;
}

function objectName(data, typeId) {
  return data.legend?.objects?.[typeId]?.name ?? `#${typeId}`;
}

function techName(data, techId) {
  return data.legend?.technologies?.[techId] ?? `tech #${techId}`;
}

export function analyze(data) {
  const duration = data.game.duration_ms;
  const bucket = bucketSize(duration);
  const bucketCount = Math.max(1, Math.ceil(duration / bucket));
  const resignedAt = new Map();
  for (const e of data.timeline) {
    if (e.type === 'RESIGN' && !resignedAt.has(e.player)) resignedAt.set(e.player, e.t);
  }

  const players = data.game.players.map((p) => {
    const end = resignedAt.get(p.number) ?? duration;
    const events = data.timeline.filter((e) => e.player === p.number);
    const actions = events.filter((e) => !NOT_ACTIONS.has(e.type) && e.t <= end);

    const activity = new Array(bucketCount).fill(0);
    for (const e of actions) activity[Math.min(bucketCount - 1, Math.floor(e.t / bucket))]++;

    const buildOrder = [];
    const trained = new Map();
    const ageUps = [];
    for (const e of events) {
      if (e.type === 'BUILD') {
        buildOrder.push({ t: e.t, kind: 'build', name: objectName(data, e.building_id) });
      } else if (e.type === 'WALL') {
        buildOrder.push({ t: e.t, kind: 'build', name: objectName(data, e.building_id) });
      } else if (e.type === 'DE_QUEUE') {
        const name = objectName(data, e.unit_id);
        trained.set(name, (trained.get(name) ?? 0) + e.amount);
        buildOrder.push({ t: e.t, kind: 'queue', name, amount: e.amount });
      } else if (e.type === 'RESEARCH') {
        const name = techName(data, e.technology_id);
        const age = AGES.find((a) => a.tech === name);
        if (age && !ageUps.some((a) => a.key === age.key)) {
          ageUps.push({ key: age.key, label: age.label, clickedAt: e.t, reachedAt: e.t + age.seconds * 1000 });
        }
        buildOrder.push({ t: e.t, kind: age ? 'age' : 'research', name });
      }
    }

    return {
      number: p.number,
      activeMs: end,
      actions: actions.length,
      // Below 30 s the rate is mostly noise.
      apm: end >= 30_000 ? Math.round((actions.length / end) * 60_000) : null,
      activity,
      buildOrder,
      trained: [...trained].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
      ageUps,
    };
  });

  return { bucketMs: bucket, players };
}
