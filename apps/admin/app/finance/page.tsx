import { formatHKD } from '@authentik/utils';

export default function FinancePage() {
  return (
    <div className="px-8 py-8">
      <h1 className="text-2xl font-bold">Finance</h1>
      <p className="mt-1 text-sm text-slate-400">Escrow reconciliation + 鑑定師 payout</p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card title="Escrow balance" value={formatHKD(1_540_000)} hint="持有中（Stripe Connect）" />
        <Card title="To pay authenticators" value={formatHKD(125_400)} hint="下次 payout: 2026-06-10" />
        <Card title="Platform revenue (MTD)" value={formatHKD(87_300)} hint="月增 +18%" />
      </div>
    </div>
  );
}

function Card({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <p className="text-xs uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
