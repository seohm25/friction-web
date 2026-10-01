const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class PosterResponse {
 constructor(){this.reset();}
 reset(){this.previous=null;this.velocity=[0,0,0];this.angularSpeed=0;this.samples=0;this.readyAt=0;this.lastImpulse=-Infinity;this.value=0;this.springVelocity=0;this.direction=[0,0];}
 sample(position,quaternion,now){
  if(![...position,...quaternion,now].every(Number.isFinite)){this.reset();return false;}
  const previous=this.previous;this.previous={position:[...position],quaternion:[...quaternion],time:now};
  if(!previous){this.readyAt=now+600;return false;}
  const dt=(now-previous.time)/1000;
  const delta=position.map((v,i)=>v-previous.position[i]);const distance=Math.hypot(...delta);
  const dot=Math.abs(quaternion.reduce((s,v,i)=>s+v*previous.quaternion[i],0));
  const angle=2*Math.acos(clamp(dot,0,1));
  // Reject tracking discontinuities; reacquiring a target is never a tap.
  if(dt<=.005||dt>.25||distance>.3||angle>.45){this.reset();this.previous={position:[...position],quaternion:[...quaternion],time:now};this.readyAt=now+600;return false;}
  this.samples++;
  const velocity=delta.map(v=>distance<.0035?0:v/dt);
  const blend=1-Math.exp(-dt*14);
  const old=[...this.velocity];this.velocity=this.velocity.map((v,i)=>v+(velocity[i]-v)*blend);
  const speed=Math.hypot(...this.velocity),change=Math.hypot(...this.velocity.map((v,i)=>v-old[i]));
  const angular=angle<.006?0:angle/dt;
  const oldAngular=this.angularSpeed;this.angularSpeed+=(angular-this.angularSpeed)*blend;
  const quickTranslation=speed>.19&&change>.12;
  const quickTilt=this.angularSpeed>.85&&this.angularSpeed-oldAngular>.4;
  if(now<this.readyAt||this.samples<5||now-this.lastImpulse<350||!(quickTranslation||quickTilt))return false;
  this.lastImpulse=now;
  this.springVelocity=clamp(this.springVelocity+.5+speed*.45+this.angularSpeed*.1,0,1.1);
  this.direction=[clamp(this.velocity[0],-1,1),clamp(this.velocity[1],-1,1)];
  return true;
 }
 step(seconds){
  const dt=clamp(seconds,0,.08),steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
  for(let i=0;i<steps;i++){
   this.springVelocity+=(-324*this.value-13*this.springVelocity)*h;
   this.value+=this.springVelocity*h;
   if(Math.abs(this.value)>.045){this.value=clamp(this.value,-.045,.045);this.springVelocity=0;}
  }
  if(Math.abs(this.value)<.00002&&Math.abs(this.springVelocity)<.0002){this.value=0;this.springVelocity=0;}
  return this.value;
 }
}
