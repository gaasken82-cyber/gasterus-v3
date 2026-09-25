import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { escapeHtml } from '../../frontend/js/utils.js';

const root = resolve(import.meta.dirname, '..', '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');

test('escapeHtml encodes all HTML-sensitive characters and preserves zero-like values', () => {
  assert.equal(escapeHtml(`<img src=x onerror="alert('xss')">&`), '&lt;img src=x onerror=&quot;alert(&#039;xss&#039;)&quot;&gt;&amp;');
  assert.equal(escapeHtml(0), '0');
  assert.equal(escapeHtml(false), 'false');
});

test('bet history uses the shared HTML escaper', () => {
  const source = read('frontend/bet-history.html');
  assert.match(source, /import \{ formatRupiah, formatDateTime, escapeHtml \} from '\/js\/utils\.js'/);
  assert.doesNotMatch(source, /\.replace\(\/&\/g, '&'\)/);
  assert.match(source, /const esc = escapeHtml;/);
});

test('server-fed frontend renderers escape dynamic values before HTML interpolation', () => {
  const member = read('frontend/js/member.js');
  const landing = read('frontend/js/landing.js');
  const marketPlay = read('frontend/js/market-play.js');
  const transaction = read('frontend/js/transaction.js');
  const register = read('frontend/js/register.js');
  const sportsbook = read('frontend/js/sportsbook.js');
  const index = read('frontend/index.html');

  for (const [name, source] of Object.entries({ member, landing, marketPlay, transaction, register, sportsbook })) {
    assert.match(source, /escapeHtml/, `${name} must import/use escapeHtml`);
  }
  assert.match(member, /escapeHtml\(m\.name/);
  assert.match(member, /encodeURIComponent\(marketCode\)/);
  assert.match(landing, /escapeHtml\(m\.result/);
  assert.match(marketPlay, /escapeHtml\(r\.selection\)/);
  assert.match(register, /escapeHtml\(data\.image\)/);
  assert.match(transaction, /escapeHtml\(String\(m\.id\)\)/);
  assert.match(sportsbook, /escapeHtml\(String\(s\.odds\)\)/);
  assert.match(index, /escapeHtml\(result\)/);
  assert.match(index, /escapeHtml\(marketSlug\)/);
});
