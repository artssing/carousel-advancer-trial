const rows = [
  { id: 'auth_001', name: 'Milan Station 旺角', cat: '手袋', stars: 5, completed: 1247, dispute: '0.8%', eoExp: '2027-01-31', status: 'active' },
  { id: 'auth_002', name: 'Sole Classics', cat: '球鞋', stars: 4, completed: 456, dispute: '1.5%', eoExp: '2026-09-30', status: 'active' },
  { id: 'auth_003', name: '信和 CardLab', cat: 'TCG', stars: 5, completed: 892, dispute: '0.3%', eoExp: '2026-12-15', status: 'active' },
  { id: 'auth_004', name: 'Pawnex Central', cat: '手袋', stars: 0, completed: 0, dispute: '-', eoExp: '-', status: 'pending' },
];

export default function AuthenticatorsPage() {
  return (
    <div className="px-8 py-8">
      <h1 className="text-2xl font-bold">Authenticators</h1>
      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-400">
          <tr>
            <th className="pb-3">ID</th>
            <th className="pb-3">Name</th>
            <th className="pb-3">Category</th>
            <th className="pb-3">Stars</th>
            <th className="pb-3">Completed</th>
            <th className="pb-3">Dispute</th>
            <th className="pb-3">E&O Exp</th>
            <th className="pb-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-3 font-mono text-xs">{r.id}</td>
              <td>{r.name}</td>
              <td>{r.cat}</td>
              <td>{'★'.repeat(r.stars)}</td>
              <td>{r.completed}</td>
              <td>{r.dispute}</td>
              <td>{r.eoExp}</td>
              <td>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    r.status === 'active'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-amber-500/15 text-amber-300'
                  }`}
                >
                  {r.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
