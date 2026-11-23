/* Alicia: resumo de caixa e obrigações existentes, somente leitura.
 * NUNCA cria registros, altera status ou interpreta uma transferência desconhecida como gasto.
 */
(function (root) {
  "use strict";
  function valid(v){var n=Number(v);return Number.isFinite(n)&&n>0?n:0;}
  function paid(r){return !!r && (r.status==="pago"||r.status==="recebido"||r.paymentStatus==="pago"||r.status==="concluido");}
  function date(r){return String(r && (r.dataVencimento||r.vencimentoOriginal||r.data)||"").slice(0,10);}
  function name(r){return String(r&&(r.descricao||r.description||r.local||r.estabelecimento||r.pessoa)||"Conta sem descrição");}
  function money(v){return (Number(v)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});}
  function normalize(v){return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
  function definitiveTransfer(m){
    var role=String(m&&m.analysis&&m.analysis.financialRole||"");
    var purpose=normalize([m&&m.purpose,m&&m.descricao,m&&m.naturezaFinanceira].join(" "));
    return role==="gift"||/\b(presente|doacao|doei|ajuda financeira|dei de presente|sem devolucao)\b/.test(purpose);
  }
  function excludedExpense(m){
    var role=String(m&&m.analysis&&m.analysis.financialRole||"");
    return ["transfer","investment_contribution","investment_income","refund","adjustment"].includes(role);
  }
  function summarize(store,today){
    var current=String(today||new Date().toISOString().slice(0,10)).slice(0,10);
    var month=current.slice(0,7);
    var rows={paid:[],upcoming:[],unclear:[]};
    var seen=new Set();
    var loans={};
    (store.loans||[]).forEach(function(l){if(l&&l.id)loans[String(l.id)]=l;});
    function addPending(key,record,source){
      if(!record||paid(record)||valid(record.valor)===0||seen.has(key))return;
      seen.add(key);
      rows.upcoming.push({key:key,source:source,description:name(record),amount:valid(record.valor),due:date(record)});
    }
    (store.movements||[]).forEach(function(m){
      if(!m||valid(m.valor)===0)return;
      var amount=valid(m.valor);
      var when=String(m.data||"").slice(0,7);
      var isOut=m.tipo==="despesa"||(m.tipo==="transferencia"&&m.direction==="saida");
      if(!isOut)return;
      if(paid(m)){
        if(when!==month)return;
        // Repayment of a loan or movement between owned accounts is not consumed cash.
        if(m.loanId&&loans[String(m.loanId)]&&loans[String(m.loanId)].tipo==="emprestei")return;
        if(m.tipo==="despesa"&&!excludedExpense(m)){
          rows.paid.push({description:name(m),amount:amount,date:String(m.data||""),source:"expense"});
        }else if(m.tipo==="transferencia"){
          if(definitiveTransfer(m))rows.paid.push({description:name(m),amount:amount,date:String(m.data||""),source:"gift"});
          else rows.unclear.push({description:name(m),amount:amount,date:String(m.data||""),source:"transfer"});
        }
      }else if(m.tipo==="despesa"&&!m.installmentId&&!m.commitmentId&&!m.insuranceId){
        addPending("movement:"+String(m.id||rows.upcoming.length),m,"movement");
      }
    });
    (store.installments||[]).forEach(function(i){
      if(!i||!["pagar","financiamento","consorcio","cartao"].includes(String(i.tipo||"")))return;
      // A parcela do cartão ainda é obrigação do titular, mesmo quando emprestou o cartão.
      addPending("installment:"+String(i.id||rows.upcoming.length),i,"installment");
    });
    (store.commitments||[]).forEach(function(c){
      if(!c||c.tipo==="lembrete"||c.personId)return;
      var financial=c.naturezaFinanceira==="divida"||c.tipo==="conta"||c.paymentStatus==="pendente"&&valid(c.valor)>0;
      if(!financial)return;
      if((store.movements||[]).some(function(m){return m&&String(m.commitmentId||"")===String(c.id||"")&&m.commitmentId;}))return;
      addPending("commitment:"+String(c.id||rows.upcoming.length),c,"commitment");
    });
    // Only recorded actual settlements affect past spending. Card purchases remain future
    // obligations until paid, so they are not counted again as money already spent.
    rows.upcoming.sort(function(a,b){return (a.due||"9999").localeCompare(b.due||"9999");});
    var out=function(list){return Math.round(list.reduce(function(sum,r){return sum+r.amount;},0)*100)/100;};
    var future=rows.upcoming.filter(function(r){return r.due&&r.due>=current;});
    var late=rows.upcoming.filter(function(r){return r.due&&r.due<current;});
    var noDate=rows.upcoming.filter(function(r){return !r.due;});
    var motor={};
    try{if(typeof store.getMotorFinanceiro==="function")motor=store.getMotorFinanceiro()||{};}catch(ignore){}
    return {
      period:month,asOf:current,
      definitivePaid:out(rows.paid),
      transferUnconfirmed:out(rows.unclear),
      pendingTotal:out(rows.upcoming),
      dueFuture:out(future),
      overdue:out(late),
      noDueDate:out(noDate),
      receivable:valid(motor.aReceber),
      paidCount:rows.paid.length,pendingCount:rows.upcoming.length,
      pending:rows.upcoming.slice(0,4),
      hasUnknownTransfers:rows.unclear.length>0,
      dataSource:"lançamentos registrados na conta",
    };
  }
  function matches(q){
    q=normalize(q);
    var cash=/\b(gastei|gastou|gastos|dinheiro que nao volta|dinheiro que saiu|ja saiu|saida definitiva|despesa paga|despesas pagas|ja paguei)\b/.test(q);
    var debts=/\b(dividas|divida|a pagar|vou pagar|tenho que pagar|contas pendentes|conta pendente|quanto devo|compromissos financeiros|vencimentos)\b/.test(q);
    var overview=/\b(resumo financeiro|visao do dinheiro|panorama financeiro|situacao financeira|meu dinheiro)\b/.test(q);
    return (cash&&debts)||overview||/dinheiro que nao volta/.test(q);
  }
  function answer(store,today){
    var s=summarize(store,today);
    var msg="Separei os valores que o Alicerce tem registrados:\n";
    msg+="• Dinheiro que saiu definitivamente neste mês: "+money(s.definitivePaid)+".\n";
    msg+="• Contas, dívidas e parcelas pendentes: "+money(s.pendingTotal)+".";
    if(s.overdue)msg+=" Desse total, "+money(s.overdue)+" já está vencido.";
    msg+="\n• Valores a receber: "+money(s.receivable)+".";
    if(s.hasUnknownTransfers)msg+="\n• Transferências sem finalidade confirmada: "+money(s.transferUnconfirmed)+" (fora dos gastos definitivos).";
    if(s.pending.length)msg+="\nPróximos compromissos: "+s.pending.slice(0,3).map(function(p){return p.description+" ("+money(p.amount)+(p.due?", "+p.due.split("-").reverse().join("/"):" sem data")+")";}).join("; ")+".";
    msg+="\nIsso considera apenas registros existentes. Compra no cartão ainda não paga é compromisso futuro, não saída de dinheiro já realizada. Você pode me pedir a análise de um item.";
    return msg;
  }
  function esc(s){return String(s).replace(/[&<>"']/g,function(ch){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];});}
  function renderCards(store,today){
    var s=summarize(store,today);
    var max=Math.max(1,s.definitivePaid,s.pendingTotal,s.receivable);
    var cards=[
      {label:"Já saiu · mês",amount:s.definitivePaid,note:"Pagamentos definitivos",color:"#e59e6a"},
      {label:"Ainda vou pagar",amount:s.pendingTotal,note:s.overdue?"Inclui "+money(s.overdue)+" vencidos":"Contas e parcelas pendentes",color:"#b4a2e7"},
      {label:"Tenho a receber",amount:s.receivable,note:"Créditos registrados",color:"#77bdb4"}
    ];
    var html='<section class="alicia-cashflow" aria-label="Análise financeira durante a conversa"><div class="alicia-cashflow-head"><strong>Seu dinheiro, em três situações</strong><span>'+esc(s.period)+'</span></div><div class="alicia-cashflow-grid">';
    cards.forEach(function(c){html+='<article class="alicia-cashflow-card"><small>'+esc(c.label)+'</small><strong>'+esc(money(c.amount))+'</strong><div class="alicia-cashflow-track"><i style="width:'+Math.round(c.amount/max*100)+'%;background:'+c.color+'"></i></div><span>'+esc(c.note)+'</span></article>';});
    html+='</div>';
    if(s.hasUnknownTransfers)html+='<p class="alicia-cashflow-caveat">Transferências sem finalidade definida: '+esc(money(s.transferUnconfirmed))+' (não classificadas como gasto).</p>';
    html+='<p class="alicia-cashflow-caveat">Leitura da conta: valores pagos e valores futuros não se misturam. O total só inclui registros salvos.</p></section>';
    return html;
  }
  root.AlicerceCashflow={summarize:summarize,matches:matches,answer:answer,renderCards:renderCards};
})(typeof window!=="undefined"?window:globalThis);
