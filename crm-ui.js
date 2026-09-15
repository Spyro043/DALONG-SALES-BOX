// CRM extension. Uses the existing workspace rendering and dialog helpers.
const customerFilter={q:'',grade:'',category:'',status:'',regions:new Set()};
let guessedEmails=[],guessContact={},verificationBusy=false,verificationQueue=[];
let discoveryBatch=null,discoveryTimer,discoverySelected=new Set();

function regionFilter(location) {
  return `<details class="region-filter"><summary>${location==='more'?'更多筛选':'外贸大区'} <span class="region-count">${customerFilter.regions.size?'（'+customerFilter.regions.size+'）':''}</span></summary><div class="region-options">${CRM.regions.map(r=>`<label class="check"><input type="checkbox" data-trade-filter="${r}" ${customerFilter.regions.has(r)?'checked':''}>${r}</label>`).join('')}${button('清空大区','clearRegions','x')}</div></details>`;
}
function renderCustomers() {
  if(detailId){renderCustomerDetail();return;}
  $('#main').innerHTML=heading('客户管理',`${button(`删除已选${customerIds.size?' ('+customerIds.size+')':''}`,'deleteSelectedCustomers','trash-2','danger')}${button('导出 Excel','export:customers:xlsx','download')}${button('CSV','export:customers:csv','download')}${button('导入表格','import:customers','upload')}${button('AI 智能录入','recognize','sparkles','primary')}${button('新建客户','newCustomer','plus')}`)+stats([['客户总数',state.customers.length],['A级客户',state.customers.filter(c=>c.grade==='A').length],['已联系',state.customers.filter(c=>c.lastContact).length],['待验证邮箱',state.customers.filter(c=>c.email&&!c.emailVerification).length]])+`<div class="toolbar"><input id="customerSearch" aria-label="搜索客户" placeholder="搜索编号、公司、联系人、邮箱、大区" value="${e(customerFilter.q)}">${select('','customerGrade',[['','全部等级'],'A','B','C','D'],customerFilter.grade)}${select('','customerCategory',[['','全部分类'],...[...new Set(state.customers.map(c=>c.category).filter(Boolean))]],customerFilter.category)}${select('','customerStatus',[['','全部阶段'],'待研究','待发信','已触达','已回复','已成交','已退订'],customerFilter.status)}${regionFilter('more')}</div><p id="customerFilterSummary" class="muted"></p><div class="table-scroll"><table><thead><tr><th><input id="selectVisibleCustomers" type="checkbox" aria-label="选择当前筛选结果"></th><th>公司 / 联系人</th><th>国家 · 行业</th><th>${regionFilter('header')}</th><th>邮箱 / 电话</th><th>等级</th><th>分类 / 阶段</th><th>跟进安排</th><th>最近联系</th><th></th></tr></thead><tbody id="customerRows"></tbody></table></div>`;
  customerRows();
}
function filteredCustomers() {
  customerFilter.q=$('#customerSearch')?.value??customerFilter.q;
  for(const [field,name] of [['grade','customerGrade'],['category','customerCategory'],['status','customerStatus']])customerFilter[field]=$(`[name=${name}]`)?.value??customerFilter[field];
  const q=customerFilter.q.toLowerCase();
  return state.customers.filter(c=>Object.values(c).join(' ').toLowerCase().includes(q)&&(!customerFilter.grade||c.grade===customerFilter.grade)&&(!customerFilter.category||c.category===customerFilter.category)&&(!customerFilter.status||c.status===customerFilter.status)&&(!customerFilter.regions.size||customerFilter.regions.has(c.tradeRegion)));
}
function customerRows() {
  if(!$('#customerRows'))return;
  const list=filteredCustomers();
  $('#customerRows').innerHTML=list.map(c=>`<tr data-customer-row="${e(c.id)}"><td><input type="checkbox" data-customer-select="${e(c.id)}" aria-label="选择${e(c.company||c.name)}" ${customerIds.has(c.id)?'checked':''}></td><td><a href="#" data-customer="${e(c.id)}"><b>${e(c.company||c.name)}</b></a><small>${e(c.name)} ${e(c.title)}</small><small class="customer-number">${e(c.customerNumber)}</small></td><td>${e(c.region||'未填写')}<small>${e(c.industry)}</small></td><td><span class="badge">${e(c.tradeRegion||'未填写')}</span></td><td>${e(c.email)}<small>${e(c.phone)} ${e(c.emailVerification)}</small></td><td><span class="badge grade-${e(c.grade)}">${e(c.grade)}级</span></td><td>${e(c.category)}<small>${e(c.status)}</small></td><td class="follow-cell"><button type="button" class="follow-button" data-action="followUp:${e(c.id)}" aria-label="编辑${e(c.company||c.name)}的跟进安排"><strong>${e(c.nextFollowUp?c.nextFollowUp.replace('T',' ').slice(0,16):'未安排')}</strong>${icon('pencil')}<small>${e(c.followUpNotes||'添加备注')}</small></button></td><td>${c.lastContact?date(c.lastContact):'未联系'}</td><td>${button('','editCustomer:'+c.id,'pencil','icon')}</td></tr>`).join('')||'<tr><td colspan="10">'+empty('没有符合条件的客户')+'</td></tr>';
  $('#customerFilterSummary').textContent=`匹配 ${list.length} / ${state.customers.length} 位客户`+(customerFilter.regions.size?' · 大区：'+[...customerFilter.regions].join('、'):'');icons();
}
function editFollowUp(id) {
  const c=state.customers.find(c=>c.id===id);if(!c)return;
  modal('跟进安排 · '+e(c.company||c.name),`${input('跟进时间','nextFollowUp',c.nextFollowUp?.length===10?c.nextFollowUp+'T09:00':c.nextFollowUp?.slice(0,16)||'','datetime-local')}${area('备注','followUpNotes',c.followUpNotes||'')}<p class="muted">清空时间可取消安排，备注仍会保存。</p>`,async v=>{await api('follow-up',{id,...v});await reload();if(page==='customers'&&!detailId)customerRows();else render();toast('跟进安排已保存');});
}

function renderVerify() {
  const provider=localStorage.getItem('dsb-verify-provider')||'local';
  $('#main').innerHTML=heading('邮箱验证',`${button('导入客户邮箱','verifyCustomers','users')}${button('验证全部邮箱','runVerify','shield-check','primary')}`)+`<div class="split verify-layout"><section><h2>待验证邮箱</h2>${select('验证方式','verifyProvider',[['local','本地预检（免费）'],['mailboxvalidator','MailboxValidator API']],provider)}${area('手动邮箱列表','verifyEmails',window.verifyDraft||'')}<p class="muted">本地预检检查格式、DNS、SMTP 接收状态和 Catch-all，不会发送邮件；“不确定”不代表邮箱无效。</p><div id="verifySummary" class="notice" role="status"></div></section><section class="guess-panel"><div class="section-head"><h2>邮箱规则推测</h2><small>需验证后再发送</small></div><div class="form-grid two">${input('联系人姓名','guessName',guessContact.name||'')}${input('公司域名','guessDomain',guessContact.domain||'')}</div><div class="actions wrap">${button('生成可能邮箱','generateCandidates','sparkles','primary')}${button('验证所有候选邮箱','verifyCandidates','shield-check')}${button('复制所有邮箱','copyCandidates','copy')}${button('导入到验证页','importCandidates','list-plus')}${button('打开 Mailmeteor 查询','mailmeteorFinder','external-link')}</div><div id="candidateOutput"></div></section></div><div class="table-scroll"><table><thead><tr><th>邮箱</th><th>结果</th><th>原因</th><th>客户库</th></tr></thead><tbody id="verifyResults"></tbody></table></div>`;
  paintCandidates();paintVerification();
}
function generateCandidates() {
  const name=$('[name=guessName]').value.trim(),domain=$('[name=guessDomain]').value.trim();guessedEmails=CRM.candidates(name,domain);guessContact={name,domain};paintCandidates();return guessedEmails;
}
function paintCandidates() {
  if(!$('#candidateOutput'))return;
  $('#candidateOutput').innerHTML=guessedEmails.length?`<p class="muted">${guessedEmails.length} 个候选邮箱 · 仅为规则推测</p><div class="candidate-list">${guessedEmails.map(email=>`<code>${e(email)}</code>`).join('')}</div>`:'';
}
function paintVerification(message) {
  if(page!=='verify'||!$('#verifyResults'))return;
  const existing=x=>state.customers.some(c=>CRM.email(c.email)===x.email);
  const visible=results.map((x,i)=>({x,i})).filter(({x})=>x.status!=='valid'||!existing(x));
  const automatic=results.filter(x=>x.status==='valid'&&existing(x)).length;
  $('#verifySummary').textContent=message||`已验证 ${results.length} 个 · 自动通过并保存 ${automatic} 个 · 待处理 ${visible.length} 个`;
  $('#verifyResults').innerHTML=visible.length?visible.map(({x,i})=>{const customer=state.customers.find(c=>CRM.email(c.email)===x.email);return `<tr><td>${e(x.email)}</td><td><span class="${x.status==='valid'?'success':x.status==='invalid'?'error':'muted'}">${e(x.label)}</span></td><td>${e(x.reasons?.join('，'))}</td><td>${customer?`<a href="#" data-customer="${e(customer.id)}">查看客户</a>`:x.status==='valid'?button('关联 / 新建客户','linkVerified:'+i,'user-plus'):'—'}</td></tr>`;}).join(''):'<tr><td colspan="4" class="muted">现有客户邮箱均已自动保存，没有异常结果</td></tr>';
  $$('[data-action="runVerify"],[data-action="verifyCandidates"]').forEach(b=>b.disabled=verificationBusy);icons();
}
async function runVerification(candidateOnly=false) {
  if(verificationBusy)return;
  const list=candidateOnly?generateCandidates():$('[name=verifyEmails]').value.split(/[\s,;，；]+/).filter(Boolean);
  const emails=[...new Set(list.map(CRM.email))];if(!emails.length)throw new Error('请先填入邮箱');
  window.verifyDraft=$('[name=verifyEmails]').value;const context=Object.fromEntries(guessedEmails.map(x=>[x,{...guessContact}]));
  verificationBusy=true;results=[];verificationQueue=[];let error='';
  try {
    const provider=$('[name=verifyProvider]').value;localStorage.setItem('dsb-verify-provider',provider);
    for(let i=0;i<emails.length;i+=50) {paintVerification(`正在验证 ${i+1}–${Math.min(i+50,emails.length)} / ${emails.length} …`);const r=await api('verify',{emails:emails.slice(i,i+50),provider});results.push(...r.results.map(x=>({...x,contact:context[x.email]})));paintVerification();}
  }catch(err){error=err.message;toast('验证中断：'+error);}
  finally {verificationBusy=false;await reload();paintVerification(error?`已完成 ${results.length} / ${emails.length} 个；${error}`:undefined);}
  verificationQueue=results.filter(x=>x.status==='valid'&&!state.customers.some(c=>CRM.email(c.email)===x.email)).map(x=>x.email);
  if(page==='verify'&&verificationQueue.length&&!$('#modal').open)openNextVerified();
}
function openNextVerified() {const email=verificationQueue.shift(),index=results.findIndex(x=>x.email===email);if(index>=0)linkVerified(index,true);}
function linkVerified(index,queued=false) {
  const x=results[index];if(x?.status!=='valid')return;
  const existing=state.customers.find(c=>CRM.email(c.email)===x.email);
  const domain=x.email.split('@')[1];
  const matched=existing||state.customers.find(c=>CRM.websiteKey(c.website)===domain||CRM.email(c.email).split('@')[1]===domain);
  const groups=[...new Map(state.customers.filter(c=>c.company).map(c=>[c.companyId||c.id,c])).values()];
  // Use an actual row ID as the API target; companyId groups contacts in the picker.
  const chosen=existing||groups.find(c=>(c.companyId||c.id)===(matched?.companyId||matched?.id));
  const mode=chosen?'existing':'new';
  modal('验证成功 · 写入客户库',`<p class="success">${e(x.email)} · ${e(x.label)}</p>${select('归属方式','mode',[['existing','关联到已有客户公司'],['new','新建客户']],mode)}<div id="existingCompany">${select('归属公司','customerId',[['','请选择公司'],...groups.map(c=>[c.id,c.company])],chosen?.id||'')}</div><div id="newCompany"><div class="form-grid two">${input('公司名称','company',existing?.company||'')}${input('公司官网','website',existing?.website||x.contact?.domain||'')}${input('国家','region',existing?.region||'')}${select('外贸大区','tradeRegion',[['','未填写'],...CRM.regions],existing?.tradeRegion||'')}</div></div><div class="form-grid two">${input('联系人姓名','name',existing?.name||x.contact?.name||'')}${input('电话','phone',existing?.phone||'')}</div><p class="muted">${existing?'此邮箱已存在，保存将更新此联系人及公司归属。':'将保留所选公司的其他联系人。'}${queued&&verificationQueue.length?' 还有 '+verificationQueue.length+' 条成功结果待处理。':''}</p>`,async v=>{const r=await api('link-verified',{...v,email:x.email});await reload();paintVerification();toast(`${r.updated?'已更新':'已添加'}：${r.customer.company} · ${x.email}`);if(queued&&verificationQueue.length)setTimeout(()=>{if(page==='verify')openNextVerified();},0);},queued&&verificationQueue.length?'保存并处理下一条':'保存到客户库');
  function toggle(){const isNew=$('#modal [name=mode]').value==='new';$('#newCompany').hidden=!isNew;$('#existingCompany').hidden=isNew;}
  $('#modal [name=mode]').onchange=toggle;toggle();
}

function renderDiscovery() {
  if(!discoveryBatch)discoveryBatch=state.discoveryBatches?.at(-1)||null;
  const c=discoveryBatch?.criteria||{};
  $('#main').innerHTML=heading('客户开发')+`<section><h2>AI 行业定向客户挖掘</h2><form id="discoveryForm2"><div class="form-grid">${input('目标行业','industry',c.industry||'')}${input('地区','region',c.region||'')}${input('公司类型','companyTypes',c.companyTypes||'')}${input('关键词','keywords',c.keywords||'')}${select('本次最多开发','limit',[['5','5 家'],['10','10 家'],['20','20 家']],'10')}</div><div class="actions wrap"><label class="check"><input type="checkbox" name="autoImport" checked>自动入库到「待研究」</label><button type="submit" class="primary" ${discoveryBatch?.status==='running'?'disabled':''}>${icon('sparkles')}开始 AI 开发</button></div><p class="muted">AI 检索并整理公开公司信息；每家公司最多读取 3 个公开页面。找不到的联系方式留空，重复公司不会新增。</p></form></section><section><div class="section-head"><h2>本次开发列表</h2><div class="actions">${button('全选','selectDiscovered','check-square')}${button('取消选择','clearDiscovered','square')}${button('批量导入客户库','importDiscoveryBatch','download','primary')}</div></div><div id="discoveryStatus" class="notice" role="status"></div><div id="discovered" class="table-scroll"></div><details id="discoveryWarnings"><summary>采集说明</summary><div></div></details></section><section><h2>官网公开信息采集</h2><form id="crawlForm"><div class="actions">${input('公司官网','website')}<button type="submit">${icon('scan-search')}读取官网联系方式</button></div></form><div id="crawlOutput"></div></section>`;
  $('#discoveryForm2').onsubmit=async ev=>{ev.preventDefault();const b=ev.submitter;b.disabled=true;try{const v=values(ev.target);discoverySelected.clear();discoveryBatch=await api('discovery/start',{...v,autoImport:Boolean(v.autoImport)});paintDiscovery();pollDiscovery();}catch(err){toast(err.message);b.disabled=false;}};
  $('#crawlForm').onsubmit=async ev=>{ev.preventDefault();const b=ev.submitter;b.disabled=true;try{await crawlWebsite(values(ev.target).website);}finally{b.disabled=false;}};
  paintDiscovery();if(discoveryBatch?.status==='running')pollDiscovery();
}
function paintDiscovery() {
  if(page!=='discovery'||!$('#discovered'))return;
  const b=discoveryBatch;
  $('#discoveryStatus').textContent=b?(b.phase||'')+(b.error?' · '+b.error:'')+` · 已发现 ${b.items.length} 家 / 已入库 ${b.items.filter(x=>x.customerId).length} 家`:'填写目标行业和地区开始开发';
  $('#discovered').innerHTML=b?.items.length?`<table><thead><tr><th>选择</th><th>客户编号 / 公司</th><th>官网</th><th>联系人 / 电话</th><th>邮箱</th><th>国家 / 外贸大区</th><th>入库状态</th></tr></thead><tbody>${b.items.map(c=>`<tr><td><input type="checkbox" aria-label="选择${e(c.company)}" data-discovery-item="${e(c.itemId)}" ${discoverySelected.has(c.itemId)?'checked':''}></td><td><b>${e(c.company)}</b><small>${e(c.customerNumber||'导入时自动编号')}</small></td><td><a href="${e(safeUrl(c.website))}" target="_blank" rel="noreferrer">${e(CRM.websiteKey(c.website))}</a><details><summary>公开来源</summary>${c.sources.map(s=>`<p><a href="${e(safeUrl(s.url))}" target="_blank" rel="noreferrer">${e(s.title||s.url)}</a></p>`).join('')}</details></td><td>${e(c.name||'未公开')}<small>${e(c.phone)}</small></td><td>${e(c.email||'未公开')}</td><td>${e(c.region)}<small>${e(c.tradeRegion||'未填写')}</small></td><td>${e(c.importState)}</td></tr>`).join('')}</tbody></table>`:empty(b?.status==='running'?'正在检索和提取公开资料…':'暂无开发结果');
  $('#discoveryWarnings').hidden=!b?.warnings?.length;$('#discoveryWarnings div').innerHTML=(b?.warnings||[]).map(s=>`<p>${e(s)}</p>`).join('');
  $('#discoveryForm2 button[type=submit]').disabled=b?.status==='running';$('[data-action=importDiscoveryBatch]').disabled=!b||b.status==='running'||!discoverySelected.size;icons();
}
async function pollDiscovery() {
  clearTimeout(discoveryTimer);if(!discoveryBatch)return;
  try {discoveryBatch=await api('discovery/batch?id='+discoveryBatch.id);paintDiscovery();if(discoveryBatch.status==='running')discoveryTimer=setTimeout(pollDiscovery,1800);else{await reload();toast(discoveryBatch.error||`本次开发完成，找到 ${discoveryBatch.items.length} 家公司`);}}
  catch(err){toast(err.message);discoveryTimer=setTimeout(pollDiscovery,5000);}
}
async function importDiscoveryBatch() {if(!discoveryBatch)return;const r=await api('discovery/import',{id:discoveryBatch.id,ids:[...discoverySelected]});discoveryBatch=r.batch;await reload();paintDiscovery();toast(`新导入 ${r.added} 家，已有 ${r.existing} 家`);}

async function previewPersonalizedMail() {
  const customers=state.customers.filter(c=>mailIds.has(c.id));if(!customers.length)throw new Error('请先选择客户');
  const d=$('#modal'),payload={subject:$('[name=mailSubject]').value,html:$('#mailEditor').innerHTML,text:$('#mailEditor').innerText,personalize:$('#autoPersonalize')?.checked!==false};
  d.innerHTML=`<header><h2>逐封邮件预览</h2>${button('','close','x','icon')}</header><div class="modal-body">${select('切换收件人','previewRecipient',customers.map(c=>[c.id,`${c.company||c.name} · ${c.email}`]),customers[0].id)}<p id="previewTo"></p><h3 id="previewSubject"></h3><iframe id="mailPreview" sandbox="" title="邮件预览" style="width:100%;height:380px;border:0"></iframe></div>`;d.showModal();icons();let sequence=0;
  async function show(){const current=++sequence;try{const r=await api('mail-preview',{...payload,id:$('[name=previewRecipient]').value});if(current!==sequence||!$('#mailPreview'))return;$('#previewTo').textContent=`收件人：${r.recipientName} <${r.email}>`;$('#previewSubject').textContent=r.subject;$('#mailPreview').srcdoc=r.html;}catch(err){toast(err.message);}}
  $('[name=previewRecipient]').onchange=show;await show();
}

document.addEventListener('click',async ev=>{
  const target=ev.target.closest('[data-action]');if(!target)return;const [action,id]=target.dataset.action.split(':');
  const actions={followUp:()=>editFollowUp(id),clearRegions:()=>{customerFilter.regions.clear();$$('[data-trade-filter]').forEach(x=>x.checked=false);$$('.region-count').forEach(x=>x.textContent='');customerRows();},generateCandidates,copyCandidates:async()=>{if(!guessedEmails.length)generateCandidates();await navigator.clipboard.writeText(guessedEmails.join('\n'));toast(`已复制 ${guessedEmails.length} 个邮箱`);},importCandidates:()=>{if(!guessedEmails.length)generateCandidates();const v=$('[name=verifyEmails]');v.value=[...new Set([...v.value.split(/[\s,;，；]+/).filter(Boolean),...guessedEmails])].join('\n');window.verifyDraft=v.value;toast('候选邮箱已导入到验证列表');},verifyCandidates:()=>runVerification(true),linkVerified:()=>linkVerified(Number(id)),selectDiscovered:()=>{discoveryBatch?.items.forEach(x=>discoverySelected.add(x.itemId));paintDiscovery();},clearDiscovered:()=>{discoverySelected.clear();paintDiscovery();},importDiscoveryBatch};
  if(!actions[action])return;ev.preventDefault();target.disabled=true;try{await actions[action]();}catch(err){toast(err.message);}finally{target.disabled=false;if(action==='importDiscoveryBatch')paintDiscovery();}
});
document.addEventListener('change',ev=>{const el=ev.target;if(el.dataset.tradeFilter){el.checked?customerFilter.regions.add(el.dataset.tradeFilter):customerFilter.regions.delete(el.dataset.tradeFilter);$$('[data-trade-filter]').forEach(x=>x.checked=customerFilter.regions.has(x.dataset.tradeFilter));$$('.region-count').forEach(x=>x.textContent=customerFilter.regions.size?'（'+customerFilter.regions.size+'）':'');customerRows();}if(el.dataset.discoveryItem){el.checked?discoverySelected.add(el.dataset.discoveryItem):discoverySelected.delete(el.dataset.discoveryItem);$('[data-action=importDiscoveryBatch]').disabled=discoveryBatch?.status==='running'||!discoverySelected.size;}});
document.addEventListener('input',ev=>{if(ev.target.name==='verifyEmails')window.verifyDraft=ev.target.value;});

function pickerItems(id) {
  return (id==='docCustomer'?state.customers:state.products).map(c=>({id:c.id,title:id==='docCustomer'?c.company||c.name:c.name,detail:id==='docCustomer'?[c.name,c.email,c.customerNumber].filter(Boolean).join(' · '):[c.sku,c.englishName,c.category].filter(Boolean).join(' · ')}));
}
function searchPicker(id,current='') {
  const items=pickerItems(id),chosen=items.find(x=>x.id===current),placeholder=id==='docCustomer'?'输入公司、联系人、邮箱或编号搜索客户':'输入产品名称、SKU 或分类搜索产品';
  return `<div class="search-picker" data-picker="${id}"><label>${id==='docCustomer'?'从客户库选择':'从产品库添加产品'}<input type="text" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}Options" data-picker-input="${id}" placeholder="${placeholder}" value="${e(chosen?chosen.title+' · '+chosen.detail:'')}"></label><div id="${id}Options" class="picker-options" role="listbox" hidden></div><select id="${id}" hidden aria-hidden="true" tabindex="-1"><option value=""></option>${items.map(x=>`<option value="${e(x.id)}" ${x.id===current?'selected':''}>${e(x.title)}</option>`).join('')}</select></div>`;
}
function showPicker(input,all=false) {
  const id=input.dataset.pickerInput,list=$('#'+id+'Options'),tokens=(all?'':input.value.toLowerCase().trim()).split(/\s+/).filter(Boolean);
  const matches=pickerItems(id).filter(x=>tokens.every(t=>(x.title+' '+x.detail).toLowerCase().includes(t)));
  list.innerHTML=matches.slice(0,100).map((x,i)=>`<button type="button" role="option" aria-selected="false" id="${id}Option${i}" data-picker-value="${e(x.id)}"><b>${e(x.title)}</b><small>${e(x.detail)}</small></button>`).join('')||'<p class="muted">没有匹配结果，请换个关键词</p>';
  if(matches.length>100)list.insertAdjacentHTML('beforeend',`<p class="muted">匹配 ${matches.length} 条，先显示 100 条，请输入更多关键词缩小范围。</p>`);
  list.hidden=false;input.setAttribute('aria-expanded','true');input.removeAttribute('aria-activedescendant');input.dataset.active='-1';
}
function closePickers(){ $$('.picker-options').forEach(x=>x.hidden=true);$$('[data-picker-input]').forEach(x=>{x.setAttribute('aria-expanded','false');x.removeAttribute('aria-activedescendant');}); }
function choosePicker(button) {
  const holder=button.closest('[data-picker]'),select=$('#'+holder.dataset.picker),input=holder.querySelector('input');select.value=button.dataset.pickerValue;input.value=button.textContent;closePickers();select.dispatchEvent(new Event('change',{bubbles:true}));
}
document.addEventListener('focusin',ev=>{if(ev.target.dataset.pickerInput)showPicker(ev.target,true);else if(!ev.target.closest('.search-picker'))closePickers();});
document.addEventListener('input',ev=>{if(ev.target.dataset.pickerInput)showPicker(ev.target);});
document.addEventListener('click',ev=>{const option=ev.target.closest('[data-picker-value]');if(option)choosePicker(option);else if(!ev.target.closest('.search-picker'))closePickers();});
document.addEventListener('keydown',ev=>{
  const input=ev.target;if(!input.dataset.pickerInput)return;const list=$('#'+input.dataset.pickerInput+'Options');
  if(ev.key==='Escape'){ev.preventDefault();closePickers();return;}
  if(!['ArrowDown','ArrowUp','Enter'].includes(ev.key))return;
  if(ev.key==='Enter'&&list.hidden)return;
  ev.preventDefault();if(list.hidden)showPicker(input,true);
  const options=[...list.querySelectorAll('[role=option]')];if(!options.length)return;let n=Number(input.dataset.active||-1);
  if(ev.key==='Enter'){choosePicker(options[Math.max(0,n)]);return;}
  n=(n+(ev.key==='ArrowDown'?1:-1)+options.length)%options.length;input.dataset.active=n;
  options.forEach((x,i)=>x.setAttribute('aria-selected',i===n?'true':'false'));input.setAttribute('aria-activedescendant',options[n].id);options[n].scrollIntoView({block:'nearest'});
});
async function snapshotProductImage(p) {
  const source=CRM.productImage(p);if(!source)return '';
  const img=new Image();img.src=source;try{await img.decode();}catch{throw new Error('产品图片无法读取，请重新上传图片');}
  const scale=Math.min(1,480/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');
}
document.addEventListener('change',async ev=>{if(ev.target.id==='showProductImages'){try{draft.showProductImages=ev.target.checked;if(draft.showProductImages){for(const item of draft.items){if(CRM.productImage(item))continue;const matches=state.products.filter(p=>item.productId?p.id===item.productId:item.sku?p.sku===item.sku:p.name===item.name);if(matches.length===1){item.productId=matches[0].id;item.image=await snapshotProductImage(matches[0]);}}}await previewDoc();}catch(err){toast(err.message);}}});

let mailFocus={id:'mailEditor',range:null,start:0,end:0};
function rememberMailFocus() {
  if(page!=='mail'||$('#modal')?.open)return;
  const active=document.activeElement,editor=$('#mailEditor');
  if(active?.name==='mailSubject')mailFocus={id:'mailSubject',start:active.selectionStart,end:active.selectionEnd};
  else if(editor&&(active===editor||editor.contains(active))) {
    const selection=window.getSelection();mailFocus={id:'mailEditor',range:selection?.rangeCount&&editor.contains(selection.anchorNode)?selection.getRangeAt(0).cloneRange():null};
  }
}
function restoreMailFocus() {
  if(page!=='mail'||$('#modal')?.open)return;
  const field=mailFocus.id==='mailSubject'?$('[name=mailSubject]'):$('#mailEditor');if(!field)return;
  field.focus({preventScroll:true});
  if(mailFocus.id==='mailSubject'){field.setSelectionRange(mailFocus.start||0,mailFocus.end||0);return;}
  const selection=window.getSelection();let range=mailFocus.range;
  if(!range||!field.contains(range.startContainer)||!field.contains(range.endContainer)){range=document.createRange();range.selectNodeContents(field);range.collapse(false);}
  selection.removeAllRanges();selection.addRange(range);
}
document.addEventListener('pointerdown',rememberMailFocus,true);
document.addEventListener('selectionchange',rememberMailFocus);
$('#modal').addEventListener('close',()=>requestAnimationFrame(restoreMailFocus));
window.addEventListener('focus',()=>requestAnimationFrame(restoreMailFocus));

function insertMailLink() {
  modal('插入链接',`${input('链接地址','url','','url')}${input('显示文字（可选）','label')}`,async v=>{
    let url;try{url=new URL(v.url);}catch{throw new Error('请填写完整的 http:// 或 https:// 链接');}if(!['http:','https:'].includes(url.protocol))throw new Error('只支持 http:// 或 https:// 链接');
    // Close the dialog before returning selection to the editor.
    $('#modal').close();mailFocus.id='mailEditor';restoreMailFocus();
    const selection=window.getSelection();
    if(selection&&!selection.isCollapsed&&!v.label)document.execCommand('createLink',false,url.href);
    else document.execCommand('insertHTML',false,`<a href="${e(url.href)}">${e(v.label||url.href)}</a>`);
    $('#mailEditor').dispatchEvent(new Event('input',{bubbles:true}));rememberMailFocus();
  },'插入链接');
}
function confirmMailSend() {
  const ids=[...mailIds];if(!ids.length)throw new Error('请选择客户');
  const subject=$('[name=mailSubject]').value,html=$('#mailEditor').innerHTML,text=$('#mailEditor').innerText;
  if(!subject.trim()||!text.trim()&&!$('#mailEditor img'))throw new Error('请填写邮件主题和正文');
  const payload={ids,subject,html,text,attachments:structuredClone(attachments),personalize:$('#autoPersonalize').checked,interval:$('[name=mailInterval]').value};
  modal('确认发送邮件',`<p>将向所选的 <strong>${ids.length}</strong> 位客户分别发送一封邮件。</p><p>主题：${e(subject)}</p><p>称呼：${payload.personalize?'自动识别联系人姓名或公司名称':'按正文中的变量替换'}</p><p class="muted">成功记录会自动写入客户详情的「沟通与跟进」。</p>`,async()=>{const r=await api('send',payload);jobId=r.id;pollJob();},'确认发送');
}
