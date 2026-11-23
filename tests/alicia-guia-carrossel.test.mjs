import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../assets/alicia-guia-carrossel.js',import.meta.url),'utf8');
const page=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const scope={};scope.window=scope;
vm.runInNewContext(script,scope,{filename:'alicia-guia-carrossel.js'});
const guide=scope.AlicerceGuiaAlicia;
function store(withExpenses=false){return {userId:'u-test',movements:withExpenses?[{id:'one'}]:[],settings:{},cards:[]};}
test('Alicia creates functional and relevant cards for the existing home carousel',()=>{
 const cards=guide.cards(store());
 assert.ok(cards.length>=8);
 assert.equal(cards[0].guide,true);
 assert.ok(cards.some(c=>c.go==="go('assistente')"));
 assert.ok(cards.some(c=>c.go==="go('beneficios')"));
 assert.ok(cards.some(c=>c.go==="go('addGasto')"));
 assert.ok(cards.every(c=>c.title&&c.text&&c.lbl&&c.guide));
});
test('The guide includes real benefit, correction, calendar and finance features',()=>{
 const text=guide.cards(store(true)).map(x=>x.text).join(' ');
 assert.match(text,/vale-alimentação/);
 assert.match(text,/recarga/);
 assert.match(text,/compromissos/);
 assert.match(text,/gráficos/);
 assert.match(text,/confirma/);
});
test('Buttons use a finite list of already-supported routes only',()=>{
 const allowed=new Set(['assistente','addGasto','beneficios','cartoes','calendario','visao','atualizacoes']);
 for(const c of guide.cards(store())){
  const match=c.go.match(/^go\('([a-zA-Z]+)'\)$/);
  assert.ok(match,c.go);
  assert.ok(allowed.has(match[1]),match[1]);
 }
});
test('No tour on anonymous or unauthenticated initial page',()=>{
 assert.equal(guide.cards({userId:null,movements:[]}).length,0);
 assert.equal(guide.cards(null).length,0);
});
test('Feature catalogue is wired to the existing slider below the menu',()=>{
 assert.match(page,/src="\/assets\/alicia-guia-carrossel.js"/);
 assert.match(page,/window\.AlicerceGuiaAlicia\.cards\(Store\)/);
 assert.match(page,/alicia-guide-card/);
 assert.match(page,/dynamic-card-track/);
 assert.match(page,/startDynamicRotation\(count\)/);
});
