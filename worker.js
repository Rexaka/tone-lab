import {detectPitch} from './pitch.mjs';
self.onmessage=({data})=>self.postMessage(detectPitch(data.samples,data.rate,data.gate));
