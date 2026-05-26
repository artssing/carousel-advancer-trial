export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-6 text-xs text-slate-500">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} Authentik HK Ltd. 平台為純資訊撮合服務，鑑定責任由鑑定方承擔。</p>
        <div className="flex gap-4">
          <a href="/about">關於我們</a>
          <a href="/terms">服務條款</a>
          <a href="/privacy">私隱政策</a>
          <a href="http://auth.localhost:3001">鑑定家入口</a>
        </div>
      </div>
    </footer>
  );
}
