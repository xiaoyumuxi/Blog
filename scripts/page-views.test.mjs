import test from 'node:test';
import assert from 'node:assert/strict';
import { goatcounterOrigin, counterURL, counterValue } from '../src/scripts/page-views.mjs';

test('missing account stays unconfigured', () => assert.equal(goatcounterOrigin(''), ''));
test('public site code expands to an origin', () => assert.equal(goatcounterOrigin(' bluehour-test '), 'https://bluehour-test.goatcounter.com'));
test('reject credentials, URLs and malformed codes', () => {
  for (const value of [null, 'https://example.com', 'token/secret', '../x', 'X Y', '-test']) assert.throws(() => goatcounterOrigin(value));
});
test('read counter uses exact path and a documented recovery cache key', () => {
  const origin = 'https://bluehour-test.goatcounter.com';
  const path = '/Blog/blog/example/';
  assert.equal(counterURL(origin, path), 'https://bluehour-test.goatcounter.com/counter/%2FBlog%2Fblog%2Fexample%2F.json');
  assert.equal(counterURL(origin, path, true), 'https://bluehour-test.goatcounter.com/counter/%2FBlog%2Fblog%2Fexample%2F.json?start=1970-01-01');
});
test('reject non-GoatCounter origins and query-string paths', () => {
  assert.throws(() => counterURL('https://example.com', '/x/'));
  assert.throws(() => counterURL('https://bluehour-test.goatcounter.com', '/x/?token=abc'));
});
test('preserve formatted provider counts and real zero', () => {
  for (const value of ['0', '2\u202f771', '1,234', '8 001']) assert.equal(counterValue({count:value}), value);
  assert.equal(counterValue({count:0}), '0');
});
test('invalid or missing data is never treated as zero', () => {
  for (const value of [{}, {count:null}, {count:-1}, {count:NaN}, {count:Infinity}, {count:'<b>999</b>'}]) assert.throws(() => counterValue(value));
});
