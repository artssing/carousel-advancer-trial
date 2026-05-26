import { formatHKD } from '@authentik/utils';

const kpis = [
  { label: 'Active listings', value: '1,283', delta: '+12%' },
  { label: 'GMV (MTD)', value: formatHKD(2_350_000), delta: '+18%' },
  { label: 'Auth SLA met', value: '92.4%', delta: '+1.2pp' },
  { label: 'Open disputes', value: '4', delta: '-2' },
];

export default function AdminHome() {
  return (
    <div className="px-8 py-8">
      <h1 className="text-2xl font-bold">Operations Overview</h1>
      <p className="mt-1 text-sm text-slate-400">Real-time KPIs · 5-min refresh</p>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-400">{k.label}</p>
            <p className="mt-1 text-2xl font-bold">{k.value}</p>
            <p className="mt-1 text-xs text-emerald-400">{k.delta}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Block title="Auth SLA Watch" rows={[
          'ord_009 · Milan Station 旺角 · 19h left',
          'ord_017 · Sole Classics · 4h left ⚠',
          'ord_022 · 信和 CardLab · 31h left',
        ]} />
        <Block title="New Authenticator Applications" rows={[
          'Pawnex Central · 手袋 · 等待背景審查',
          'Kick Lounge · 球鞋 · 合約已寄出',
          'CardKing 信和 · TCG · E&O 保險未上載',
        ]} />
      </div>
    </div>
  );
}

function Block({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="font-semibold">{title}</h2>
      <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
        {rows.map((r) => (
          <li key={r} className="rounded-md bg-slate-950/50 px-3 py-2">{r}</li>
        ))}
      </ul>
    </div>
  );
}
