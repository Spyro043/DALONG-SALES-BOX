const cheerio = require('cheerio');

function robotsAllows(text, value) {
  const groups=[];let group={agents:[],rules:[]}, hasRules=false;
  for(const line of String(text).split(/\r?\n/)) {
    const match=line.replace(/#.*$/,'').trim().match(/^([\w-]+)\s*:\s*(.*)$/);if(!match)continue;
    const key=match[1].toLowerCase(),val=match[2].trim();
    if(key==='user-agent'){if(hasRules){groups.push(group);group={agents:[],rules:[]};hasRules=false;}group.agents.push(val.toLowerCase());}
    if(['allow','disallow'].includes(key)&&group.agents.length){hasRules=true;if(val)group.rules.push({allow:key==='allow',path:val});}
  }
  groups.push(group);
  const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&'outreachdesk'.includes(a)));
  const selected=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
  const url=new URL(value),target=url.pathname+url.search;
  const matches=selected.flatMap(g=>g.rules).filter(r=>{
    const end=r.path.endsWith('$');const path=end?r.path.slice(0,-1):r.path;
    const pattern=path.split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');
    return new RegExp('^'+pattern+(end?'$':'')).test(target);
  }).sort((a,b)=>b.path.replace(/[*$]/g,'').length-a.path.replace(/[*$]/g,'').length || Number(b.allow)-Number(a.allow));
  return !matches.length||matches[0].allow;
}

async function crawlPublic(website, publicFetch) {
  const origin=new URL(/^https?:\/\//i.test(website)?website:'https://'+website).origin;
  const robotsCache=new Map();
  async function allowed(value) {
    const url=new URL(value);
    if(!robotsCache.has(url.origin)) {
      try {robotsCache.set(url.origin,(await publicFetch(url.origin+'/robots.txt')).text);}
      catch(err){if(/网站 HTTP (404|410)$/.test(err.message))robotsCache.set(url.origin,'');else throw new Error('无法确认网站抓取许可：'+err.message);}
    }
    if(!robotsAllows(robotsCache.get(url.origin),url.href))throw new Error('网站 robots.txt 禁止读取此页面');
  }
  const pages=[],visited=new Set(),queue=[origin];let attempts=0,canonicalOrigin=origin;
  while(queue.length&&attempts<3) {
    const next=queue.shift();if(visited.has(next))continue;visited.add(next);attempts++;
    try {
      if(pages.length)await new Promise(r=>setTimeout(r,500));
      const page=await publicFetch(next,allowed),$=cheerio.load(page.text);visited.add(page.url);
      if(pages.length===0)canonicalOrigin=new URL(page.url).origin;
      if(new URL(page.url).origin!==canonicalOrigin)continue;
      if($('input[type="password"]').length)throw new Error('需要登录的页面不采集');
      $('script,style,noscript').remove();$('p,div,section,nav,footer,li,header,h1,h2,h3,br').before(' ').after(' ');
      const linked=$('a[href^="mailto:"],a[href^="tel:"]').map((_,a)=>{try{return decodeURIComponent($(a).attr('href').replace(/^(mailto|tel):/,'').split('?')[0]);}catch{return '';}}).get().join(' ');
      pages.push({url:page.url,title:$('title').text(),text:(linked+' '+$('body').text()).replace(/\s+/g,' ').slice(0,16000)});
      if(pages.length===1)$('a[href]').each((_,a)=>{try{const u=new URL($(a).attr('href'),page.url);u.hash='';if(u.origin===canonicalOrigin&&/contact|about|team|联系|关于/i.test(u.pathname+' '+$(a).text())&&!visited.has(u.href)&&!queue.includes(u.href))queue.push(u.href);}catch{}});
    }catch(err){if(!pages.length)throw err;}
  }
  return pages;
}
module.exports={robotsAllows,crawlPublic};
