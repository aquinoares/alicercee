import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/20261127223000_marketing_email_permissions.sql',import.meta.url),'utf8');
test('optional marketing consent never forms part of mandatory terms',()=>{
 const block=html.slice(html.indexOf('async function alPolAceitarPrimeirosTermos(){'),html.indexOf('function renderTrafegoRegras(){'));
 assert.doesNotMatch(block,/marketing_email_consent_events|alMarketingPreference/);
 assert.match(html,/ALICERCE_POLITICAS_PRIVACIDADE_VERSAO = '2026-11-27-v2'/);
 assert.match(html,/alMarketingPreference\(true\)/);
 assert.match(html,/alMarketingPreference\(false\)/);
 assert.match(html,/alMarketingPreference\(null\)/);
 const code=html.slice(html.indexOf('function alMarketingCopy(){'),html.indexOf('function renderPoliticas(){'));
 assert.doesNotThrow(()=>new Script(code));
 assert.match(code,/auth.getUser\(\)/);
 assert.match(code,/if\(write.error\)throw write.error/);
});
test('append-only consent, private suppression and eligibility by latest choice',()=>{
 assert.match(sql,/enable row level security/g);
 assert.match(sql,/grant insert \(user_id, granted, policy_version\)/);
 assert.match(sql,/auth.uid\(\)\) = user_id/g);
 assert.match(sql,/order by user_id, id desc/);
 assert.match(sql,/where e.granted and not exists/);
 assert.match(sql,/revoke all on public.marketing_email_eligible from public, anon, authenticated/);
});
