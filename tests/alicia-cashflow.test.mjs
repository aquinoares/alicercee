import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const script = readFileSync(new URL("../assets/alicia-cashflow.js", import.meta.url),"utf8");
const app = readFileSync(new URL("../index.html", import.meta.url),"utf8");
const context = { console, Intl, Set, Date };
context.window = context;
vm.runInNewContext(script,context,{filename:"alicia-cashflow.js"});
const api = context.AlicerceCashflow;
const store = () => ({
  movements: [
    {id:"1",tipo:"despesa",descricao:"Lanche",valor:20,data:"2026-11-23",status:"pago"},
    {id:"2",tipo:"transferencia",direction:"saida",descricao:"Ajuda financeira para esposa",valor:50,data:"2026-11-23",status:"pago"},
    {id:"3",tipo:"transferencia",direction:"saida",descricao:"Conta própria",valor:100,data:"2026-11-23",status:"pago"},
    {id:"4",tipo:"despesa",descricao:"Aluguel",valor:700,data:"2026-11-30",status:"pendente"},
    {id:"5",tipo:"despesa",descricao:"Compras antigas",valor:40,data:"2026-10-21",status:"pago"},
    {id:"6",tipo:"despesa",descricao:"Reembolso",valor:5,data:"2026-11-22",status:"pago",analysis:{financialRole:"refund"}}
  ],
  installments:[
    {id:"7",tipo:"cartao",descricao:"Compra parcelada",valor:80,data:"2026-12-03",status:"pendente"},
    {id:"8",tipo:"pagar",descricao:"Empréstimo",valor:120,data:"2026-11-10",status:"pendente"},
    {id:"9",tipo:"cartao",descricao:"Fatura quitada",valor:90,data:"2026-11-17",status:"pago"}
  ],
  commitments: [
    {id:"10",tipo:"compromisso",naturezaFinanceira:"divida",descricao:"Energia",valor:70,data:"2026-11-28",status:"pendente"},
    {id:"11",tipo:"lembrete",descricao:"Aniversário",valor:400,data:"2026-11-28",status:"pendente"},
    {id:"12",tipo:"compromisso",naturezaFinanceira:"divida",descricao:"Pago",valor:30,data:"2026-11-12",status:"concluido",paymentStatus:"pago"}
  ],
  loans:[],
  getMotorFinanceiro:()=>({aReceber:150})
});
test("Alicia separa dinheiro gasto, dívidas futuras e valores a receber",()=>{
 const s=api.summarize(store(),"2026-11-23");
 assert.equal(s.definitivePaid,70);
 assert.equal(s.transferUnconfirmed,100);
 assert.equal(s.pendingTotal,970);
 assert.equal(s.overdue,120);
 assert.equal(s.receivable,150);
 assert.equal(s.paidCount,2);
 assert.equal(s.pendingCount,4);
});
test("não duplica parcelas ligadas a compromissos nem altera registros",()=>{
 const st=store();
 st.movements.push({id:"13",tipo:"despesa",valor:70,status:"pendente",commitmentId:"10",data:"2026-11-28"});
 const before=JSON.stringify({movements:st.movements,installments:st.installments,commitments:st.commitments});
 assert.equal(api.summarize(st,"2026-11-23").pendingTotal,970);
 assert.equal(JSON.stringify({movements:st.movements,installments:st.installments,commitments:st.commitments}),before);
});
test("compromisso quitado por movimento vinculado não permanece como dívida",()=>{
 const st=store();
 st.movements.push({id:"14",tipo:"despesa",valor:70,status:"pago",commitmentId:"10",data:"2026-11-23"});
 assert.equal(api.summarize(st,"2026-11-23").pendingTotal,900);
});
test("sem lançamentos responde zero, não inventa movimentações",()=>{
 const s=api.summarize({movements:[],installments:[],commitments:[],loans:[]},"2026-11-23");
 assert.equal(s.pendingTotal,0);
 assert.equal(s.definitivePaid,0);
 assert.equal(s.receivable,0);
});
test("respostas contextualizadas e cartões disponíveis na Visão Financeira",()=>{
 assert.equal(api.matches("Quanto já gastei, dinheiro que não volta, e o que vou pagar?"),true);
 assert.equal(api.matches("Quanto tenho de dívidas para pagar?"),true);
 assert.equal(api.matches("Oi Alicia"),false);
 assert.match(api.answer(store(),"2026-11-23"),/Contas, dívidas e parcelas pendentes/);
 assert.match(api.renderCards(store(),"2026-11-23"),/Caixa e pendências/);
 assert.match(app,/AlicerceCashflow\.renderCards\(Store,Clock\.today\(\)\)/);
 assert.match(app,/assets\/alicia-cashflow\.js/);
});
