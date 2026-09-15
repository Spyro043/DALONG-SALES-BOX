const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const CRM=require('../crm-core'),{robotsAllows,crawlPublic}=require('../public-research');
const {createCrmApi,upgrade}=require('../crm-api');
const {documentHtml,startUnused}=require('../workspace-api');
const sent=[];require('nodemailer').createTransport=()=>({close(){},sendMail:async m=>{sent.push(m);return{accepted:[m.to],messageId:'fixture'};}});
const {startServer}=require('../server');
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
async function main(){
  const guesses=CRM.candidates('Jane Smith','https://www.example.com/');assert(guesses.includes('jane.smith@example.com'));assert(guesses.includes('jsmith@example.com'));assert.equal(new Set(guesses).size,guesses.length);assert.throws(()=>CRM.candidates('张三','example.com'));assert.throws(()=>CRM.candidates('Jane Smith','example.com/path'));assert.throws(()=>CRM.candidates('Jane Smith','person@example.com'));
  assert.equal(CRM.recipientName({name:'Jane',company:'Acme',email:'INFO@example.com'}),'Acme');assert.equal(CRM.recipientName({name:'Jane',company:'Acme',email:'jane@example.com'}),'Jane');assert.equal(CRM.recipientName({company:'Acme',email:'j@example.com'}),'Acme');assert.equal(CRM.tokens('{{name}} / {公司}',{name:'Jane',email:'j@example.com',company:'ACME'}),'Jane / ACME');
  assert.equal(CRM.personalize({html:'<p>Dear Someone,</p><p>Offer</p>',text:'Hi Someone,\nOffer',subject:'For {company}'},{email:'sales@example.com',name:'Wrong',company:'A & B'}).html,'<p>Dear A &amp; B,</p><p>Offer</p>');
  const robots='User-agent: *\nDisallow: /private\nAllow: /private/public\nDisallow: /*secret$';assert(!robotsAllows(robots,'https://company.test/private/contact'));assert(robotsAllows(robots,'https://company.test/private/public'));assert(!robotsAllows(robots,'https://company.test/path/secret'));assert(robotsAllows('User-agent: OtherBot\nDisallow: /','https://company.test/'));
  const visits=[];const pages=await crawlPublic('https://company.test',async(url,allowed)=>{if(allowed)await allowed(url);visits.push(url);return {url,text:url.endsWith('robots.txt')?'User-agent: *\nDisallow: /private':`<body><a href="/contact">Contact</a><a href="/private/contact">Team</a><a href="/contact#other">About</a><a href="mailto:hello@company.test">Mail</a>Company</body>`};});assert.equal(pages.length,2);assert(!visits.some(x=>x.includes('/private')));
  const configDir=fs.mkdtempSync(path.join(os.tmpdir(),'dsb-crm-'));
  fs.writeFileSync(path.join(configDir,'workspace-data.json'),JSON.stringify({version:2,customers:[{id:'old',company:'Old Co',name:'Legacy',email:'legacy@example.com'}],products:[],documents:[],campaigns:[]}));
  const s=await startServer({port:0,configDir});
  const api=async(route,body)=>{const r=await fetch(s.url+'/api/workspace/'+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error);return d;};
  try{
    let state=await api('state');const legacy=state.customers[0];assert.match(legacy.customerNumber,/^DSB-/);assert.equal(legacy.name,'Legacy');assert.equal((await api('state')).customers[0].customerNumber,legacy.customerNumber);
    const jane=await api('save',{collection:'customers',record:{company:'Desert Co',name:'Jane Smith',email:'jane@example.com',tradeRegion:'中东'}});
    const generic=await api('save',{collection:'customers',record:{company:'Ocean & Co',email:'INFO@example.com',name:'Wrong name',tradeRegion:'东南亚'}});assert.notEqual(jane.customerNumber,generic.customerNumber);
    await assert.rejects(()=>api('save',{collection:'customers',record:{company:'Duplicate',email:' JANE@EXAMPLE.COM '}}));
    for(const tradeRegion of ['北美','南美','澳洲/大洋洲','西非','南亚']){const added=await api('save',{collection:'customers',record:{company:'Region '+tradeRegion,tradeRegion}});assert.equal(added.tradeRegion,tradeRegion);}
    await assert.rejects(()=>api('save',{collection:'customers',record:{company:'Bad Region',tradeRegion:'火星'}}));
    await api('follow-up',{id:jane.id,nextFollowUp:'2026-10-14T19:30',followUpNotes:'报价后电话跟进'});state=await api('state');assert.equal(state.customers.find(c=>c.id===jane.id).nextFollowUp,'2026-10-14T19:30');
    await api('follow-up',{id:jane.id,nextFollowUp:'',followUpNotes:'保留备注'});assert.equal((await api('state')).customers.find(c=>c.id===jane.id).followUpNotes,'保留备注');
    await assert.rejects(()=>api('link-verified',{email:'unverified@example.com',mode:'new',company:'No'}));
    await api('settings',{smtpHost:'fixture',smtpUser:'sender@example.com',smtpPassword:'fixture',signature:'<p>Best regards</p>'});
    await fetch(s.url+'/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mailboxValidatorApiKey:'fixture'})});
    const oldFetch=global.fetch;
    try{global.fetch=async(url,...args)=>String(url).startsWith('https://api.mailboxvalidator.com/')?new Response(JSON.stringify({email_address:new URL(url).searchParams.get('email'),status:'True',is_verified:'True',mailboxvalidator_score:.99,is_role:'False'})):oldFetch(url,...args);
      const verified=await api('verify',{emails:['new.person@example.com','bad-format']});assert.equal(verified.results[0].status,'valid');assert.equal(verified.results[1].status,'invalid');
    }finally{global.fetch=oldFetch;}
    const linked=await api('link-verified',{mode:'existing',customerId:jane.id,email:'new.person@example.com',name:'New Person',phone:'+971 555 12345'});assert.equal(linked.customer.companyId,jane.companyId);assert.equal(linked.customer.company,'Desert Co');assert.notEqual(linked.customer.id,jane.id);
    await api('link-verified',{mode:'existing',customerId:jane.id,email:'new.person@example.com',name:'Updated Person'});state=await api('state');assert.equal(state.customers.filter(c=>c.email==='new.person@example.com').length,1);assert.equal(state.customers.find(c=>c.id===jane.id).name,'Jane Smith');
    const moved=await api('link-verified',{mode:'new',company:'Separate Co',email:'new.person@example.com',name:'Updated Person',tradeRegion:'欧洲'});assert.equal(moved.customer.companyId,moved.customer.id);
    const payload={subject:'To {公司}',html:'<p>Dear Someone,</p><p>Hello from us.</p>',text:'Dear Someone,\nHello from us.',ids:[jane.id,generic.id],interval:1};
    const preview=await api('mail-preview',{...payload,id:generic.id});assert(preview.html.includes('Dear Ocean &amp; Co,'));assert(!preview.html.includes('Wrong name'));
    const job=await api('send',payload);let status;for(let i=0;i<60;i++){status=await api('job?id='+job.id);if(status.status!=='running')break;await new Promise(r=>setTimeout(r,100));}assert.equal(status.status,'complete');assert.equal(sent.length,2);assert(sent.find(x=>x.to===jane.email).html.includes('Dear Jane Smith,'));assert.equal(sent.find(x=>x.to===generic.email).html,preview.html);assert(sent.every(x=>typeof x.to==='string'&&!x.cc&&!x.bcc));
    const afterSend=(await api('state')).customers.find(c=>c.id===jane.id),communication=afterSend.communications.at(-1);assert.equal(communication.recipientEmail,jane.email);assert.equal(communication.channel,'邮件');assert(communication.at&&Number.isFinite(Date.parse(communication.at)));assert.equal(communication.subject,'To Desert Co');
    const doc=await api('save',{collection:'documents',record:{type:'QT',number:'IMG-TEST',items:[{name:'Product',quantity:2,price:3,image:PNG}],showProductImages:true,language:'en'}});
    assert(documentHtml(doc).includes('<img src="'+PNG));assert(!documentHtml({...doc,showProductImages:false}).includes(PNG));
    const Excel=require('exceljs'),wb=new Excel.Workbook();const xlsx=await fetch(s.url+'/api/workspace/document?id='+doc.id+'&format=xlsx');await wb.xlsx.load(Buffer.from(await xlsx.arrayBuffer()));assert.equal(wb.worksheets[0].getImages().length,1);assert(!wb.worksheets[0].getRow(8).values.some(x=>typeof x==='string'&&x.startsWith('data:')));
    for(const name of ['crm-core.js','crm-ui.js'])assert.equal((await fetch(s.url+'/'+name)).status,200);
  }finally{await new Promise(r=>s.server.close(r));}
  // Full discovery workflow with controlled AI/search/public-web fixtures.
  let db={customers:[],discoveryBatches:[]};let calls=0;
  const route=createCrmApi({database:()=>structuredClone(db),persist:x=>{db=structuredClone(x);},loadSettings:()=>({aiApiKey:'fixture'}),searchWeb:async()=>[{url:'https://official.fixture/',title:'Fixture Company',snippet:'Industrial equipment in UAE'}],crawl:async()=>[{url:'https://official.fixture/contact',title:'Fixture Company',text:'Fixture Company Jane Smith jane@official.fixture +971 55512345 UAE industrial equipment'}],ai:async()=>{calls++;return calls%3===1?{queries:['industrial UAE official']} : calls%3===2?{companies:[{company:'Fixture Company',website:'https://official.fixture/'},{company:'Invented',website:'https://invented.invalid/'}]}:{matches:true,company:'Fixture Company',name:'Invented Person',email:'invented@official.fixture',phone:'999123456789',region:'UAE',tradeRegion:'中东',industry:'Industrial equipment'};}});
  const call=(r,b={},method='POST')=>route(r,b,new URL('http://localhost'+r+(b.id?'?id='+b.id:'')),{method});
  const batch=await call('/discovery/start',{industry:'Industrial',region:'UAE',autoImport:true});let done;for(let i=0;i<100;i++){done=await call('/discovery/batch',{id:batch.id},'GET');if(done.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(done.status,'complete');assert.equal(done.items.length,1);assert.equal(db.customers.length,1);assert.equal(db.customers[0].status,'待研究');assert.equal(db.customers[0].name,'');assert.equal(db.customers[0].email,'');assert.equal(db.customers[0].phone,'');assert.match(db.customers[0].customerNumber,/^DSB-/);
  const repeated=await call('/discovery/import',{id:batch.id,ids:[done.items[0].itemId]});assert.equal(repeated.added,0);assert.equal(db.customers.length,1);
  const manual=await call('/discovery/start',{industry:'Industrial',region:'UAE',autoImport:false});for(let i=0;i<100;i++){done=await call('/discovery/batch',{id:manual.id},'GET');if(done.status!=='running')break;await new Promise(r=>setTimeout(r,10));}assert.equal(done.items[0].customerId,undefined);assert.equal(db.customers.length,1);const imported=await call('/discovery/import',{id:manual.id,ids:[done.items[0].itemId]});assert.equal(imported.existing,1);
  console.log('PASS: guesses, role inbox personalization, robots restrictions, migration IDs, minute follow-up, region validation, server-verified company association, dedupe, isolated SMTP messages / matching preview, quote image toggle / XLSX media, AI discovery / evidence-only contacts / automatic and manual imports');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
