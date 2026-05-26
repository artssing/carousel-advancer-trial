export default function DisputesPage() {
  const open = [
    { id: 'dsp_001', order: 'ord_005', reason: '買家認為手袋皮料與描述不符', filed: '2026-05-25', stage: 'awaiting_review' },
    { id: 'dsp_002', order: 'ord_008', reason: 'Pokemon Card 不是 PSA 10 等級', filed: '2026-05-24', stage: 'second_opinion' },
  ];
  return (
    <div className="px-8 py-8">
      <h1 className="text-2xl font-bold">Disputes</h1>
      <p className="mt-1 text-sm text-slate-400">中立調解角色 · 平台不承擔賠償，只協助 buyer 對鑑定師追償</p>
      <div className="mt-6 space-y-3">
        {open.map((d) => (
          <div key={d.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-mono text-xs text-slate-400">{d.id} · {d.order}</span>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">{d.stage}</span>
            </div>
            <p className="mt-2">{d.reason}</p>
            <p className="mt-1 text-xs text-slate-400">提交於 {d.filed}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
