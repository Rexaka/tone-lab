import assert from 'node:assert/strict';
import {detectPitch,hzFor,midiFor} from './pitch.mjs';
let checks=0,worst=0;
for(const rate of [44100,48000])for(let midi=36;midi<=95;midi++)for(const timbre of ['sine','harmonics','weak-fundamental']){
 const f=hzFor(midi,442),samples=Float32Array.from({length:4096},(_,i)=>{const t=i/rate,phase=2*Math.PI*f*t;return .14*(timbre==='sine'?Math.sin(phase):timbre==='harmonics'?Math.sin(phase)+.4*Math.sin(2*phase)+.25*Math.sin(3*phase):.25*Math.sin(phase)+Math.sin(2*phase)+.5*Math.sin(3*phase));});
 const r=detectPitch(samples,rate);assert(r.frequency,`${rate} ${midi} ${timbre}: no pitch`);const cents=Math.abs(1200*Math.log2(r.frequency/f));worst=Math.max(worst,cents);assert(cents<15,`${rate} ${midi} ${timbre}: ${cents} cents`);assert.equal(Math.round(midiFor(r.frequency,442)),midi);checks++;
}
assert.equal(detectPitch(new Float32Array(4096),48000).frequency,null);
let seed=123;const noise=Float32Array.from({length:4096},()=>{seed=(seed*16807)%2147483647;return (seed/2147483647-.5)*.2;});assert.equal(detectPitch(noise,48000).frequency,null);
assert.equal(detectPitch(Float32Array.from({length:4096},(_,i)=>.001*Math.sin(i*.1)),48000).frequency,null);
console.log(`${checks} pitch cases passed, worst error ${worst.toFixed(2)} cents. Silence, noise and gate passed.`);
