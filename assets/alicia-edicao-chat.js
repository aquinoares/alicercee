/* Parse and validate changes to existing, stand-alone cash expenses. */
(function(root){
  "use strict";
  function norm(value){
    return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  }
  function method(row){
    return String(row.paymentMethod||row.forma||row.pagamento||row.formaPagamento||"");
  }
  function eligible(row){
    return !!row&&row.tipo==="despesa"&&row.status==="pago"&&["pix","dinheiro"].includes(method(row))
      &&!row.loanId&&!row.installmentId&&!row.commitmentId&&!row.cardId&&!row.compraId
      &&!row.financingId&&!row.consortiumId&&!row.insuranceId
      &&(!row.analysis||!row.analysis.financialRole||row.analysis.financialRole==="consumption");
  }
  function snapshot(row){
    return {amount:Number(row.valor),date:String(row.data||""),method:method(row)};
  }
  function changes(text,readDate){
    var raw=norm(text).trim();
    var corrected=raw.split(/\b(?:mas|so que)\s+(?:eu\s+)?(?:lancei|registrei|adicionei|coloquei|cadastrei)\b/)[0];
    if(/\b(?:credito|debito|cartao|sodexo|pluxee|solides|vale alimentacao|parcelad[oa]s?)\b/.test(corrected))
      return {error:"Essa alteração precisa de vínculo com o cartão ou benefício. Abra o original para conferir antes de lançar na forma certa."};
    var result={};
    var target=corrected.match(/\b(?:por|para|via|em|no|foi)\s+(?:o\s+)?(pix|dinheiro|especie)\b/);
    if(target)result.method=target[1]==="pix"?"pix":"dinheiro";
    var amount=corrected.match(/\b(?:valor(?:\s+(?:correto|foi|e))?|foi de|corrige para)\s*[:=]?\s*(?:r\$\s*)?(\d+(?:\.\d{3})*(?:,\d{1,2})?)(?!\d|[.,/\-]\d)/);
    if(amount){
      var numeric=Number(amount[1].replace(/\./g,"").replace(",","."));
      if(!Number.isFinite(numeric)||numeric<=0||numeric>10000000)return {error:"Informe um valor válido em reais."};
      result.amount=numeric;
    }
    var date=corrected.match(/\b(?:anteontem|ontem|hoje|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}\s+de\s+(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+\d{4})?)\b/);
    if(date){
      result.date=readDate(date[0]);
      if(!result.date)return {error:"Não reconheci essa data. Informe no formato dia/mês/ano."};
    }
    return result;
  }
  function updated(row,original,next,userId){
    if(!eligible(row)||(row.userId&&row.userId!==userId))return {error:"O lançamento deixou de estar disponível para esta correção."};
    var before=snapshot(row);
    if(before.amount!==original.amount||before.date!==original.date||before.method!==original.method)
      return {error:"O lançamento mudou desde a conferência. Abra a versão atual e revise de novo."};
    if(!(next.amount>0)||!Number.isFinite(next.amount)||!/^[\d]{4}-[\d]{2}-[\d]{2}$/.test(next.date)||!["pix","dinheiro"].includes(next.method))
      return {error:"Confira o valor, a data e o pagamento."};
    var date=new Date(next.date+"T12:00:00Z");
    if(isNaN(date.getTime())||date.toISOString().slice(0,10)!==next.date)return {error:"A data da correção é inválida."};
    if(next.amount!==before.amount&&row.analysis&&row.analysis.items&&row.analysis.items.length)
      return {error:"Esse gasto tem itens de nota vinculados. Confira a nota antes de alterar o total."};
    if(before.amount===next.amount&&before.date===next.date&&before.method===next.method)return {unchanged:true};
    var record=Object.assign({},row,{valor:next.amount,data:next.date,forma:next.method,paymentMethod:next.method,updatedAt:new Date().toISOString()});
    ["pagamento","formaPagamento","metodoPagamento"].forEach(function(key){
      if(Object.prototype.hasOwnProperty.call(row,key))record[key]=next.method;
    });
    return {record:record};
  }
  root.AlicerceEdicaoChat={eligible:eligible,snapshot:snapshot,changes:changes,updated:updated};
})(typeof window!=="undefined"?window:globalThis);
