// Checks the cloud-restore merge: device settings stay, progress comes from the cloud copy.
import { profile, replaceProfile } from '../src/save';
profile.sound = false; profile.gfx = 'low'; profile.level = 2; profile.coins = 50;
const cloud = { ...JSON.parse(JSON.stringify(profile)), level: 9, coins: 4000, owned: ['laser_mint'], sound: true, gfx: 'high' };
const keep = { sound: profile.sound, gfx: profile.gfx };
replaceProfile({ ...cloud, ...keep });
console.log({ level: profile.level, coins: profile.coins, sound: profile.sound, gfx: profile.gfx, hasFreeItems: profile.owned.includes('gun_classic'), hasMint: profile.owned.includes('laser_mint') });
