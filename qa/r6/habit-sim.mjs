/** Seeded run of 60 matches per player type against the adaptive Shark (no browser, no model, $0).
 * node qa/r6/habit-sim.mjs [--out FILE.json] [--matches N]
 * Every player cheats only when the card in his sleeve beats the card he was dealt. He never grabs the Shark's wrist (a player who also catches the Shark would win more).
 *  keeps:  the same cover, hand and fist every time.
 *  random: a random cover, hand and fist every time; he does not look at the Shark's tell.
 *  reads:  the same random habits as `random`, and when the Shark's eyes flick to his hand (the tell) his hand comes up at once. */
import { writeFileSync } from "node:fs";
import { playMatch } from "../../tests/helpers-habits.js";
import { createRng, nextFloat } from "../../src/game/rng.js";

export const MATCHES = 60;
/** Chance that a player sees the Shark's cuff glow in time and grabs his wrist (the same for all three player types). Assumed (40 percent), not measured with people. */
export const CATCH_P = 0.4;
const randomHabit = (r) => ({ cover: nextFloat(r) < 0.5 ? "look" : "point", hand: nextFloat(r) < 0.5 ? "right" : "left", fistS: nextFloat(r) < 0.5 ? 0.5 : 2.2 });
export const policies = {
  keeps: (seed) => {
    const c = createRng(seed * 13 + 5);
    return (i) => ({ cover: "look", hand: "right", fistS: 0.5, cheat: i.useful, catchShark: nextFloat(c) < CATCH_P });
  },
  random: (seed) => {
    const r = createRng(seed * 7 + 3);
    const c = createRng(seed * 13 + 5);
    return (i) => ({ ...randomHabit(r), cheat: i.useful, catchShark: nextFloat(c) < CATCH_P });
  },
  reads: (seed) => {
    const r = createRng(seed * 7 + 3);
    const c = createRng(seed * 13 + 5);
    const cur = { cover: "look", hand: "right" };
    let seen = 0;
    return (i) => {
      // after a plate says what he learned, that habit changes at once; otherwise the habits change at random
      const h = randomHabit(r);
      for (const pl of i.plates.slice(seen)) {
        if (pl === "timing") cur.cover = cur.cover === "look" ? "point" : "look";
        if (pl === "hand") cur.hand = cur.hand === "right" ? "left" : "right";
      }
      const plated = i.plates.length > seen;
      seen = i.plates.length;
      if (!plated) { cur.cover = h.cover; cur.hand = h.hand; }
      return { cover: cur.cover, hand: cur.hand, fistS: h.fistS, cheat: i.useful, reads: true, catchShark: nextFloat(c) < CATCH_P };
    };
  },
};

export function runPolicy(name, matches = MATCHES) {
  const rows = [];
  for (let seed = 1; seed <= matches; seed++) {
    const r = playMatch(seed, policies[name](seed));
    rows.push({ seed, rounds: r.rounds, winner: r.winner, buttons: { ...r.g.match.buttons }, strikes: { ...r.g.match.strikes }, attempts: r.attempts.map((a) => ({ round: a.round, cover: a.cover, hand: a.hand, adapted: a.adaptedBefore, caught: a.caught, swapped: a.swapped, backUp: a.backUp })), adapted: r.adapted });
  }
  const all = rows.flatMap((m) => m.attempts);
  const adapted = all.filter((a) => a.adapted);
  const rate = (l) => (l.length ? +(l.filter((a) => a.caught).length / l.length).toFixed(3) : null);
  return {
    policy: name, matches: rows.length,
    playerWins: rows.filter((m) => m.winner === "player").length,
    winRate: +(rows.filter((m) => m.winner === "player").length / rows.length).toFixed(3),
    cheats: all.length, caught: all.filter((a) => a.caught).length, catchRate: rate(all),
    cheatsWhileAdapted: adapted.length, caughtWhileAdapted: adapted.filter((a) => a.caught).length, catchRateWhileAdapted: rate(adapted),
    cheatsNotAdapted: all.length - adapted.length, catchRateNotAdapted: rate(all.filter((a) => !a.adapted)),
    matchesWithPlate: rows.filter((m) => m.adapted.glance + m.adapted.hand + m.adapted.fist > 0).length,
    avgRounds: +(rows.reduce((n, m) => n + m.rounds, 0) / rows.length).toFixed(2),
    rows,
  };
}

if (process.argv[1].endsWith("habit-sim.mjs")) {
  const mi = process.argv.indexOf("--matches");
  const n = mi > 0 ? +process.argv[mi + 1] : MATCHES;
  const out = ["keeps", "random", "reads"].map((p) => runPolicy(p, n));
  console.log(JSON.stringify(out.map(({ rows, ...s }) => s), null, 1));
  const i = process.argv.indexOf("--out");
  if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify({ seeds: `1..${n}`, level: "normal", results: out }, null, 1));
}
