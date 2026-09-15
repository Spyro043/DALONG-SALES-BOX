(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CRM = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Keep legacy values such as “亚洲” so existing customer records remain filterable.
  // The detailed options cover the world's inhabited commercial regions.
  const regions = [
    '亚洲',
    '东亚',
    '东南亚',
    '南亚',
    '中亚',
    '中东',
    '俄罗斯及独联体',
    '欧洲',
    '北非',
    '西非',
    '东非',
    '中非',
    '南部非洲',
    '北美',
    '中美洲',
    '加勒比',
    '南美',
    '澳洲/大洋洲'
  ];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const email = value => String(value || '').trim().toLowerCase();
  const role = /^(?:info|sales|contact|hello|office|admin|support|service|enquir(?:y|ies)|inquir(?:y|ies)|marketing|export|commercial|team|mail|booking|orders?|hr|accounts?|general|reception|customerservice|noreply|no-reply)(?:[._+-].*)?$/i;
  function recipientName(c) {
    const name = String(c.name || '').trim();
    const generic = role.test(email(c.email).split('@')[0]);
    return (!generic && name && !role.test(name) && !name.includes('@') ? name : String(c.company || '').trim()) || 'Team';
  }
  function tokens(value, c, html = false) {
    const data = {name:recipientName(c), company:c.company || '', email:c.email || ''};
    return String(value || '').replace(/\{\{(姓名|公司|邮箱|name|company|email)\}\}|\{(姓名|公司|邮箱|name|company|email)\}/g, (_, a, b) => {
      const key = a || b, text = data[{姓名:'name',公司:'company',邮箱:'email'}[key] || key];
      return html ? escape(text) : text;
    });
  }
  function personalizedBody(value, c, html, automatic = true) {
    const source = String(value || ''), out = tokens(source, c, html);
    if (!automatic || /\{(?:\{)?(?:姓名|name)\}/.test(source)) return out;
    const name = html ? escape(recipientName(c)) : recipientName(c);
    // Replace the initial salutation when present; otherwise add a personal greeting.
    const greeting = /^(\s*(?:<(?:p|div|span|b|strong)[^>]*>\s*)*)(Dear|Hi|Hello)\s+[^<\n,，:：!！]{1,100}[,，:：!！]/i;
    if (greeting.test(out)) return out.replace(greeting, (_, prefix, hi) => `${prefix}${hi} ${name},`);
    return html ? `<p>Dear ${name},</p>${out}` : `Dear ${name},\n\n${out}`;
  }
  function personalize(payload, c) {
    return {subject:tokens(payload.subject, c), html:personalizedBody(payload.html,c,true,payload.personalize !== false), text:personalizedBody(payload.text,c,false,payload.personalize !== false), recipientName:recipientName(c)};
  }
  function candidates(fullName, domainInput) {
    const raw = String(domainInput || '').trim().replace(/^@/, '');
    let domain;
    try { const url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); if(url.username || url.password || url.port || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) throw Error(); domain = url.hostname.toLowerCase().replace(/^www\./,''); } catch { throw new Error('请输入有效公司域名，例如 example.com'); }
    if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new Error('请输入有效公司域名，例如 example.com');
    const normalized = String(fullName || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
    if (!normalized || /[^a-z\s.'-]/.test(normalized)) throw new Error('请填写联系人的英文姓名或拼音，以空格分隔名和姓');
    const parts = normalized.split(/\s+/).map(x=>x.replace(/[^a-z]/g,'')).filter(Boolean);
    if (!parts.length) throw new Error('请填写有效联系人姓名');
    const first = parts[0], last = parts.length > 1 ? parts.at(-1) : '', list = [first];
    if (last) { list.push(last); for (const separator of ['', '.', '_', '-']) list.push(first+separator+last,last+separator+first,first[0]+separator+last,first+separator+last[0]); if(parts.length>2)list.push(parts.join('.'),parts.join('')); }
    return [...new Set(list)].map(x => x+'@'+domain);
  }
  function websiteKey(value) { try { const u = new URL(/^https?:\/\//i.test(value) ? value : 'https://'+value); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.hostname.toLowerCase().replace(/^www\./,'') : ''; } catch { return ''; } }
  function productImage(p) { const value=p?.image||(p?.assets||[]).find(a=>/^data:image\/(png|jpeg|webp|gif);base64,[a-z\d+/=\s]+$/i.test(a.data||''))?.data||''; return /^data:image\/(png|jpeg|webp|gif);base64,[a-z\d+/=\s]+$/i.test(value)?value:''; }
  return {regions, email, recipientName, tokens, personalize, candidates, websiteKey, productImage};
});
