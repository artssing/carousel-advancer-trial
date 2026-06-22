import { Card, CardContent, CardHeader, CardTitle, Button, Input, Label } from '@authentik/ui';

export default function OnboardingPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="font-display text-2xl font-bold">加入 Authentik HK 鑑定師網絡</h1>
      <p className="mt-1 text-sm text-slate-500">
        免月費 · 按單收費 · 鑑定錯誤需按合約 + 自購 E&O 保險賠付 · 提供 social marketing tools
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>1. 基本資料</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>店面 / 個人名稱</Label>
            <Input className="mt-1" placeholder="例：Milan Station 旺角" />
          </div>
          <div>
            <Label>商業登記證號（如適用）</Label>
            <Input className="mt-1" />
          </div>
          <div>
            <Label>專長品類（可選多個）</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {['手袋', 'iPhone / 電子', 'Pokemon Card / TCG', '名錶', '球鞋', '潮玩'].map((c) => (
                <label key={c} className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs">
                  <input type="checkbox" /> {c}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>2. 業界資歷上載</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-600">
          <p>請上載以下任何 2 項：</p>
          <ul className="list-disc pl-5">
            <li>過往鑑定 / 寄賣紀錄（3 個月）</li>
            <li>業界推薦信 / KOL 背書</li>
            <li>實體店外觀照片 + 商業登記</li>
            <li>YouTube / IG 粉絲頁連結（&gt;5,000 followers）</li>
          </ul>
          <Button variant="outline" size="sm" className="mt-3">上載檔案</Button>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>3. 簽合約 + 上載 E&O 保險證明</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          <p>
            審批通過後，平台會透過 DocuSign 寄出鑑定師合約。簽署後須提供 E&O 保險證明（如未有，可由平台撮合團體保單）。
          </p>
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button>提交申請</Button>
      </div>
    </div>
  );
}
