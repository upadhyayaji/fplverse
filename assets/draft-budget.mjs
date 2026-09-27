// A confirmed recommendation bank is an anchor; later manual edits remain estimates.
export function validBankAnchor(anchor, players) {
  return Boolean(anchor && Number.isInteger(anchor.bank) && anchor.bank>=0 && Array.isArray(anchor.elements) && anchor.elements.length===15 && new Set(anchor.elements).size===15 && anchor.elements.every(id=>players.has(id)));
}
export function anchoredBank(anchor, squad, players) {
  if(!validBankAnchor(anchor,players)) return null;
  const cost=ids=>ids.reduce((sum,id)=>sum+Number(players.get(id)?.now_cost||0),0);
  return anchor.bank+cost(anchor.elements)-cost(squad.map(s=>s.element));
}
