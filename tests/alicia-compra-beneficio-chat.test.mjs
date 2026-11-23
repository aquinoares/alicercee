import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const script=readFileSync(new URL("../assets/alicia-compra-beneficio-chat.js",import.meta.url),"utf8");
const wallets=readFileSync(new URL("../assets/alicerce-beneficios.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const env={Date,Math,Set,Intl};env.window=env;
vm.runInNewContext(wallets,env,{filename:"alicerce-beneficios.js"});
vm.runInNewContext(script,env,{filename:"alicia-compra-beneficio-chat.js"});
const A=env.AlicerceCompraBeneficioChat,B=env.AlicerceBeneficios;
function store(){
 let n=0;
 return {userId:"u1",settings:{},movements:[],cards:[],loans:[],installments:[],
   _uid(){return "id-"+(++n);},save(){this.saves=(this.saves||0)+1;},
   getMotorFinanceiro(){return {disponivel:900};}};
}
function setup(){
 const s=store(),p=B.addWallet(s,"pluxee",true).wallet,l=B.addWallet(s,"solides",true).wallet;
 B.addEntry(s,p.id,"credit","400","2026-11-23","Recarga");
 B.addEntry(s,l.id,"credit","200","2026-11-23","Recarga");
 return {s,p,l};
}
test("identifica compra Sodexo e não confunde com consulta de saldo",()=>{
 assert.equal(A.isPurchaseIntent("Alicia, comprei R$ 85 no supermercado com Sodexo"),true);
 assert.equal(A.isPurchaseIntent("Registra uma compra no cartão Sólides"),true);
 assert.equal(A.isPurchaseIntent("Quanto gastei no Sodexo?"),false);
 assert.equal(A.isPurchaseIntent("Mostre gráfico do Sodexo"),false);
 assert.equal(A.isPurchaseIntent("Comprei um lanche em dinheiro"),false);
 assert.equal(A.amountFrom("comprei R$ 85,50 no mercado"),85.5);
 assert.equal(A.amountFrom("gastei 35 reais com Sodexo"),35);
 assert.equal(A.amountFrom("comprei 40 no mercado com Sodexo"),40);
 assert.equal(A.descriptionFrom("comprei um lanche de 20 reais com Sodexo"),"lanche");
});
test("confirmação é obrigatória, não basta responder sim",()=>{
 assert.equal(A.isConfirm("sim"),false);
 assert.equal(A.isConfirm("confirmar compra"),true);
 assert.equal(A.isCancel("cancelar compra"),true);
 const {s,p}=setup();
 const {draft,state}=A.parse("Alicia, comprei R$ 85 no supermercado com Sodexo",s,"2026-11-23");
 assert.equal(state.ready,true);
 assert.equal(B.balance(p),400);
 assert.equal(p.entries.length,1);
 assert.match(A.renderDraft(draft,s),/Confirmar compra/);
 const outcome=A.confirm(s,draft);
 assert.equal(outcome.ok,true);
 assert.equal(B.balance(p),315);
 assert.equal(s.movements.length,0);
 assert.equal(s.cards.length,0);
 assert.equal(s.getMotorFinanceiro().disponivel,900);
 assert.equal(p.entries[1].origin,"alicia-chat");
 assert.equal(A.confirm(s,draft).ok,false);
 assert.equal(B.balance(p),315);
});
test("pede o valor e a descrição que faltarem, mas nunca salva até confirmar",()=>{
 const {s,p}=setup();
 const prepared=A.parse("Alicia, registra uma compra no Sodexo",s,"2026-11-23");
 assert.equal(prepared.state.ready,false);
 assert.match(prepared.state.reply,/valor/);
 let st=A.applyFollowup(prepared.draft,"R$ 20,00",s);
 assert.equal(st.ready,false);
 assert.match(st.reply,/comprou/);
 st=A.applyFollowup(prepared.draft,"Pão e leite",s);
 assert.equal(st.ready,true);
 assert.equal(prepared.draft.description,"Pão e leite");
 assert.equal(B.balance(p),400);
 assert.equal(prepared.draft.amount,20);
});
test("quando há dois cartões e nenhum selecionado, pede o cartão",()=>{
 const {s,p,l}=setup();
 const prepared=A.parse("Paguei R$ 60 com vale-alimentação no mercado",s,"2026-11-23");
 assert.equal(prepared.state.ready,false);
 assert.match(prepared.state.reply,/Sodexo/);
 const response=A.applyFollowup(prepared.draft,"Sólides",s);
 assert.equal(response.ready,true);
 assert.equal(prepared.draft.walletId,l.id);
 const outcome=A.confirm(s,prepared.draft);
 assert.equal(outcome.ok,true);
 assert.equal(B.balance(p),400);
 assert.equal(B.balance(l),140);
});
test("não debita se não há recarga, não há carteira ou não há login",()=>{
 const {s,p}=setup();
 const prepared=A.parse("comprei 900 reais no mercado com Sodexo",s,"2026-11-23");
 assert.equal(prepared.state.terminal,true);
 assert.equal(B.balance(p),400);
 const empty=store();
 const missing=A.parse("comprei 30 reais no mercado com Sodexo",empty,"2026-11-23");
 assert.equal(missing.state.terminal,true);
 assert.equal(empty.movements.length,0);
 const signedOut=store();signedOut.userId=null;
 const unauthorized=A.parse("comprei 30 reais no mercado com Sodexo",signedOut,"2026-11-23");
 assert.equal(unauthorized.state.ready,false);
});
test("renderiza campos como texto escapado e não executa HTML informado pelo usuário",()=>{
 const {s}=setup();
 const prepared=A.parse("comprei R$ 10 no supermercado com Sodexo",s,"2026-11-23");
 prepared.draft.description='<img src=x onerror=alert(1)>';
 const output=A.renderDraft(prepared.draft,s);
 assert.equal(output.includes("<img src=x"),false);
 assert.match(output,/&lt;img/);
});
test("conversa conectada ao formulário e confirmação do usuário",()=>{
 assert.match(html,/AlicerceCompraBeneficioChat\.renderDraft/);
 assert.match(html,/AlicerceIA\.confirmarCompraBeneficio/);
 assert.match(html,/AlicerceIA\.cancelarCompraBeneficio/);
 assert.match(html,/this\._pendingBenefitPurchase=null/);
 assert.match(html,/assets\/alicia-compra-beneficio-chat\.js/);
});
