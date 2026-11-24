// YIN: squared difference + cumulative mean normalization + parabolic refinement.
// Fixed comparison window avoids the lag-dependent bias of shrinking windows.
export function detectPitch(input, sampleRate, gate = .006) {
  let mean = 0; for (const x of input) mean += x; mean /= input.length;
  const stride = Math.max(1, Math.floor(sampleRate / 24000));
  const size = Math.floor(input.length / stride), data = new Float32Array(size);
  let energy = 0;
  for (let i=0;i<size;i++){data[i]=input[i*stride]-mean;energy+=data[i]*data[i];}
  const rms = Math.sqrt(energy/size), rate=sampleRate/stride;
  if(rms<gate) return {frequency:null, confidence:0, rms};
  const maxLag=Math.min(Math.floor(rate/65),Math.floor(size/2)-1), minLag=Math.max(2,Math.floor(rate/2000));
  const window=size-maxLag, diff=new Float32Array(maxLag+1); let sum=0;
  diff[0]=1;
  for(let lag=1;lag<=maxLag;lag++){
    let d=0;for(let i=0;i<window;i++){const delta=data[i]-data[i+lag];d+=delta*delta;}
    sum+=d; diff[lag]=sum>0?d*lag/sum:1;
  }
  let lag=-1;
  for(let t=minLag;t<maxLag;t++) if(diff[t]<.14){while(t+1<=maxLag&&diff[t+1]<diff[t])t++;lag=t;break;}
  if(lag<0) return {frequency:null,confidence:0,rms};
  const confidence=Math.max(0,Math.min(1,1-diff[lag]));
  const a=diff[lag-1],b=diff[lag],c=diff[lag+1]??b;
  const denominator=a-2*b+c;
  const refined=lag+(denominator?Math.max(-1,Math.min(1,(a-c)/(2*denominator))):0);
  const frequency=rate/refined;
  return {frequency: frequency>=65&&frequency<=2000?frequency:null,confidence,rms};
}
export const midiFor = (frequency, a4=440) => 69+12*Math.log2(frequency/a4);
export const hzFor = (midi,a4=440) => a4*2**((midi-69)/12);
export function median(values){const s=[...values].sort((a,b)=>a-b); const i=Math.floor(s.length/2);return s.length%2?s[i]:(s[i-1]+s[i])/2;}
