const dns = require('dns').promises;
const net = require('net');
const crypto = require('crypto');

const EMAIL_RE = /^[^\s@<>;,]+@([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const ACCEPTED = new Set([250, 251, 252]);

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(timer));
}

async function resolveMailHosts(domain, deps = {}) {
  const resolveMx = deps.resolveMx || dns.resolveMx.bind(dns);
  const resolve4 = deps.resolve4 || dns.resolve4.bind(dns);
  try {
    const mx = await withTimeout(resolveMx(domain), 8000, 'MX 查询超时');
    if (mx.length) return { hosts: mx.sort((a, b) => a.priority - b.priority).map(x => x.exchange), mx: true };
  } catch (error) {
    if (!['ENODATA', 'ENOTFOUND'].includes(error.code)) throw error;
  }
  try {
    const addresses = await withTimeout(resolve4(domain), 8000, 'A 记录查询超时');
    return { hosts: addresses.length ? [domain] : [], mx: false };
  } catch (error) {
    if (['ENODATA', 'ENOTFOUND'].includes(error.code)) return { hosts: [], mx: false };
    throw error;
  }
}

function smtpSession(host, recipient, options = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: 25 });
    const timeout = options.timeout || 10000;
    let buffer = '', settled = false, currentResolve;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      error ? reject(error) : resolve(value);
    };
    socket.setTimeout(timeout, () => finish(new Error('SMTP 连接超时')));
    socket.on('error', error => finish(error));
    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/); buffer = lines.pop();
      for (const line of lines) {
        const match = line.match(/^(\d{3})([ -])(.*)$/);
        if (!match || match[2] === '-') continue;
        const reply = { code: Number(match[1]), message: match[3] };
        if (currentResolve) { const done = currentResolve; currentResolve = null; done(reply); }
      }
    });
    const response = () => new Promise(res => { currentResolve = res; });
    const command = async text => {
      const pending = response();
      socket.write(text + '\r\n');
      return withTimeout(pending, timeout, 'SMTP 响应超时');
    };
    socket.once('connect', async () => {
      try {
        let reply = await withTimeout(response(), timeout, 'SMTP 欢迎响应超时');
        if (reply.code !== 220) throw new Error(`SMTP 拒绝连接 (${reply.code})`);
        reply = await command('EHLO dragon-sales-box.local');
        if (reply.code !== 250) reply = await command('HELO dragon-sales-box.local');
        if (reply.code !== 250) throw new Error(`SMTP 握手失败 (${reply.code})`);
        reply = await command('MAIL FROM:<>');
        if (!ACCEPTED.has(reply.code)) throw new Error(`SMTP 不接受验证会话 (${reply.code})`);
        const target = await command(`RCPT TO:<${recipient}>`);
        await command('RSET').catch(() => null);
        socket.write('QUIT\r\n');
        finish(null, target);
      } catch (error) { finish(error); }
    });
  });
}

async function probeRecipient(hosts, email, deps = {}) {
  const session = deps.smtpSession || smtpSession;
  const errors = [];
  for (const host of hosts.slice(0, 3)) {
    try { return { host, reply: await session(host, email) }; }
    catch (error) { errors.push(`${host}: ${error.message}`); }
  }
  throw new Error(errors.join('；') || '无法连接邮件服务器');
}

async function verifyEmailLocally(value, deps = {}) {
  const email = String(value || '').trim().toLowerCase();
  const checkedAt = new Date().toISOString();
  if (!EMAIL_RE.test(email) || email.length > 254 || email.split('@')[0].length > 64) {
    return { email, status: 'invalid', label: '格式无效', reasons: ['邮箱格式不符合常用规范'], checkedAt, checks: { syntax: false } };
  }
  const domain = email.split('@')[1];
  let mail;
  try { mail = await resolveMailHosts(domain, deps); }
  catch (error) {
    return { email, status: 'unknown', label: 'DNS 不确定', reasons: [`DNS 查询失败：${error.message}`], checkedAt, checks: { syntax: true, dns: null } };
  }
  if (!mail.hosts.length) {
    return { email, status: 'invalid', label: '域名不可收信', reasons: ['域名没有 MX 或可用 A 记录'], checkedAt, checks: { syntax: true, dns: false } };
  }
  const dnsReason = mail.mx ? `发现 ${mail.hosts.length} 个 MX 邮件服务器` : '没有 MX，使用域名 A 记录继续预检';
  if (!deps.smtp) {
    return { email, status: 'unknown', label: 'MX 正常', reasons: [dnsReason, '安全本地预检未连接收件服务器；邮箱是否存在需使用验证 API'], checkedAt, checks: { syntax: true, dns: true, smtp: null } };
  }
  let target;
  try { target = await probeRecipient(mail.hosts, email, deps); }
  catch (error) {
    return { email, status: 'unknown', label: 'SMTP 不确定', reasons: [dnsReason, `无法完成 SMTP 探测：${error.message}`], checkedAt, checks: { syntax: true, dns: true, smtp: null } };
  }
  const code = target.reply.code;
  if (!ACCEPTED.has(code)) {
    const restricted = /spamhaus|blocked|service unavailable|too many|rate limit|spam filter|access denied|try again|temporar/i.test(target.reply.message);
    const permanent = code >= 500 && code < 600 && !restricted;
    return { email, status: permanent ? 'invalid' : 'unknown', label: permanent ? '服务器拒收' : restricted ? '验证受限' : '临时不确定', reasons: [dnsReason, `收件服务器返回 ${code} ${target.reply.message}`], checkedAt, checks: { syntax: true, dns: true, smtp: restricted ? null : false, code } };
  }
  const random = `dsb-check-${crypto.randomBytes(10).toString('hex')}@${domain}`;
  try {
    const catchAll = await probeRecipient(mail.hosts, random, deps);
    if (ACCEPTED.has(catchAll.reply.code)) {
      return { email, status: 'unknown', label: 'Catch-all 不确定', reasons: [dnsReason, `服务器接受目标地址 (${code})，但也接受随机地址，无法证明该邮箱真实存在`], checkedAt, checks: { syntax: true, dns: true, smtp: true, catchAll: true, code } };
    }
  } catch (_) {
    // A failed second session does not invalidate the successful target probe.
  }
  return { email, status: 'valid', label: '服务器可接收', reasons: [dnsReason, `服务器接受目标地址 (${code})`, '随机地址未被接受，未发现 Catch-all'], checkedAt, checks: { syntax: true, dns: true, smtp: true, catchAll: false, code } };
}

module.exports = { verifyEmailLocally, resolveMailHosts, smtpSession, EMAIL_RE };
