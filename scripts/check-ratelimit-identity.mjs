/**
 * Which address a rate-limit bucket is keyed on.
 *
 * `x-forwarded-for` is append-only, so it arrives as
 * `"<whatever the client sent>, <what the proxy saw>"`. Reading element `[0]` —
 * which is what this file used to do — let an attacker mint a fresh bucket per
 * request: measured at 12 consecutive guesses against the password-only admin
 * gate with no lockout, and the same against the login route's per-IP bucket.
 *
 * Tested directly rather than through HTTP because the property only exists when
 * a proxy is in front. Over plain node there is no proxy to append a hop, so a
 * request with one forged header has one hop and *is* client-controlled — no
 * choice of element can save it. That is the limitation `clientIp` documents, and
 * the reason this asserts the parsing, not an end-to-end lockout.
 */
import { strict as assert } from 'node:assert';
import { clientIp } from '../src/lib/security/rate-limit.ts';

let failures = 0;
const ok = (label, fn) => {
  try {
    fn();
    console.log(`  PASS  ${label}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL  ${label} :: ${error.message}`);
  }
};

const req = (headers) => ({ headers: new Headers(headers) });

ok('a proxy-appended chain resolves to the hop the proxy added', () => {
  assert.equal(
    clientIp(req({ 'x-forwarded-for': '203.0.113.9, 198.51.100.4' })),
    '198.51.100.4',
  );
});

ok('forged leading hops do not win', () => {
  // exactly the bypass shape: a fresh fake prefix on every request
  assert.equal(
    clientIp(req({ 'x-forwarded-for': '10.0.0.1, 10.0.0.2, 203.0.113.7' })),
    '203.0.113.7',
  );
});

ok('whitespace is trimmed', () => {
  assert.equal(clientIp(req({ 'x-forwarded-for': '  203.0.113.9 ,  198.51.100.4  ' })), '198.51.100.4');
});

ok('a single hop is used as-is', () => {
  assert.equal(clientIp(req({ 'x-forwarded-for': '203.0.113.9' })), '203.0.113.9');
});

ok('x-real-ip is used when the chain is absent', () => {
  assert.equal(clientIp(req({ 'x-real-ip': '198.51.100.22' })), '198.51.100.22');
});

ok('the forwarded chain takes precedence over x-real-ip', () => {
  assert.equal(
    clientIp(req({ 'x-forwarded-for': '10.0.0.1, 203.0.113.7', 'x-real-ip': '198.51.100.22' })),
    '203.0.113.7',
  );
});

ok('an empty forwarded header falls through instead of yielding ""', () => {
  assert.equal(clientIp(req({ 'x-forwarded-for': '   ', 'x-real-ip': '198.51.100.22' })), '198.51.100.22');
});

ok('no header at all is still a usable key', () => {
  assert.equal(clientIp(req({})), 'unknown');
});

if (failures > 0) {
  console.error(`\nFAILED ${failures} rate-limit identity check(s)`);
  process.exit(1);
}

console.log('\nALL RATE-LIMIT IDENTITY CHECKS PASSED');