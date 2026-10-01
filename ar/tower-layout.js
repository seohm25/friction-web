import * as THREE from './vendor/three/three.module.js';
// Orient the entire vertical composition, rather than tilting words in separate rows.
export function towerOrientation(anchorMatrix,cameraPosition,gravityCamera=null){
 const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
 anchorMatrix.decompose(position,rotation,scale);
 const inverse=rotation.clone().invert();
 const normal=new THREE.Vector3(0,0,1).applyQuaternion(rotation);
 const posterUp=new THREE.Vector3(0,1,0).applyQuaternion(rotation);
 const up=(gravityCamera||new THREE.Vector3(0,1,0)).clone().normalize();
 // Sensor implementations differ in sign. Face-up paper and upright printing
 // provide an unambiguous hemisphere for normal exhibition orientations.
 if(gravityCamera){const reference=Math.abs(up.dot(normal))>.65?normal:posterUp;if(up.dot(reference)<0)up.negate();}
 up.applyQuaternion(inverse);
 const toward=cameraPosition.clone().sub(position).applyQuaternion(inverse);
 toward.addScaledVector(up,-toward.dot(up));
 if(toward.lengthSq()<1e-5){toward.set(0,0,1).addScaledVector(up,-up.z);if(toward.lengthSq()<1e-5)toward.set(0,-1,0);}
 toward.normalize();
 const right=new THREE.Vector3().crossVectors(up,toward).normalize();
 const front=new THREE.Vector3().crossVectors(right,up).normalize();
 return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,front));
}
