// Read-only projection: movement and receipt records remain authoritative.
export function requests(snapshot, quantities) {
  const linked = new Set(quantities.map(q => q.movement_id).filter(Boolean));
  const specific = (snapshot.requests || []).filter(r => !linked.has(r.id)).map(r => ({
    id: r.id, kind: 'specific', movement: r, quantity: (r.toolIds || []).length,
    assetIds: r.toolIds || [], name: (r.toolIds || []).map(id => snapshot.tools?.find(t => t.id === id)?.name || id).join(', '),
    requester: r.requester, destination: r.destination, createdAt: r.createdAt, raw: r
  }));
  return [...specific, ...quantities.map(q => ({
    id: q.id, kind: 'quantity', movement: snapshot.requests?.find(r => r.id === q.movement_id),
    quantity: q.requested_quantity, assetIds: (q.assets || []).map(a => a.asset_id),
    name: q.type_name, requester: q.requester_name, destination: q.site_name, createdAt: q.created_at, raw: q
  }))].map(r => {
    const matches = r.movement ? (snapshot.transfers || []).filter(t => t.requestId === r.movement.id || (r.movement.transferId && t.id === r.movement.transferId)) : [];
    // Never guess which of conflicting handovers should be accepted.
    r.transfer = matches.length === 1 ? matches[0] : null;
    r.status = r.movement?.status || r.raw.status;
    r.stage = stage(r);
    const events = (snapshot.activity || []).filter(event => event.entityId === r.movement?.id);
    r.approvalRecorded = ['approved','released','received'].includes(r.status) || Boolean(r.transfer) || Number(r.raw.approved_quantity) > 0 || events.some(e => ['approveRequest','request_approved'].includes(e.action));
    r.releaseRecorded = Boolean(r.transfer) || ['released','received'].includes(r.status) || events.some(e => ['releaseRequest','transfer_created'].includes(e.action));
    r.inspectionRecorded = r.transfer?.status === 'received' || r.status === 'received';
    return r;
  }).sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
export function stage(r) {
  const status = r.status || r.movement?.status || r.raw?.status;
  if (['cancelled','canceled','withdrawn','rejected'].includes(status)) return {key: status === 'canceled' ? 'cancelled' : status, label: status === 'rejected' ? 'Rejected' : status === 'withdrawn' ? 'Withdrawn' : 'Cancelled', next: r.raw?.rejection_reason || r.movement?.reason || r.movement?.cancellationReason || 'This request is closed. Its history remains available.'};
  if (['refused','discrepancy','disputed'].includes(r.transfer?.status)) return {key:'follow-up',label:'Handover needs follow-up',next:'Review the handover exception with the sender. Receipt has not been confirmed for every item.'};
  if ((r.transfer?.inspections || []).some(item => ['lost','missing','disputed'].includes(item.condition))) return {key:'follow-up',label:'Inspection recorded — Follow-up required',next:'The inspection includes missing or disputed equipment. Review the recorded exception with the sender; custody is confirmed only for accepted items.'};
  if (r.transfer?.status === 'received' || status === 'received') return {key:'received',label:'Inspected / Received',next:'Receipt was recorded for the named recipient. Equipment Tracking reflects current confirmed custody.'};
  if (r.transfer?.status === 'canceled' || r.transfer?.status === 'cancelled') return {key:'cancelled',label:'Handover cancelled',next:'Custody did not change. Review the cancellation in movement history.'};
  if (status === 'released' || r.transfer) {
    if (r.transfer?.status === 'pending') return {key:'inspection',label:'Awaiting Your Inspection',next:'Inspect each physical Asset ID and record its condition in Accept Equipment before confirming receipt.'};
    return {key:'unverified',label:'Released — Handover needs verification',next:'The linked handover could not be verified. Refresh, then ask Admin to check the handover reference if it remains unavailable.'};
  }
  if (status === 'approved') return {key:'approved',label:'Approved — Awaiting Admin Release',next:'The Asset IDs are reserved. Admin must release the equipment before you can inspect and accept it.'};
  if (status === 'pending') return {key:'pending',label:'Awaiting Admin Review',next:'Admin will review availability and reserve the exact Asset IDs.'};
  return {key:'unverified',label:'Status needs verification',next:'Refresh to verify this historical request before taking action.'};
}
