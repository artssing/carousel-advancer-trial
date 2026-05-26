import { Card, CardContent, CardHeader, CardTitle, Badge, StarRating } from '@authentik/ui';
import { formatHKD } from '@authentik/utils';
import { TrendingUp, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Milan Station 旺角</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <StarRating value={5} size="sm" showValue /> · 已鑑定 1,247 件 · 入網 8 個月
          </div>
        </div>
        <Badge variant="success">Active · E&O 保險有效至 2027-01-31</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat icon={Clock} label="待處理" value="7" hint="2 件 SLA 24h" tint="amber" />
        <Stat icon={CheckCircle2} label="本月完成" value="89" hint="+12% MoM" tint="emerald" />
        <Stat icon={TrendingUp} label="本月收入" value={formatHKD(67400)} tint="brand" />
        <Stat icon={AlertTriangle} label="爭議率" value="0.8%" hint="低於平均" tint="slate" />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>下一單 SLA 倒數</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-amber-50 p-4 text-amber-900">
            <p className="font-medium">Order #ord_009 · Chanel 19 Bag · HKD 36,500</p>
            <p className="mt-1 text-sm">收貨於 5 小時前 · 剩 19h 完成鑑定</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tint: 'amber' | 'emerald' | 'brand' | 'slate';
}) {
  const tintMap = {
    amber: 'text-amber-700 bg-amber-50',
    emerald: 'text-emerald-700 bg-emerald-50',
    brand: 'text-brand-700 bg-brand-50',
    slate: 'text-slate-700 bg-slate-50',
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg p-2 ${tintMap[tint]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-xl font-bold">{value}</p>
            {hint && <p className="text-xs text-slate-400">{hint}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
