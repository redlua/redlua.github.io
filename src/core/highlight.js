import { $ } from './dom.js';
import { esc } from './util.js';

export function highlight(code,filename){
  if(!code)return '';
  var s=esc(code);
  var isJS=/\.(js|ts|jsx|tsx|json)$/i.test(filename||'');
  var isHTML=/\.(html?)$/i.test(filename||'');
  var isCSS=/\.(css|scss)$/i.test(filename||'');
  var isPy=/\.py$/i.test(filename||'');
  if(isJS||isPy){
    s=s.replace(/\/\/.*$/gm,'<span class="tok-comment">$&</span>');
    s=s.replace(/(&quot;[^&]*&quot;|&#39;[^&]*&#39;|`[^`]*`)/g,'<span class="tok-str">$1</span>');
    s=s.replace(/\b(function|const|let|var|return|if|else|for|while|class|new|this|import|from|export|default|async|await|try|catch|throw|typeof|instanceof|def|elif|None|True|False|print|lambda)\b/g,'<span class="tok-key">$1</span>');
    s=s.replace(/\b(\d+(?:\.\d+)?)\b/g,'<span class="tok-num">$1</span>');
  }else if(isHTML){
    s=s.replace(/(&lt;\/?)([a-zA-Z][a-zA-Z0-9]*)/g,'$1<span class="tok-tag">$2</span>');
    s=s.replace(/([a-zA-Z-]+)=(&quot;[^&]*&quot;)/g,'<span class="tok-attr">$1</span>=<span class="tok-str">$2</span>');
  }else if(isCSS){
    s=s.replace(/\/\*[\s\S]*?\*\//g,'<span class="tok-comment">$&</span>');
    s=s.replace(/([a-z-]+)\s*:/g,'<span class="tok-attr">$1</span>:');
    s=s.replace(/:\s*([^;]+);/g,': <span class="tok-str">$1</span>;');
  }
  return s;
}
