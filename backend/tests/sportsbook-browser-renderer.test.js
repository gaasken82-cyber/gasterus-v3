import assert from 'node:assert/strict';
import test from 'node:test';
import { renderSportsbookPage } from '../src/sportsbook-browser-renderer.js';

test('browser renderer captures client-hydrated odds DOM', { timeout: 40000 }, async () => {
  const fixtureHtml = `<!doctype html><html><body><div id="catalog">Sepak Bola</div><div id="app"></div><script>
    setTimeout(() => {
      document.getElementById('app').innerHTML = '<a id="bu:od:go:ev:12345" class="IconMarkets">7</a><a class="OddsTabL"><span class="OddsR">1.95</span></a>';
    }, 120);
  </script></body></html>`;
  const result = await renderSportsbookPage('about:blank#sbototo-browser-fixture', {
    executable: process.env.SPORTS_SOURCE_BROWSER_EXECUTABLE || '',
    timeoutMs: 12000,
    settleMs: 5000,
    cacheSeconds: 1,
    maxBytes: 2 * 1024 * 1024,
    fixtureHtml
  });
  assert.match(result.html, /bu:od:go:ev:12345/);
  assert.match(result.html, /OddsTabL/);
  assert.equal(result.markerReady, true);
  assert.equal(result.renderer, 'CHROMIUM_CDP');
});

test('browser renderer safely restarts after previous Chromium DevTools port becomes stale', { timeout: 60000 }, async () => {
  const fixtureHtml = `<!doctype html><html><body><div id="app"><a id="bu:od:go:ev:67890" class="IconMarkets">3</a><a class="OddsTabR"><span class="OddsR">2.05</span></a></div></body></html>`;

  const first = await renderSportsbookPage('about:blank#sbototo-browser-restart-a', {
    executable: process.env.SPORTS_SOURCE_BROWSER_EXECUTABLE || '',
    timeoutMs: 12000,
    settleMs: 1500,
    cacheSeconds: 1,
    maxBytes: 2 * 1024 * 1024,
    fixtureHtml
  });
  assert.equal(first.markerReady, true);

  const second = await renderSportsbookPage('about:blank#sbototo-browser-restart-b', {
    executable: process.env.SPORTS_SOURCE_BROWSER_EXECUTABLE || '',
    timeoutMs: 12000,
    settleMs: 1500,
    cacheSeconds: 1,
    maxBytes: 2 * 1024 * 1024,
    fixtureHtml
  });
  assert.match(second.html, /bu:od:go:ev:67890/);
  assert.equal(second.markerReady, true);
  assert.equal(second.renderer, 'CHROMIUM_CDP');
});
