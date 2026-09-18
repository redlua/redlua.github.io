import { DB, SESSION_KEY, setSession, recordLogin } from '../state.js';
import { ic, logoMark } from '../icons.js';
import { createUser } from './account.js';
import { $ } from './dom.js';
import { fmtKey, normKey } from './keys.js';
import { closeModal, openModal } from './modal.js';
import { navigate } from './router.js';
import { copyText, toast } from './toast.js';
import { esc } from './util.js';

export function showAuth(mode){
  mode=mode||'create';
  var createActive=mode==='create';
  openModal(
    '<div class="modal">'+
      '<div class="modal-head">'+
        '<div><div class="modal-brand">'+logoMark(28)+'<h2>'+(createActive?'Create your account':'Sign in with your key')+'</h2></div></div>'+
        '<button class="modal-close" onclick="closeModal()" aria-label="Close">'+ic('x',16)+'</button>'+
      '</div>'+
      '<div class="tab-switcher">'+
        '<button class="'+(createActive?'active':'')+'" onclick="showAuth(\'create\')">Create account</button>'+
        '<button class="'+(!createActive?'active':'')+'" onclick="showAuth(\'signin\')">Use a key</button>'+
      '</div>'+
      '<div class="modal-body" id="authBody"></div>'+
      '<div class="modal-foot" id="authFoot"></div>'+
    '</div>'
  );
  if(createActive)renderAuthCreate();else renderAuthSignin();
}

export function renderAuthCreate(){
  $('#authBody').innerHTML=
    '<p style="margin:0 0 16px;font-size:13px;color:var(--text-muted);line-height:1.6">RedGet does not use emails or passwords. We generate a unique 15-character key that becomes your only credential. Store it safely — it cannot be recovered.</p>'+
    '<div class="form-group"><label for="auUser">Username <span class="required">*</span></label>'+
      '<input type="text" id="auUser" class="input" placeholder="ada-lovelace" maxlength="30" autocomplete="off" spellcheck="false">'+
      '<div class="hint">Lowercase letters, numbers and hyphens.</div></div>'+
    '<div class="form-group"><label for="auName">Display name <span style="color:var(--text-muted);font-weight:400">(optional)</span></label>'+
      '<input type="text" id="auName" class="input" placeholder="Ada Lovelace" maxlength="40" autocomplete="off"></div>'+
    '<div class="form-error" id="auErr"></div>';
  $('#authFoot').innerHTML='<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="auGo">Create account</button>';
  var submit=function(){
    var username=($('#auUser').value||'').trim().toLowerCase().replace(/\s+/g,'-');
    var display=($('#auName').value||'').trim();
    var err=$('#auErr');
    if(username.length<2){err.textContent='Username must be at least 2 characters.';return;}
    if(username.length>30){err.textContent='Username must be 30 characters or fewer.';return;}
    if(!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(username)){err.textContent='Use lowercase letters, numbers and hyphens only.';return;}
    if(/--/.test(username)){err.textContent='Username cannot contain consecutive hyphens.';return;}
    var taken=Object.keys(DB.users).some(function(k){return DB.users[k].username.toLowerCase()===username;});
    if(taken){err.textContent='That username is already taken.';return;}
    var account=createUser(username,display);
    showKeyReveal(account.key,true);
  };
  $('#auGo').addEventListener('click',submit);
  $('#auUser').addEventListener('keydown',function(e){if(e.key==='Enter')submit();});
  $('#auName').addEventListener('keydown',function(e){if(e.key==='Enter')submit();});
  setTimeout(function(){var el=$('#auUser');if(el)el.focus();},60);
}

export function renderAuthSignin(){
  $('#authBody').innerHTML=
    '<p style="margin:0 0 16px;font-size:13px;color:var(--text-muted);line-height:1.6">Enter the 15-character key you received when you created your account. Hyphens are optional.</p>'+
    '<div class="form-group"><label for="auKey">Account key</label>'+
      '<input type="text" id="auKey" class="input mono" placeholder="XXXX-XXXX-XXXX-XXX" maxlength="19" autocomplete="off" spellcheck="false" style="letter-spacing:.08em;text-transform:uppercase;font-size:15px"></div>'+
    '<div class="form-error" id="auErr"></div>';
  $('#authFoot').innerHTML='<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="auGo">Sign in</button>';
  var submit=function(){
    var key=normKey($('#auKey').value);
    var err=$('#auErr');
    if(key.length!==15){err.textContent='An account key is exactly 15 characters.';return;}
    if(!DB.users[key]){err.textContent='No account found for that key.';return;}
    var account=DB.users[key];
    setSession(account);
    recordLogin(account);
    closeModal();
    navigate('/');
    toast('Signed in as '+account.username,'success');
  };
  $('#auGo').addEventListener('click',submit);
  $('#auKey').addEventListener('keydown',function(e){if(e.key==='Enter')submit();});
  setTimeout(function(){var el=$('#auKey');if(el)el.focus();},60);
}

export function showKeyReveal(key,isNew){
  openModal(
    '<div class="modal">'+
      '<div class="modal-head">'+
        '<div><div class="modal-brand">'+logoMark(28)+'<h2>'+(isNew?'Save your account key':'Your account key')+'</h2></div>'+
        '<p class="sub">'+(isNew?'This is the only way to sign back in to <b style="color:var(--text-bright)">@'+esc(currentUser())+'</b>. RedGet cannot recover it for you.':'Anyone with this key can access your account. Do not share it.')+'</p></div>'+
        '<button class="modal-close" onclick="closeModal()" aria-label="Close">'+ic('x',16)+'</button>'+
      '</div>'+
      '<div class="modal-body">'+
        '<div class="key-reveal"><div class="cap">Account key</div><div class="val" id="krVal">'+fmtKey(key)+'</div></div>'+
        '<div style="display:flex;gap:10px">'+
          '<button class="btn" style="flex:1" id="krCopy">'+ic('copy',14)+' Copy key</button>'+
          (isNew?'':'<button class="btn primary" style="flex:1" onclick="closeModal()">Done</button>')+
        '</div>'+
        (isNew?'<label class="form-check" style="margin-top:16px"><input type="checkbox" id="krAck"><span style="font-size:13px;color:var(--text-muted)">I have saved this key in a secure location and understand it cannot be recovered.</span></label>':'')+
      '</div>'+
      (isNew?'<div class="modal-foot"><button class="btn primary" id="krGo" disabled>Continue to RedGet</button></div>':'')+
    '</div>'
  );
  $('#krCopy').addEventListener('click',function(){copyText(key);});
  if(isNew){
    $('#krAck').addEventListener('change',function(e){$('#krGo').disabled=!e.target.checked;});
    $('#krGo').addEventListener('click',function(){closeModal();navigate('/');toast('Account created — welcome to RedGet');});
  }
}

/** The signed-in username, read fresh (ME is a binding captured at import time). */
function currentUser(){
  try{
    var key=localStorage.getItem(SESSION_KEY);
    return key&&DB.users[key]?DB.users[key].username:'';
  }catch(e){return '';}
}
