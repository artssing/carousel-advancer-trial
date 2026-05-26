import { formatHKD } from '@authentik/utils';

export default function AnalyticsPage() {
  return (
    <div className="px-8 py-8">
      <h1 className="text-2xl font-bold">Analytics</h1>
      <p className="mt-1 text-sm text-slate-400">North-star metrics tracking — HK pilot</p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Cell label="MAU (rolling 30d)" value="8,243" />
        <Cell label="GMV (MTD)" value={formatHKD(2_350_000)} />
        <Cell label="Auth pass rate" value="96.1%" />
        <Cell label="Auth SLA met" value="92.4%" />
        <Cell label="Dispute rate" value="0.6%" />
        <Cell label="Take rate" value="6.1%" />
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
