// Quick checks of levels, daily rewards and missions logic.
import { addXp, claimDaily, dailyAvailable, missions, trackMatch, claimMission, matchXp, nextUnlock } from '../src/progress';
import { profile } from '../src/save';
const c0 = profile.coins;
console.log('xp win hard 3 rounds 2 kills =', matchXp({ rounds: 3, kills: 2, won: true, diff: 'hard' }));
const ups = addXp(1000);
console.log('levels gained', ups.map(u => `${u.level}:+${u.coins}${u.unlocks.length ? ' ' + u.unlocks.join('/') : ''}`).join(' | '), '→ level', profile.level, 'xp', profile.xp);
console.log('owned camo?', profile.owned.includes('gun_camo'), 'next unlock', nextUnlock());
console.log('daily available day', dailyAvailable(), 'claim', claimDaily(), 'again', dailyAvailable());
const ms = missions(); console.log('missions', ms.map(m => m.def.text));
const done = trackMatch({ won: true, kills: 6, rounds: 8, diff: 'hard', reachedFinal: true, bots: 5 });
console.log('completed', done);
console.log('claim all', ms.map(m => claimMission(m.id)), 'coins gained total', profile.coins - c0);
