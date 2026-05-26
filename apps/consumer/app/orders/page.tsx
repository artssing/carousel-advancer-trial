'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, Badge, TierPill, Button } from '@authentik/ui';
import { formatHKD, tierForPrice } from '@authentik/utils';
import { api, hasToken, clearToken } from '@/lib/api';

const statusLabel: Record<string, string> = {
  AWAITING_PAYMENT: '等待付款',
  PAID: '已付款 · 等待寄出至鑑定師',
  SHIPPED_TO_AUTHENTICATOR: '已寄出至鑑定師',
  AUTHENTICATING: '鑑定中',
  AUTH_PASSED: '鑑定通過 · 已寄出買家',
  AUTH_FAILED: '鑑定不通過 · 退回賣家',
  SHIPPED_TO_BUYER: '已寄出，預計明日送達',
  DELIVERED: '已送達',
  COMPLETED: '已完成',
  DISPUTED: '爭議中',
  REFUNDED: '已退款',
};

const statusVariant = (s: string): 'success' | 'warning' | 'brand' | 'danger' | 'default' => {
  if (s === 'COMPLETED' || s === 'AUTH_PASSED') return 'success';
  if (s === 'AWAITING_PAYMENT' || s === 'AUTHENTICATING') return 'warning';
  if (s === 'SHIPPED_TO_BUYER' || s === 'PAID') return 'brand';
  if (s === 'AUTH_FAILED' || s === 'REFUNDED' || s === 'DISPUTED') return 'danger';
  return 'default';
};

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (!hasToken()) {
      setAuthed(false);
      setLoading(false);
      return;
    }
    setAuthed(true);
    api.orders
      .list()
      .then(setOrders)
      .catch((e) => {
        if (e?.status === 401) {
          clearToken();
          setAuthed(false);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function onLogout() {
    clearToken();
    router.push('/');
    router.refresh();
  }

  if (!authed && !loading) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <p className="text-sm text-slate-600">請先登入查看訂單。</p>
        <Link href="/login">
          <Button className="mt-4">前往登入</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">我的訂單</h1>
        <Button variant="outline" size="sm" onClick={onLogout}>
          登出
        </Button>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">載入中…</p>
      ) : orders.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          未有訂單。<Link href="/browse" className="text-brand-600 hover:underline">去瀏覽商品</Link>
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {orders.map((o) => (
            <Card key={o.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="h-16 w-16 rounded-lg bg-slate-100" />
                <div className="flex-1">
                  <p className="font-medium">{o.listing?.title}</p>
                  <p className="text-sm text-slate-500">{formatHKD(o.salePriceHKD)}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <TierPill tier={tierForPrice(o.salePriceHKD) as 1 | 2 | 3} />
                    <Badge variant={statusVariant(o.status)}>
                      {statusLabel[o.status] ?? o.status}
                    </Badge>
                  </div>
                  {o.authenticator && (
                    <p className="mt-1 text-xs text-slate-400">
                      鑑定師：{o.authenticator.displayName}（{o.authenticator.starRating} 星）
                    </p>
                  )}
                </div>
                <div className="font-mono text-xs text-slate-400">#{o.id.slice(0, 6)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
