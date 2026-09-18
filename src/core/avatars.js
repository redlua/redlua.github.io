import { esc } from './util.js';

export var AVATAR_COLORS=['#7f1d1d','#831843','#5b21b6','#3730a3','#1e3a8a','#164e63','#134e4a','#365314','#78350f','#3f3f46','#4c1d95','#0f766e'];

export function initialsFor(name){
  var n=String(name||'?').trim();
  if(!n)return '?';
  var p=n.split(/[\s_\-.]+/).filter(Boolean);
  if(p.length>=2)return (p[0][0]+p[1][0]).toUpperCase();
  return n.slice(0,2).toUpperCase();
}

export function defaultAvatar(user){
  var seed=0,s=String(user&&user.username||'x');
  for(var i=0;i<s.length;i++)seed=(seed*31+s.charCodeAt(i))>>>0;
  return {type:'initials',value:'',bg:AVATAR_COLORS[seed%AVATAR_COLORS.length]};
}

export function avatarHTML(user,size,radius){
  var a=(user&&user.avatar)||defaultAvatar(user||{});
  var r=radius||'50%';
  var style='width:'+size+'px;height:'+size+'px;border-radius:'+r+';';
  if(a.type==='image'&&a.value){
    return '<div class="avatar" style="'+style+'"><img src="'+esc(a.value)+'" alt=""></div>';
  }
  var bg=a.bg||AVATAR_COLORS[0];
  var ini=initialsFor((user&&(user.displayName||user.username))||'?');
  var fs=Math.max(9,Math.round(size*0.38));
  return '<div class="avatar" style="'+style+'background:'+esc(bg)+';font-size:'+fs+'px">'+esc(ini)+'</div>';
}

export function avatarInner(user,size){
  var a=(user&&user.avatar)||defaultAvatar(user||{});
  if(a.type==='image'&&a.value)return '<img src="'+esc(a.value)+'" alt="" style="width:100%;height:100%;object-fit:cover;display:block">';
  var ini=initialsFor((user&&(user.displayName||user.username))||'?');
  return '<span style="font-size:'+Math.round(size*0.38)+'px;font-weight:600;color:#fff">'+esc(ini)+'</span>';
}
