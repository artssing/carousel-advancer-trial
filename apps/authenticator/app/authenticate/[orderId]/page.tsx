import { Button, Card, CardContent, CardHeader, CardTitle, Label, Input, Badge } from '@authentik/ui';
import { Camera, FileSignature, Share2 } from 'lucide-react';

const checklist = [
  '外觀：縫線整齊度、皮料紋理',
  '五金：刻字深度、電鍍光澤',
  '內裏：標籤字體、序號',
  '隨附：購買單據、防塵袋、原裝盒',
];

export default async function AuthenticatePage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-4 flex items-center gap-2">
        <Badge variant="warning">SLA 剩 19h</Badge>
        <Badge>{orderId}</Badge>
      </div>
      <h1 className="font-display text-2xl font-bold">鑑定工作台：Chanel 19 Bag</h1>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>1. 全程錄影</CardTitle>
        </CardHeader>
        <CardContent>
          <button className="flex h-40 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 text-slate-500 hover:bg-slate-50">
            <Camera className="h-6 w-6" />
            上傳鑑定影片（必須）
          </button>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>2. 鑑定 Checklist（手袋）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {checklist.map((item) => (
            <label key={item} className="flex items-center gap-2">
              <input type="checkbox" className="rounded border-slate-300" />
              {item}
            </label>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>3. 結論</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button variant="primary">真品 Authentic</Button>
            <Button variant="danger">假貨 Counterfeit</Button>
            <Button variant="outline">無法判定</Button>
          </div>
          <div>
            <Label htmlFor="notes">補充說明</Label>
            <textarea
              id="notes"
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="任何需向買家披露的細節…"
            />
          </div>
          <div>
            <Label htmlFor="sign">電子簽名（輸入你的全名以確認）</Label>
            <Input id="sign" placeholder="鑑定師全名" className="mt-1" />
            <p className="mt-1 text-xs text-slate-500">
              簽名提交後，本鑑定結果將具法律效力。鑑定錯誤將按你的合約 + E&O 保險條款追償。
            </p>
          </div>
          <div className="flex gap-2">
            <Button>
              <FileSignature className="mr-2 h-4 w-4" /> 簽名並提交
            </Button>
            <Button variant="ghost">
              <Share2 className="mr-2 h-4 w-4" /> 完成後分享到 IG
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
