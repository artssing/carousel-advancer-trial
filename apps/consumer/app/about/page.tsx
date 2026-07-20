import Link from 'next/link';
import { ShieldCheck, Users, Gavel, Coins, Layers } from 'lucide-react';

export const metadata = { title: '關於我們 · Certifine' };

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-slate-700 sm:px-6">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold text-slate-900">關於 Certifine</h1>
        <p className="mt-2 text-sm text-slate-500">最後更新：2026 年 6 月 30 日</p>
      </header>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <ShieldCheck className="h-5 w-5 text-brand-600" /> 我哋係咩平台
        </h2>
        <p className="text-sm leading-relaxed">
          Certifine 係一個喺香港運作嘅 C2C（個人對個人）二手精品交易平台。
          我哋撮合買家、賣家、同獨立鑑定師三方，並按品類強制／可選第三方鑑定 —
          凡單價 ≥ HKD 10,000 嘅貨品必須經獨立鑑定師驗證後先可以完成交易。
        </p>
        <p className="text-sm leading-relaxed">
          我哋唔擁有亦唔銷售任何商品。我哋係一個
          <strong className="text-slate-900">資訊撮合服務</strong>
          （information intermediary）：提供 listing 上架、搜尋、訊息、escrow 託管同
          鑑定預約嘅技術設施，但交易雙方為買家同賣家，鑑定責任歸屬具名鑑定師。
        </p>
      </section>

      <section className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Layers className="h-5 w-5 text-brand-600" /> 三層交易制
        </h2>
        <p className="text-sm leading-relaxed">
          每件 listing 按成交金額自動分入以下三層，鑑定要求同收費皆不同：
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Tier 1</p>
            <p className="mt-1 text-xs text-slate-500">&lt; HKD 1,000</p>
            <p className="mt-2 text-xs leading-relaxed">純撮合，無強制鑑定。買家自行判斷。</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Tier 2</p>
            <p className="mt-1 text-xs text-slate-500">HKD 1,000 – 9,999</p>
            <p className="mt-2 text-xs leading-relaxed">可選鑑定。雙方可協議由邊一方支付鑑定費。</p>
          </div>
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Tier 3</p>
            <p className="mt-1 text-xs text-slate-500">≥ HKD 10,000</p>
            <p className="mt-2 text-xs leading-relaxed">強制鑑定。系統會拒絕無鑑定師參與嘅落單。</p>
          </div>
        </div>
      </section>

      {/* Anchor target for top-nav 「鑑定師」 link (see top-nav.tsx NAV_LINKS).
          Also given `scroll-mt-*` so the sticky chrome doesn't cover the heading
          when the browser jumps to the anchor. */}
      <section id="authenticators" className="mt-6 scroll-mt-[calc(var(--chrome-h)+16px)] space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Users className="h-5 w-5 text-brand-600" /> 鑑定師制度
        </h2>
        <p className="text-sm leading-relaxed">
          每位鑑定師皆為以個人或實體名義喺平台註冊嘅獨立第三方專業人士。佢哋具備：
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>個人實名、店舖地址、業界年資公開</li>
          <li>由演算法派生嘅 1–5 星評分（按完成單數同爭議率計算，平台不會手動調整）</li>
          <li>專業責任保險（Errors &amp; Omissions Insurance）</li>
          <li>自主決定鑑定費率（以貨價百分比 + 最低收費表達）</li>
        </ul>
        <p className="text-sm leading-relaxed">
          鑑定結論為鑑定師之專業意見，責任歸屬該位具名鑑定師。
          平台從未亦不會以「我哋保證」或「by Certifine」嘅形式發出真偽聲明。
        </p>
      </section>

      <section className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Coins className="h-5 w-5 text-brand-600" /> 收費結構
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li><strong>平台費 1.5%</strong>：成功完成嘅每宗交易，由賣家收到嘅貨款扣除。</li>
          <li><strong>鑑定費</strong>：由鑑定師自訂（百分比 + 最低收費），於落單時清楚顯示。</li>
          <li><strong>託管（escrow）</strong>：買家貨款由平台代收，待鑑定通過及買家收貨確認後始放款予賣家。</li>
        </ul>
        <p className="text-sm leading-relaxed text-slate-500">
          所有金額以港幣 HKD 計算，採用 server 端結算，前端顯示為唯讀。
        </p>
      </section>

      <section className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Gavel className="h-5 w-5 text-brand-600" /> 法律姿態
        </h2>
        <p className="text-sm leading-relaxed">
          我哋採取「資訊中介人」（information intermediary）嘅法律立場。呢個立場參考歐盟法院
          C-324/09（L&apos;Oréal SA v eBay International AG, 2011 年 7 月 12 日）所確立嘅原則：
          平台只要唔扮演主動角色（active role）去掌控賣家內容，就唔承擔商品真偽嘅
          直接法律責任。所有真偽結論由具名鑑定師承擔。
        </p>
        <p className="text-sm leading-relaxed">
          我哋遵守香港特別行政區之相關法律，包括但不限於《個人資料（私隱）條例》（Cap. 486）、
          《商品說明條例》（Cap. 362）、《貨品售賣條例》（Cap. 26）同
          《非應邀電子訊息條例》（Cap. 593）。詳情可參閱我哋嘅
          <Link href="/terms" className="ml-1 text-brand-600 hover:underline">服務條款</Link> 同
          <Link href="/privacy" className="ml-1 text-brand-600 hover:underline">私隱政策</Link>。
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <h2 className="text-lg font-semibold text-slate-900">聯絡我哋</h2>
        <p className="mt-2 text-sm leading-relaxed">
          一般查詢：<a href="mailto:hello@certifine.hk" className="text-brand-600 hover:underline">hello@certifine.hk</a><br />
          投訴 / 爭議：<a href="mailto:disputes@certifine.hk" className="text-brand-600 hover:underline">disputes@certifine.hk</a><br />
          私隱事務主任：<a href="mailto:privacy@certifine.hk" className="text-brand-600 hover:underline">privacy@certifine.hk</a>
        </p>
      </section>
    </main>
  );
}
