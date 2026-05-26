const rows = [
  { id: 'usr_001', email: 'andy@example.com', kyc: 'verified', joined: '2026-04-21', orders: 12 },
  { id: 'usr_002', email: 'gwen@example.com', kyc: 'pending', joined: '2026-05-25', orders: 0 },
  { id: 'usr_003', email: 'kelvin@example.com', kyc: 'verified', joined: '2026-03-11', orders: 4 },
];

export default function UsersPage() {
  return (
    <div className="px-8 py-8">
      <h1 className="text-2xl font-bold">Users</h1>
      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-400">
          <tr>
            <th className="pb-3">ID</th>
            <th className="pb-3">Email</th>
            <th className="pb-3">KYC</th>
            <th className="pb-3">Joined</th>
            <th className="pb-3">Orders</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-3 font-mono text-xs">{r.id}</td>
              <td>{r.email}</td>
              <td>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    r.kyc === 'verified'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-amber-500/15 text-amber-300'
                  }`}
                >
                  {r.kyc}
                </span>
              </td>
              <td>{r.joined}</td>
              <td>{r.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
