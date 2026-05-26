import { Card, CardContent, CardHeader, CardTitle } from '@authentik/ui';
import { formatHKD } from '@authentik/utils';

const months = [
  { m: '2026-05', revenue: 67400, count: 89 },
  { m: '2026-04', revenue: 60100, count: 78 },
  { m: '2026-03', revenue: 54200, count: 71 },
];

export default function EarningsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="font-display text-2xl font-bold">收入儀表板</h1>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>月份收入</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {months.map((m) => (
            <div
              key={m.m}
              className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
            >
              <div>
                <p className="font-medium">{m.m}</p>
                <p className="text-xs text-slate-500">{m.count} 件鑑定</p>
              </div>
              <p className="text-lg font-semibold">{formatHKD(m.revenue)}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-slate-500">
        平台每月 10 號透過 FPS / 銀行轉帳結算，扣除平台撮合費後直接入鑑定店戶口。
      </p>
    </div>
  );
}
