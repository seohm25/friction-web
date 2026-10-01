import * as THREE from './vendor/three/three.module.js';
import { towerOrientation } from './tower-layout.js';
import { startMotion,stopMotion,readCameraGravity } from './motion.js';
import { GLTFLoader } from './vendor/three/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';
const $ = id => document.getElementById(id);
let mode='idle', ar, source, sourcePromise, models=[], session=0, stream;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const status=s=>{$('tracking').textContent=s;$('tracking').hidden=!s;};
const message=s=>{$('message').textContent=s;};
function busy(value){$('start').disabled=value;}
function setActive(){mode='ar';document.body.classList.add('active');$('welcome').hidden=true;$('close').hidden=false;}
async function loadModel(){
 if(source) return source;
 if(!sourcePromise) sourcePromise=fetch('./assets/frictionAR.glb').then(async response=>{
  if(!response.ok)throw new Error('modelFetch');
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength<20||new DataView(bytes).getUint32(8,true)!==bytes.byteLength)throw new Error('modelIncomplete');
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,new URL('./assets/',location.href).href);
 }).then(g=>{
  source=g.scene;
  const box=new THREE.Box3().setFromObject(source), size=box.getSize(new THREE.Vector3()), center=box.getCenter(new THREE.Vector3());
  const scale=Math.min(1.12/size.x,1.9/size.y);
  source.updateMatrixWorld(true);
  // Sort by displayed height so adjacent words turn in opposite directions.
  const words=[...source.children].map(child=>({child,center:new THREE.Box3().setFromObject(child).getCenter(new THREE.Vector3())}));
  words.sort((a,b)=>b.center.y-a.center.y);
  words.forEach(({child,center},index)=>{
   const pivot=new THREE.Group();pivot.name='gesture-spin-'+index;
   pivot.position.copy(source.worldToLocal(center.clone()));
   source.add(pivot);pivot.attach(child);
   // Rotate about each word's own vertical axis: a horizontal left/right turn.
   pivot.userData.spinRate=[.48,-.42,.46,-.44][index%4];
  });
  source.position.sub(new THREE.Vector3(center.x,box.min.y,center.z));const normalized=new THREE.Group();normalized.add(source);normalized.scale.setScalar(scale);
  source=normalized;return source;
 }).catch(e=>{sourcePromise=null;throw e});
 return sourcePromise;
}
function addLights(scene){scene.add(new THREE.HemisphereLight(0xffffff,0x938299,2.4));const light=new THREE.DirectionalLight(0xffffff,3.2);light.position.set(1,2,4);scene.add(light);}
function stopMedia(){stream?.getTracks().forEach(t=>t.stop());stream=null;ar?.video?.srcObject?.getTracks().forEach(t=>t.stop());}
function close(){
 session++;stopMedia();stopMotion();
 if(ar){ar.controller?.stopProcessVideo();ar.renderer.setAnimationLoop(null);ar.video?.remove();ar.anchors.forEach(a=>{a.group.visible=false;a.visible=false});}
 $('viewport').querySelectorAll('video').forEach(v=>v.remove());models=[];mode='idle';
 document.body.classList.remove('active');$('welcome').hidden=false;$('close').hidden=true;status('');busy(false);
 $('start').focus();
}
$('close').onclick=()=>{
 message('');close();
 if(parent!==window){parent.postMessage('friction-ar-close',location.origin);return;}
 const requested=new URLSearchParams(location.search).get('home');
 const name=requested==='index-iphone7.html'?'index-iphone7.html':'index.html';
 const home=new URL('../'+name,location.href);
 let cameFromHome=false;
 try{const ref=new URL(document.referrer);cameFromHome=ref.origin===home.origin&&ref.pathname===home.pathname;}catch{}
 if(cameFromHome&&history.length>1){history.back();}else{location.replace(home.href);}
};
window.addEventListener('pagehide',close);
document.addEventListener('visibilitychange',()=>{if(document.hidden && mode!=='idle'){close();message('Camera stopped. Tap to start again.')}});
function pop(model){model.userData.started=performance.now();model.userData.lastFrame=0;model.userData.oriented=false;}
// A shared animation clock survives poster loss/reacquisition on slower phones.
const rotationEpoch=performance.now();
function animateModels(){
 const now=performance.now();
 for(const model of models){
  const t=reduced?1:Math.min(1,(now-model.userData.started)/650),ease=1-Math.pow(1-t,3);
  model.scale.setScalar(.85+.15*ease);model.position.set(0,0,.1);
  model.parent.updateWorldMatrix(true,false);
  const orientation=towerOrientation(model.parent.matrixWorld,new THREE.Vector3().setFromMatrixPosition(ar.camera.matrixWorld),readCameraGravity());
  const dt=Math.min((now-(model.userData.lastFrame||now))/1000,.1);model.userData.lastFrame=now;
  if(!model.userData.oriented){model.quaternion.copy(orientation);model.userData.oriented=true;}
  else model.quaternion.slerp(orientation,1-Math.exp(-dt*7));
  const up=new THREE.Vector3(0,1,0).applyQuaternion(model.quaternion);
  const onWall=1-THREE.MathUtils.smoothstep(Math.abs(up.z),.45,.8);
  model.position.addScaledVector(up,-.82*onWall);
  const elapsed=(now-rotationEpoch)/1000;
  model.traverse(part=>{if(part.userData.spinRate){part.rotation.set(0,elapsed*part.userData.spinRate*(reduced ? 0.5 : 1),0);}});
 }
}
async function createAR(){
 const {MindARThree}=await import('./vendor/mindar-image-three.prod.js');
 const {Controller}=await import('./vendor/mindar-image.prod.js');
 const object=await loadModel();
 const mind=new MindARThree({container:$('viewport'),imageTargetSrc:'./assets/targets.mind',maxTrack:1,uiLoading:'no',uiScanning:'no',uiError:'no',warmupTolerance:3,missTolerance:8,filterMinCF:.001,filterBeta:.01});
 mind.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
 mind.cssRenderer.domElement.hidden=true;addLights(mind.scene);
 for(let index=0;index<2;index++){
  const anchor=mind.addAnchor(index), model=new THREE.Group();model.add(object.clone(true));anchor.group.add(model);
  anchor.onTargetFound=()=>{pop(model);status('');};
  anchor.onTargetLost=()=>{if(!mind.anchors.some(a=>a.visible)){status('Point your camera at the poster.');}};
 }
 // Use an awaited startup path so asset or GPU failures reach the retry UI.
 mind.begin=async(video,token)=>{
  mind.video=video;
  const controller=new Controller({inputWidth:video.videoWidth,inputHeight:video.videoHeight,maxTrack:1,warmupTolerance:3,missTolerance:8,filterMinCF:.001,filterBeta:.01,onUpdate:data=>{
   if(data.type!=='updateMatrix'||token!==session)return;
   for(const anchor of mind.anchors){if(anchor.targetIndex!==data.targetIndex)continue;
    const visible=data.worldMatrix!==null;
    anchor.group.visible=visible;
    if(visible){const matrix=new THREE.Matrix4();matrix.elements=[...data.worldMatrix];matrix.multiply(mind.postMatrixs[anchor.targetIndex]);anchor.group.matrix.copy(matrix);
    }
    const previous=anchor.visible;anchor.visible=visible;if(visible&&!previous)anchor.onTargetFound?.();if(!visible&&previous)anchor.onTargetLost?.();
   }
  }});
  mind.controller=controller;
  mind.resize();
  const {dimensions}=await controller.addImageTargets(mind.imageTargetSrc);
  if(token!==session)return;
  mind.postMatrixs=dimensions.map(([w,h])=>new THREE.Matrix4().compose(new THREE.Vector3(w/2,h/2,0),new THREE.Quaternion(),new THREE.Vector3(w,w,w)));
  await controller.dummyRun(video);
  if(token!==session)return;
  controller.processVideo(video);
  mind.renderer.setAnimationLoop(()=>{animateModels();mind.renderer.render(mind.scene,mind.camera)});
 };
 return mind;
}
$('start').onclick=async()=>{
 const token=++session;mode='loading';busy(true);message('Opening camera…');
 const motionReady=startMotion().then(granted=>{if(token!==session)stopMotion();return granted;});
 try{
  if(!isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('secure');
  const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
  if(token!==session){media.getTracks().forEach(t=>t.stop());return;}stream=media;
  // Display the live camera before loading the AR model/tracker on older phones.
  setActive();status('Preparing AR…');
  const video=document.createElement('video');video.muted=true;video.autoplay=true;video.playsInline=true;
  video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');
  video.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover';
  const videoReady=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('video')),20000);
   video.onloadedmetadata=()=>{clearTimeout(timer);resolve()};
   video.onerror=()=>{clearTimeout(timer);reject(new Error('video'))};
  });
  video.srcObject=media;$('viewport').prepend(video);
  await videoReady;await video.play();if(token!==session)return;
  await motionReady;if(token!==session){stopMotion();return;}
  if(!ar)ar=await createAR();
  if(token!==session){stopMedia();return;}
  ar.renderer.domElement.hidden=false;
  models=ar.anchors.map(a=>a.group.children[0]);models.forEach(pop);
  await ar.begin(video,token);if(token!==session)return;
  status('Point your camera at the poster.');message('');busy(false);
 }catch(error){if(token!==session)return;console.error(error);close();message(error?.message==='modelIncomplete'?'The artwork could not be loaded. Please try again later.':error?.name==='NotAllowedError'?'Allow camera access in your browser settings, then tap to try again.':error?.name==='NotFoundError'?'No camera found. Open this link on a phone with a camera.':error?.name==='NotReadableError'?'Your camera is in use. Close the other app and try again.':error?.message==='secure'?'Open this HTTPS link in Safari or Chrome to use the camera.':'Unable to start AR. Check your connection and tap to try again.');}
};

async function showTap(){
 try{
  const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('./assets/tap.glb');
  const scene=new THREE.Scene();addLights(scene);
  const model=gltf.scene, bounds=new THREE.Box3().setFromObject(model), size=bounds.getSize(new THREE.Vector3());
  model.position.sub(bounds.getCenter(new THREE.Vector3()));
  const group=new THREE.Group();group.add(model);group.scale.setScalar(2.6/Math.max(size.x,size.y));scene.add(group);
  const camera=new THREE.PerspectiveCamera(35,1.5,.01,100);camera.position.set(0,0,5.5);
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(270,180);renderer.setClearColor(0,0);
  $('tap-art').appendChild(renderer.domElement);renderer.render(scene,camera);
  $('start').classList.add('ready');
 }catch(error){console.error(error);$('tap-art').textContent='Tap';$('start').classList.add('ready');}
}
if(new URLSearchParams(location.search).get('autostart')==='1'){
 // Skip the tap model download and request the camera immediately.
 $('tap-art').textContent='Start AR';$('start').classList.add('ready');
 $('start').onclick();
}else{showTap();}

window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data==='friction-ar-stop'){message('');close();}});
