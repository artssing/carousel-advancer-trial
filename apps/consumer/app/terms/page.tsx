import Link from 'next/link';

export const metadata = { title: '服務條款 · Authentik HK' };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-slate-700 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-slate-900">服務條款</h1>
        <p className="mt-2 text-sm text-slate-500">最後更新：2026 年 6 月 30 日 · 版本 1.0</p>
      </header>

      <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed">
        本條款係你（「<strong>用戶</strong>」）與 Authentik HK Ltd.（「<strong>本平台</strong>」、「我哋」）
        之間具法律約束力嘅協議。使用本平台即表示你接受本條款。如未滿 18 歲或不接受任何條款，請即停止使用。
      </p>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">1. 平台性質</h2>
        <p className="mt-2 text-sm leading-relaxed">
          本平台係一個資訊撮合服務（information intermediary）。我哋提供 listing 上架、搜尋、
          訊息、託管同鑑定預約嘅技術設施，但不擁有、不持有、亦不銷售任何商品。
          交易關係係買家與賣家之間嘅契約；鑑定意見係鑑定師之專業判斷。
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          本平台一切 UI／文案中所提及「鑑定通過」、「真偽結論」等均代表
          <strong>具名鑑定師之個別意見</strong>，並非本平台之擔保。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">2. 用戶資格</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>須年滿 18 歲，並具備訂立有效合約之行為能力。</li>
          <li>須提供真實準確之個人資料；身分驗證（KYC）按品類及交易層級可能要求。</li>
          <li>本平台保留以合理理由拒絕、暫停或終止任何帳戶之權利。</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">3. 賣家義務</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>對所上架商品擁有合法所有權及銷售權，且該商品來源合法。</li>
          <li>盡實將商品狀態、品牌、型號、附件、瑕疵及成色如實描述及拍攝。
            違反《商品說明條例》（Cap. 362）將自負法律責任。</li>
          <li>不得上架《進出口（戰略物品）規例》、《危險藥物條例》等法律禁止之物品。</li>
          <li>於買家確認落單後，按系統提示時限完成貨品交收（寄出或面交）。</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">4. 買家義務</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>於落單後按系統時限完成付款。逾時未付款之訂單可能被自動取消。</li>
          <li>收到貨品後須於指定時限內檢查並確認收貨；逾時未動作視為默認收貨。</li>
          <li>不得藉口惡意拖延或就無客觀依據之理由要求退款。</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">5. 鑑定服務</h2>
        <p className="mt-2 text-sm leading-relaxed">
          鑑定服務由獨立鑑定師提供。鑑定師為自僱專業人士，並非本平台之僱員。
          每位鑑定師皆持有自身專業責任保險（E&amp;O Insurance），並就其鑑定結論獨立承擔法律責任。
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          鑑定結論可能為「真品」、「贗品」或「無法判定」（inconclusive）。
          就同一商品如出現多位鑑定師之意見分歧，本平台僅提供平台機制協助雙方解決，
          不就真偽結論作出最終裁定。
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          鑑定師之評分（1–5 星）純由演算法依照完成單數及爭議率派生，不會接受手動調整。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">6. 收費</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li><strong>平台費 1.5%</strong>：成功交易時由賣家應收款項中扣除。</li>
          <li><strong>鑑定費</strong>：由鑑定師自訂（百分比 + 最低收費），落單前清楚顯示。</li>
          <li><strong>退款</strong>：交易未進入鑑定階段前可全額退款；其後按下款情況處理。</li>
          <li>本平台保留調整費率之權利，調整將提前至少 30 日於本頁公告，並 grandfather 已落單訂單。</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">7. 託管（Escrow）</h2>
        <p className="mt-2 text-sm leading-relaxed">
          買家貨款於落單時由本平台代收，待以下條件全部達成後始放款予賣家：
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>（如有）鑑定師完成鑑定並得出非贗品結論；</li>
          <li>買家確認收貨，或自系統時限屆滿後未提出異議。</li>
        </ul>
        <p className="mt-2 text-sm leading-relaxed">
          如鑑定結論為贗品，貨款將全額退回買家；貨品按系統流程處置或退回賣家。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">8. 禁止內容及行為</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>侵權物品、贗品（明知為贗品而上架）、走私品、受管制物品；</li>
          <li>引導交易離開平台以規避平台費或託管；</li>
          <li>濫發訊息、操控評分、自買自賣（self-dealing）；</li>
          <li>任何違反香港特別行政區法律之行為。</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">9. 爭議處理</h2>
        <p className="mt-2 text-sm leading-relaxed">
          買家、賣家及鑑定師如有爭議，請優先透過平台內訊息溝通。
          如未能達成共識，可向 <a href="mailto:disputes@authentik.hk" className="text-brand-600 hover:underline">disputes@authentik.hk</a>
          {' '}遞交申訴；本平台將協助保存對話紀錄、付款憑證及鑑定報告以助釐清事實，
          但不作最終裁定。如有需要，雙方可循民事訴訟、消費者委員會調解或仲裁途徑處理。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">10. 責任限制</h2>
        <p className="mt-2 text-sm leading-relaxed">
          在法律容許嘅最大範圍內，本平台不就以下情況承擔責任：
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>商品真偽（由鑑定師承擔）；</li>
          <li>賣家描述失實或交收失敗（由賣家承擔）；</li>
          <li>因不可抗力（包括但不限於網絡中斷、第三方支付故障）引致之延遲。</li>
        </ul>
        <p className="mt-2 text-sm leading-relaxed">
          本平台對任何用戶之間接、附帶或後果性損失（如預期利潤損失）唔承擔責任。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">11. 修訂</h2>
        <p className="mt-2 text-sm leading-relaxed">
          本條款可能不時更新。重大修訂將透過電郵或站內通知告知，並於本頁更新「最後更新」日期。
          繼續使用本平台即視為接受修訂後條款。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">12. 法律及管轄</h2>
        <p className="mt-2 text-sm leading-relaxed">
          本條款受香港特別行政區法律管轄並按其詮釋。任何爭議須提交香港特別行政區法院之專屬司法管轄。
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <h2 className="text-lg font-semibold text-slate-900">聯絡</h2>
        <p className="mt-2 text-sm leading-relaxed">
          一般查詢：<a href="mailto:hello@authentik.hk" className="text-brand-600 hover:underline">hello@authentik.hk</a><br />
          爭議：<a href="mailto:disputes@authentik.hk" className="text-brand-600 hover:underline">disputes@authentik.hk</a><br />
          相關政策：<Link href="/privacy" className="text-brand-600 hover:underline">私隱政策</Link>
          ／<Link href="/about" className="text-brand-600 hover:underline">關於我們</Link>
        </p>
      </section>
    </main>
  );
}
