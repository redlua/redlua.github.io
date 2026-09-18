export function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

export function uid(p){return (p||'id')+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);}

export function timeAgo(ts){
  var s=Math.floor((Date.now()-ts)/1000);
  if(s<60)return 'just now';
  var m=Math.floor(s/60);if(m<60)return m+(m===1?' minute ago':' minutes ago');
  var h=Math.floor(m/60);if(h<24)return h+(h===1?' hour ago':' hours ago');
  var d=Math.floor(h/24);if(d<30)return d+(d===1?' day ago':' days ago');
  var mo=Math.floor(d/30);if(mo<12)return mo+(mo===1?' month ago':' months ago');
  return Math.floor(mo/12)+' year(s) ago';
}

export function formatDate(ts){try{return new Date(ts).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});}catch(e){return new Date(ts).toDateString();}}

export function pad(n){return n<10?'0'+n:''+n;}

export function shortSha(){return Math.random().toString(16).slice(2,9);}

export function fullSha(){var s='';for(var i=0;i<40;i++)s+='0123456789abcdef'[Math.floor(Math.random()*16)];return s;}

/** URL-safe slug: "My Page!" → "my-page". */
export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Compact byte size, e.g. 1536 → "1.5 KB". */
export function formatBytes(bytes) {
  var n = Number(bytes) || 0;
  if (n < 1024) return n + ' B';
  var units = ['KB', 'MB', 'GB', 'TB'];
  var i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
  return n.toFixed(n < 10 ? 1 : 0) + ' ' + units[i];
}

/** Milliseconds → "1m 12s" / "3h 04m". */
export function formatDuration(ms) {
  var s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (s < 60) return s + 's';
  var m = Math.floor(s / 60);
  if (m < 60) return m + 'm ' + pad(s % 60) + 's';
  var h = Math.floor(m / 60);
  return h + 'h ' + pad(m % 60) + 'm';
}

/** Group a list into [{ key, items }] preserving first-seen order. */
export function groupBy(list, keyFn) {
  var order = [];
  var map = {};
  (list || []).forEach(function (item) {
    var key = keyFn(item);
    if (!map[key]) { map[key] = []; order.push(key); }
    map[key].push(item);
  });
  return order.map(function (key) { return { key: key, items: map[key] }; });
}

/** Stable sort without mutating the input. */
export function sortBy(list, keyFn, dir) {
  var sign = dir === 'desc' ? -1 : 1;
  return (list || []).slice().sort(function (a, b) {
    var x = keyFn(a);
    var y = keyFn(b);
    if (x === y) return 0;
    return (x > y ? 1 : -1) * sign;
  });
}
