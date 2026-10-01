import * as THREE from './vendor/three/three.module.js';
let gravity=null,lastSample=0,listening=false;
export function cameraGravity(raw,angle){
 return raw.clone().applyAxisAngle(new THREE.Vector3(0,0,1),-angle*Math.PI/180).normalize();
}
function sample(event){
 const a=event.accelerationIncludingGravity;
 if(!a||![a.x,a.y,a.z].every(Number.isFinite))return;
 const v=new THREE.Vector3(a.x,a.y,a.z);
 if(v.length()<6||v.length()>14)return;
 if(gravity)gravity.lerp(v,.15);else gravity=v;
 lastSample=performance.now();
}
export async function startMotion(){
 try{
  if(typeof DeviceMotionEvent==='undefined')return false;
  if(typeof DeviceMotionEvent.requestPermission==='function'&&await DeviceMotionEvent.requestPermission()!=='granted')return false;
  if(!listening){window.addEventListener('devicemotion',sample);listening=true;}
  return true;
 }catch{return false;}
}
export function stopMotion(){window.removeEventListener('devicemotion',sample);listening=false;gravity=null;lastSample=0;}
export function horizontalAlignment(posterMatrix){
 if(!gravity||performance.now()-lastSample>2500)return null;
 const angle=screen.orientation?.angle??window.orientation??0;
 const normal=new THREE.Vector3().setFromMatrixColumn(posterMatrix,2).normalize();
 return Math.abs(normal.dot(cameraGravity(gravity,angle)));
}

export function readCameraGravity(){
 if(!gravity||performance.now()-lastSample>2500)return null;
 return cameraGravity(gravity,screen.orientation?.angle??window.orientation??0);
}
