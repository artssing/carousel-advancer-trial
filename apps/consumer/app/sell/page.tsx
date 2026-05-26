'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  TierPill,
} from '@authentik/ui';
import { CATEGORIES, tierForPrice } from '@authentik/utils';
import { api, hasToken, ApiError } from '@/lib/api';

const ENUM_BY_ID: Record<string, string> = {
  handbag: 'HANDBAG',
  iphone: 'IPHONE',
  pokemon_card: 'POKEMON_CARD',
  watch: 'WATCH',
  sneaker: 'SNEAKER',
  designer_toy: 'DESIGNER_TOY',
  other: 'OTHER',
};

export default function SellPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('handbag');
  const [price, setPrice] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const previewTier = typeof price === 'number' && price > 0 ? tierForPrice(price) : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!hasToken()) {
      router.push('/login');
      return;
    }
    if (typeof price !== 'number') {
      setError('請輸入價格');
      return;
    }
    setBusy(true);
    try {
      const listing = await api.listings.create({
        title,
        description,
        priceHKD: price,
        category: ENUM_BY_ID[categoryId] ?? 'OTHER',
      });
      router.push(`/listing/${listing.id}`);
      router.refresh();
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : 'Failed to create listing');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-2xl font-bold">上架新商品</h1>
      <p className="mt-1 text-sm text-slate-600">
        賣家須通過 KYC · 商品鑑定費由賣家承擔（從成交價自動扣除）· 鑑定失敗則退回賣家
      </p>

      <form onSubmit={onSubmit}>
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>商品基本資料</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">商品標題</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例：Chanel Classic Flap Medium Caviar Black"
                className="mt-1"
                required
                minLength={3}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="cat">品類</Label>
                <select
                  id="cat"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="mt-1 flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                >
                  {Object.values(CATEGORIES)
                    .filter((c) => c.enabledInMvp)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.labelZh}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <Label htmlFor="price">要價（HKD）</Label>
                <Input
                  id="price"
                  type="number"
                  value={price}
                  onChange={(e) =>
                    setPrice(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  placeholder="48000"
                  className="mt-1"
                  min={1}
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="desc">商品描述</Label>
              <textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="購入日期、配件齊全度、瑕疵說明、購入地點 / 單據…"
                required
              />
            </div>
            {previewTier && (
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <span className="text-slate-600">此價格對應：</span>
                <span className="ml-2 inline-block">
                  <TierPill tier={previewTier} showDescription />
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Link href="/browse">
            <Button type="button" variant="outline">取消</Button>
          </Link>
          <Button type="submit" disabled={busy}>
            {busy ? '發佈中…' : '發佈上架'}
          </Button>
        </div>
      </form>
    </div>
  );
}
