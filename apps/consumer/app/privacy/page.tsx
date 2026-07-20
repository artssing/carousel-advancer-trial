import Link from 'next/link';

export const metadata = { title: '私隱政策 · Certifine' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-slate-700 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-slate-900">私隱政策</h1>
        <p className="mt-2 text-sm text-slate-500">最後更新：2026 年 6 月 30 日 · 版本 1.0</p>
      </header>

      <p className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed">
        本政策說明 Certifine Ltd.（「<strong>本平台</strong>」、「我哋」）
        如何收集、使用、儲存、披露及保護你嘅個人資料。我哋遵從香港《個人資料（私隱）條例》
        （Cap. 486，下稱「<strong>條例</strong>」）所訂明嘅六項保障資料原則
        （Data Protection Principles, DPP1 – DPP6）。
      </p>

      {/* ── DPP1 ──────────────────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">1. 收集嘅資料種類 · DPP1（收集目的及方式）</h2>
        <p className="mt-2 text-sm leading-relaxed">
          我哋只會以合法及公平嘅方式收集為履行平台服務直接相關所必需嘅個人資料：
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li><strong>帳戶資料</strong>：電郵、密碼雜湊、顯示名稱、頭像。</li>
          <li><strong>聯絡資料</strong>：手提電話（如選填）、Google SSO 之 email 證實狀態。</li>
          <li><strong>身分驗證 (KYC)</strong>：身分證副本、自拍照（適用於高層級交易）。</li>
          <li><strong>交易資料</strong>：商品 listing 內容、訊息、訂單、發貨地址、付款憑證、爭議紀錄。</li>
          <li><strong>技術資料</strong>：IP 位址、瀏覽器類型、裝置識別碼、登入時間、操作日誌。</li>
        </ul>
        <p className="mt-2 text-sm leading-relaxed">
          收集目的包括：（一）核實用戶身分；（二）撮合及完成交易；（三）爭議處理；
          （四）防止詐騙、洗錢及違法行為；（五）法律合規；（六）改進服務。
          如未能提供某些必要資料，可能無法使用相關功能。
        </p>
      </section>

      {/* ── DPP2 ──────────────────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">2. 準確性與保留期 · DPP2</h2>
        <p className="mt-2 text-sm leading-relaxed">
          我哋會採取合理步驟確保所持有之個人資料準確。用戶可隨時透過
          <Link href="/account/profile" className="ml-1 text-brand-600 hover:underline">「我的帳號」</Link>
          {' '}更新個人資料。
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          資料保留期：
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>帳戶資料：直至帳戶被刪除後 90 日；如有未完成交易或爭議，保留至完結後 7 年。</li>
          <li>KYC 資料：依《打擊洗錢及恐怖分子資金籌集條例》（Cap. 615）要求保留至少 5 年。</li>
          <li>交易紀錄：保留 7 年以符合稅務及商業紀錄要求。</li>
          <li>技術日誌：通常保留 90 日；爭議或安全事件相關日誌可延長至調查完結。</li>
        </ul>
      </section>

      {/* ── DPP3 ──────────────────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">3. 使用及披露 · DPP3</h2>
        <p className="mt-2 text-sm leading-relaxed">
          我哋只會將個人資料用於收集時告知之目的，或事先取得用戶明確同意之新目的。
          在無同意下，我哋只會於以下情況披露：
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>對交易另一方披露完成交易所必需之最少資料（例如：賣家見到買家發貨地址、買家見到賣家顯示名稱）；</li>
          <li>對鑑定師披露與該宗鑑定直接相關之商品及交易資料；</li>
          <li>對支付處理商、雲端儲存供應商等服務供應商披露完成服務所必需之資料，並要求其遵守同等保密義務；</li>
          <li>依法律、法院命令或執法機構合法要求披露。</li>
        </ul>
        <p className="mt-2 text-sm leading-relaxed">
          我哋唔會將你嘅個人資料出售予第三方作直接促銷用途。
          如未來擬作該等用途，將事先尋求用戶之書面同意（依條例第 35C 條）。
        </p>
      </section>

      {/* ── DPP4 ──────────────────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">4. 保安措施 · DPP4</h2>
        <p className="mt-2 text-sm leading-relaxed">
          我哋採取下列實際可行措施保護個人資料免受未經授權或意外存取、處理、刪除、遺失或使用：
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>傳輸層加密（HTTPS／TLS）涵蓋所有用戶端與伺服器之間之通訊；</li>
          <li>密碼以單向雜湊（bcrypt）儲存，從不以明文保留；</li>
          <li>權限分層及最少必要原則：員工只會在工作需要時存取相應資料；</li>
          <li>定期備份及審計日誌；</li>
          <li>第三方雲端服務供應商須通過 ISO 27001 或 SOC 2 同等認證。</li>
        </ul>
      </section>

      {/* ── DPP5 ──────────────────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">5. 透明度 · DPP5</h2>
        <p className="mt-2 text-sm leading-relaxed">
          本政策、<Link href="/terms" className="text-brand-600 hover:underline">服務條款</Link>
          {' '}及就特定功能（如鑑定預約、爭議申訴）之收集陳述均公開於本平台。
          如有重大變更，我哋會於本頁更新並（如適用）以電郵通知用戶。
        </p>
      </section>

      {/* ── DPP6 ──────────────────────────────────────────────────────── */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">6. 查閱與更正 · DPP6</h2>
        <p className="mt-2 text-sm leading-relaxed">
          按條例第 18 及 22 條，你有權：
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>查詢我哋有否持有你之個人資料；</li>
          <li>取得該等資料之副本（我哋可能依條例第 28(2) 條收取合理費用）；</li>
          <li>要求更正不準確之資料；</li>
          <li>撤回先前同意之資料處理（不影響撤回前合法處理）。</li>
        </ul>
        <p className="mt-2 text-sm leading-relaxed">
          請將查閱或更正要求以書面發送至
          <a href="mailto:privacy@certifine.hk" className="ml-1 text-brand-600 hover:underline">privacy@certifine.hk</a>。
          我哋將於 40 日內回覆。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">7. Cookies 及追蹤技術</h2>
        <p className="mt-2 text-sm leading-relaxed">
          我哋使用 cookies 同類似技術以維持登入狀態、記住用戶偏好、收集匿名統計以改進服務。
          你可透過瀏覽器設定停用 cookies，但部分功能（如保持登入）可能無法正常運作。
          我哋目前不使用第三方廣告追蹤。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">8. 跨境傳輸</h2>
        <p className="mt-2 text-sm leading-relaxed">
          我哋之主要數據儲存設施位於香港。如出於技術需要將資料傳輸至香港境外
          （例如使用全球性雲端服務），我哋會確保接收方之保護水平不低於條例要求。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">9. 兒童私隱</h2>
        <p className="mt-2 text-sm leading-relaxed">
          本平台只供 18 歲或以上人士使用。我哋不會故意收集未成年人之個人資料。
          如得悉有未成年人開設帳戶，我哋將立即關閉該帳戶並刪除相關資料。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">10. 投訴渠道</h2>
        <p className="mt-2 text-sm leading-relaxed">
          如對本平台處理你之個人資料有任何疑問或投訴，請聯絡：
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          私隱事務主任：<a href="mailto:privacy@certifine.hk" className="text-brand-600 hover:underline">privacy@certifine.hk</a>
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          如未獲滿意答覆，可直接向香港個人資料私隱專員公署（PCPD）投訴：<br />
          地址：香港灣仔皇后大道東 248 號陽光中心 13 樓 1303 室<br />
          熱線：(852) 2827 2827 · 網址：
          <a href="https://www.pcpd.org.hk" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">www.pcpd.org.hk</a>
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <h2 className="text-lg font-semibold text-slate-900">相關政策</h2>
        <p className="mt-2 text-sm leading-relaxed">
          <Link href="/terms" className="text-brand-600 hover:underline">服務條款</Link>
          ／<Link href="/about" className="text-brand-600 hover:underline">關於我們</Link>
        </p>
      </section>
    </main>
  );
}
