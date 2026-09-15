const assert = require('assert/strict');
const { verifyEmailLocally } = require('../email-precheck');

async function main() {
  assert.equal((await verifyEmailLocally('bad-format')).status, 'invalid');
  const dns = { resolveMx: async () => [{ priority: 10, exchange: 'mx.fixture' }], resolve4: async () => [] };
  const accepted = await verifyEmailLocally('person@fixture.test', { ...dns, smtpSession: async (_host, email) => email.startsWith('dsb-check-') ? { code: 550, message: 'unknown user' } : { code: 250, message: 'accepted' } });
  assert.equal(accepted.status, 'valid');
  const catchAll = await verifyEmailLocally('person@fixture.test', { ...dns, smtpSession: async () => ({ code: 250, message: 'accepted' }) });
  assert.equal(catchAll.status, 'unknown');
  assert.equal(catchAll.checks.catchAll, true);
  const temporary = await verifyEmailLocally('person@fixture.test', { ...dns, smtpSession: async () => ({ code: 451, message: 'try later' }) });
  assert.equal(temporary.status, 'unknown');
  const rejected = await verifyEmailLocally('person@fixture.test', { ...dns, smtpSession: async () => ({ code: 550, message: 'no such user' }) });
  assert.equal(rejected.status, 'invalid');
  console.log('PASS: local email syntax, DNS, SMTP, temporary failure and catch-all classification');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
