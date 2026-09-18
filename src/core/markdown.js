import { $ } from './dom.js';
import { esc } from './util.js';

export function mdInline(s){
  return s.replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function md(src){
  var lines=esc(src||'').split('\n');
  var out='',inList=false,inCode=false,inTable=false,buf=[];
  for(var i=0;i<lines.length;i++){
    var line=lines[i];
    if(line.trim().indexOf('```')===0){
      if(inCode){out+='<pre><code>'+buf.join('\n')+'</code></pre>';buf=[];inCode=false;}
      else{inCode=true;}
      continue;
    }
    if(inCode){buf.push(line);continue;}
    var m;
    if((m=line.match(/^\s*[-*+]\s+(.*)$/))){
      if(!inList){out+='<ul>';inList=true;}
      out+='<li>'+mdInline(m[1])+'</li>';
      continue;
    }else if(inList){out+='</ul>';inList=false;}
    if((m=line.match(/^(#{1,6})\s+(.*)$/))){
      var lvl=m[1].length;
      out+='<h'+lvl+'>'+mdInline(m[2])+'</h'+lvl+'>';
      continue;
    }
    if(line.trim()==='')continue;
    out+='<p>'+mdInline(line)+'</p>';
  }
  if(inList)out+='</ul>';
  if(inCode)out+='<pre><code>'+buf.join('\n')+'</code></pre>';
  return out;
}
