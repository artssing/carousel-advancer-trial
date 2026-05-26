import { formatHKD } from '@authentik/utils';

const rows = [
  { id: 'ord_009', item: 'Chanel 19 Bag', price: 36500, status: 'authenticating', auth: 'Milan Station 旺角' },
  { id: 'ord_011', item: 'iPhone 15 Pro Max', price: 8500, status: 'shipped_to_buyer', auth: '先達 ProCheck' },
  { id: 'ord_013', item: 'Charizard PSA 10', price: 38000, status: 'auth_passed', auth: '信和 CardLab' },
];

export default function AdminOrdersPage() {
  return (
    <div className="px-8 py-8">
      <h1 className="text-2xl font-bold">Orders</h1>
      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-400">
          <tr>
            <th className="pb-3">ID</th>
            <th className="pb-3">Item</th>
            <th className="pb-3">Price</th>
            <th className="pb-3">Status</th>
            <th className="pb-3">Authenticator</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-3 font-mono text-xs">{r.id}</td>
              <td>{r.item}</td>
              <td>{formatHKD(r.price)}</td>
              <td>{r.status}</td>
              <td>{r.auth}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
