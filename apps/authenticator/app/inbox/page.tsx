import Link from 'next/link';
import { Card, CardContent, Badge } from '@authentik/ui';
import { formatHKD } from '@authentik/utils';

const stub = [
  { id: 'ord_009', title: 'Chanel 19 Bag', price: 36500, slaLeft: '19h', urgent: true },
  { id: 'ord_011', title: 'iPhone 15 Pro Max', price: 8500, slaLeft: '46h', urgent: false },
  { id: 'ord_013', title: 'Charizard PSA 10', price: 38000, slaLeft: '63h', urgent: false },
];

export default function InboxPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="font-display text-2xl font-bold">待鑑定 Inbox</h1>
      <p className="mt-1 text-sm text-slate-500">按 SLA 倒數排序 · 24h / 48h / 72h SLA</p>

      <div className="mt-6 space-y-3">
        {stub.map((o) => (
          <Link key={o.id} href={`/authenticate/${o.id}`}>
            <Card className="transition hover:shadow-md">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{o.title}</p>
                  <p className="text-sm text-slate-500">
                    {formatHKD(o.price)} · #{o.id}
                  </p>
                </div>
                <Badge variant={o.urgent ? 'danger' : 'warning'}>剩 {o.slaLeft}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
