import * as THREE from './vendor/three/three.module.js';
// Prefer gravity to distinguish a horizontal poster from a wall.
// Fall back to viewing angle when motion data is unavailable.
export function standingPose(cameraInPoster,horizontal=null){
 const view=cameraInPoster.clone().normalize();
 const angle=Math.acos(THREE.MathUtils.clamp(Math.abs(view.z),0,1));
 const amount=horizontal===null?THREE.MathUtils.smoothstep(angle,Math.PI/9,Math.PI/3):THREE.MathUtils.smoothstep(horizontal,.6,.9);
 const tilt=amount*Math.PI/2;
 const normal=new THREE.Vector3(view.x,view.y,0);
 if(normal.lengthSq()<1e-8)normal.set(0,-1,0);else normal.normalize();
 const up=new THREE.Vector3(0,0,1);
 const right=new THREE.Vector3().crossVectors(up,normal).normalize();
 const standing=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,normal));
 return {tilt,amount,quaternion:new THREE.Quaternion().slerp(standing,amount)};
}
