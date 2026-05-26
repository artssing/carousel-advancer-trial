import { Card, CardContent, CardHeader, CardTitle, StarRating, Badge, Input, Label, Button } from '@authentik/ui';

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="font-display text-2xl font-bold">公開 Profile</h1>
      <p className="mt-1 text-sm text-slate-500">這是買家在平台看到的鑑定店資訊</p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>店面 / 個人資料</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 rounded-full bg-slate-200" />
            <div>
              <p className="font-medium">Milan Station 旺角</p>
              <div className="flex items-center gap-2">
                <StarRating value={5} size="sm" showValue />
                <Badge variant="gold">5 星鑑定師</Badge>
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="bio">簡介</Label>
            <textarea
              id="bio"
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              defaultValue="專營二手名牌手袋十五年，旺角 / 銅鑼灣 / 沙田設店，每年鑑定逾 5,000 件。"
            />
          </div>
          <div>
            <Label htmlFor="addr">主要鑑定地址</Label>
            <Input id="addr" defaultValue="旺角西洋菜南街 1A 號 5 樓" className="mt-1" />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>E&O 保險證明</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          <p>狀態：<span className="text-emerald-600">有效</span></p>
          <p>承保金額：HKD 5,000,000 / 單次事件</p>
          <p>有效期：2026-02-01 → 2027-01-31</p>
          <Button variant="outline" size="sm" className="mt-3">上載續保證明</Button>
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button>儲存改動</Button>
      </div>
    </div>
  );
}
