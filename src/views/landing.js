import { ic } from '../icons.js';
import { showAuth } from '../core/auth.js';
import { esc } from '../core/util.js';

export function viewLanding(){
  return '<div class="container">'+
    '<section class="hero">'+
      '<div class="hero-eyebrow"><span class="dot"></span>Available now · No email required</div>'+
      '<h1>Version control without <span class="accent">the password</span>.</h1>'+
      '<p class="hero-lede">RedGet replaces the entire account system with a single 15-character key. No signup forms, no confirmation emails, no reset flows.</p>'+
      '<div class="hero-cta">'+
        '<button class="btn primary lg" onclick="showAuth(\'create\')">Create your account '+ic('plus',16)+'</button>'+
        '<button class="btn lg" onclick="showAuth(\'signin\')">I already have a key</button>'+
      '</div>'+
      '<div class="hero-note">'+
        '<span>'+ic('shield',14)+' Free for individuals</span>'+
        '<span>'+ic('forge',14)+' Unlimited forges</span>'+
        '<span>'+ic('graph',14)+' Instant provisioning</span>'+
      '</div>'+
    '</section>'+
    '<section class="landing-section">'+
      '<div class="landing-head"><div class="landing-tag">Capabilities</div>'+
      '<h2>Everything a forge needs</h2>'+
      '<p>A focused toolset for storing, browsing and managing source code.</p></div>'+
      '<div class="feature-grid">'+
        featureCard('shield','Key-based identity','A single 15-character key is your entire credential.')+
        featureCard('forge','Unlimited forges','Public or private, organised and searchable.')+
        featureCard('file','File browsing','Navigate project structure directly in the browser.')+
        featureCard('redBranch','Version history','Track every change with timestamps and activity logs.')+
        featureCard('eye','Local-first privacy','Your account lives in your browser. No servers, no tracking.')+
        featureCard('graph','Instant setup','No verification step. Create an account and start immediately.')+
      '</div>'+
    '</section>'+
    '<section class="landing-section">'+
      '<div style="text-align:center;padding:48px 32px;background:linear-gradient(180deg,var(--surface),var(--surface-2));border:1px solid var(--border);border-radius:12px">'+
        '<h2 style="font-size:24px;margin-bottom:10px">Start your first forge</h2>'+
        '<p style="font-size:15px;color:var(--text-muted);max-width:440px;margin:0 auto 24px;line-height:1.6">Create an account, receive your key, and push code in the time it takes to read this sentence.</p>'+
        '<button class="btn primary lg" onclick="showAuth(\'create\')">Create your account '+ic('plus',16)+'</button>'+
      '</div>'+
    '</section>'+
    '<footer class="landing-footer"><div class="landing-footer-inner">'+
      '<span>© '+new Date().getFullYear()+' RedGet. All rights reserved.</span>'+
      '<span>Built for people who ship.</span>'+
    '</div></footer>'+
  '</div>';
}

export function featureCard(icon,title,body){
  return '<div class="feature-card"><div class="feature-icon">'+ic(icon,18)+'</div><h3>'+esc(title)+'</h3><p>'+esc(body)+'</p></div>';
}
