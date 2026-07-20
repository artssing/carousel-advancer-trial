'use client';

/**
 * Authenticator branch management — `/branches`.
 *
 * Owns the multi-address list that buyers see at checkout when picking
 * MEETUP_AUTH / MEETUP_3WAY. UI rules:
 *   - At least 1 active branch required before authenticator can accept
 *     meetup orders (server-enforced; UI surfaces warning)
 *   - Delete blocked if any non-terminal order uses the branch (server returns 400)
 *   - One branch can be marked primary (auto-selected at checkout)
 *
 * Lesson #16: Delete = 2-step inline confirm.
 * Lesson #8: districts come from @authentik/utils SSOT.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardContent, Label, Input, ConfirmDialog } from '@authentik/ui';
import { MapPin, Plus, Pencil, Trash2, Star, EyeOff, Eye } from 'lucide-react';
import { api, hasToken, ApiError } from '@/lib/api';
import { allDistricts, districtLabel } from '@authentik/utils';
import { AuthTopline, AuthContent } from '@/components/auth-topline';

type Branch = Awaited<ReturnType<typeof api.branches.list>>[number];

interface EditorState {
  mode: 'create' | 'edit';
  branchId: string | null;
  name: string;
  fullAddress: string;
  districtKey: string;
  businessHours: string;
  notes: string;
  contactPhone: string;
  contactWhatsapp: string;
  isPrimary: boolean;
}

const EMPTY_EDITOR: EditorState = {
  mode: 'create', branchId: null,
  name: '', fullAddress: '', districtKey: 'MK',
  businessHours: '', notes: '',
  contactPhone: '', contactWhatsapp: '',
  isPrimary: false,
};

export default function BranchesPage() {
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [savingId, setSavingId] = useState<string | 'new' | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  async function refresh() {
    const list = await api.branches.list();
    setBranches(list);
  }

  useEffect(() => {
    if (!hasToken()) { router.replace('/login'); return; }
    refresh().catch((e: any) => setError(e.message ?? '無法載入')).finally(() => setLoading(false));
  }, [router]);

  function openCreate() { setEditor({ ...EMPTY_EDITOR }); }
  function openEdit(b: Branch) {
    setEditor({
      mode: 'edit', branchId: b.id,
      name: b.name, fullAddress: b.fullAddress, districtKey: b.districtKey,
      businessHours: b.businessHours ?? '', notes: b.notes ?? '',
      contactPhone: b.contactPhone ?? '',
      contactWhatsapp: b.contactWhatsapp ?? '',
      isPrimary: b.isPrimary,
    });
  }
  function closeEditor() { setEditor(null); setError(null); }

  async function onSave() {
    if (!editor) return;
    if (!editor.name.trim() || !editor.fullAddress.trim()) {
      setError('分店名稱同地址必填');
      return;
    }
    setSavingId(editor.branchId ?? 'new');
    setError(null);
    try {
      if (editor.mode === 'create') {
        await api.branches.create({
          name: editor.name, fullAddress: editor.fullAddress,
          districtKey: editor.districtKey,
          businessHours: editor.businessHours || undefined,
          notes: editor.notes || undefined,
          contactPhone: editor.contactPhone || undefined,
          contactWhatsapp: editor.contactWhatsapp || undefined,
          isPrimary: editor.isPrimary,
        });
      } else if (editor.branchId) {
        await api.branches.update(editor.branchId, {
          name: editor.name, fullAddress: editor.fullAddress,
          districtKey: editor.districtKey,
          businessHours: editor.businessHours,
          notes: editor.notes,
          contactPhone: editor.contactPhone,
          contactWhatsapp: editor.contactWhatsapp,
          isPrimary: editor.isPrimary,
        });
      }
      await refresh();
      closeEditor();
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : '儲存失敗');
    } finally {
      setSavingId(null);
    }
  }

  async function onToggleActive(b: Branch) {
    setSavingId(b.id);
    try {
      await api.branches.update(b.id, { isActive: !b.isActive });
      await refresh();
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : '更新失敗');
    } finally {
      setSavingId(null);
    }
  }

  async function onSetPrimary(b: Branch) {
    setSavingId(b.id);
    try {
      await api.branches.update(b.id, { isPrimary: true });
      await refresh();
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : '更新失敗');
    } finally {
      setSavingId(null);
    }
  }

  async function onConfirmDelete(b: Branch) {
    setSavingId(b.id);
    setError(null);
    try {
      await api.branches.delete(b.id);
      await refresh();
      setDeleteConfirmId(null);
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : '刪除失敗');
    } finally {
      setSavingId(null);
    }
  }

  const activeCount = branches.filter((b) => b.isActive).length;

  return (
    <>
      <AuthTopline
        title="分店地址管理"
        subtitle="買家落單揀「鑑定師面交」/「三方面交」時，會由呢度顯示嘅 active 分店揀一個交收。"
        action={
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-authBrand-500 px-4 py-2 text-[13px] font-bold text-white shadow-auth-btn transition hover:bg-authBrand-600"
          >
            <Plus className="h-3.5 w-3.5" /> 新增分店
          </button>
        }
      />
      <AuthContent>

      {activeCount === 0 && !loading && (
        <div className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
          ⚠ 而家冇任何使用中嘅分店，買家無法揀你做面交鑑定。請新增最少 1 間。
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Editor (inline create / edit) */}
      {editor && (
        <Card className="mt-4 border-authBrand-border bg-authBrand-soft/40">
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-semibold text-authBrand-900">
              {editor.mode === 'create' ? '新增分店' : '編輯分店'}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="b-name">分店名稱</Label>
                <Input
                  id="b-name"
                  value={editor.name}
                  onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                  placeholder="例：旺角總店"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="b-district">區域</Label>
                <select
                  id="b-district"
                  value={editor.districtKey}
                  onChange={(e) => setEditor({ ...editor, districtKey: e.target.value })}
                  className="mt-1 h-10 w-full rounded-lg border border-line-2 bg-white px-3 text-sm"
                >
                  {allDistricts().map((d) => (
                    <option key={d.key} value={d.key}>{d.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label htmlFor="b-addr">完整地址</Label>
              <Input
                id="b-addr"
                value={editor.fullAddress}
                onChange={(e) => setEditor({ ...editor, fullAddress: e.target.value })}
                placeholder="例：旺角西洋菜南街 1A 號好望角大廈 5 樓 502 室"
                className="mt-1"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="b-hours">營業時間</Label>
                <Input
                  id="b-hours"
                  value={editor.businessHours}
                  onChange={(e) => setEditor({ ...editor, businessHours: e.target.value })}
                  placeholder="例：一至日 12:00-21:00"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="b-notes">注意事項</Label>
                <Input
                  id="b-notes"
                  value={editor.notes}
                  onChange={(e) => setEditor({ ...editor, notes: e.target.value })}
                  placeholder="例：樓上舖，請按門鈴"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Public contacts — 買家 checkout 揀分店時會睇到，方便預約 / 問路 */}
            <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3">
              <p className="text-[11px] font-medium text-amber-900">📞 公開聯絡（買家會睇到）</p>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <div>
                  <Label htmlFor="b-phone">電話</Label>
                  <Input
                    id="b-phone"
                    type="tel"
                    value={editor.contactPhone}
                    onChange={(e) => setEditor({ ...editor, contactPhone: e.target.value })}
                    placeholder="例：+852 9123 4567"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="b-wa">WhatsApp 號碼</Label>
                  <Input
                    id="b-wa"
                    type="tel"
                    inputMode="numeric"
                    value={editor.contactWhatsapp}
                    onChange={(e) => setEditor({ ...editor, contactWhatsapp: e.target.value })}
                    placeholder="852 91234567（淨係數字）"
                    className="mt-1"
                  />
                </div>
              </div>
              <p className="mt-1 text-[10px] text-amber-700">
                兩個都係 optional。WhatsApp 用純數字（含國家碼），會自動生成 wa.me 連結。
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editor.isPrimary}
                onChange={(e) => setEditor({ ...editor, isPrimary: e.target.checked })}
                className="h-4 w-4"
              />
              <span>設為主要分店（買家 checkout 預設揀呢間）</span>
            </label>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={onSave}
                disabled={savingId === (editor.branchId ?? 'new')}
              >
                {savingId ? '儲存中…' : (editor.mode === 'create' ? '新增' : '儲存')}
              </Button>
              <Button variant="outline" size="sm" onClick={closeEditor}>取消</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Branch list */}
      <div className="mt-6 space-y-3">
        {loading && <p className="text-sm text-neutral-text-muted">載入中…</p>}
        {!loading && branches.length === 0 && !editor && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-neutral-text-muted">
              仲未有分店。撳右上「新增分店」開始。
            </CardContent>
          </Card>
        )}
        {branches.map((b) => {
          const district = districtLabel(b.districtKey);
          return (
            <Card key={b.id} className={!b.isActive ? 'opacity-60' : ''}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                      <MapPin className="h-4 w-4 shrink-0 text-authBrand-500" />
                      {b.name}
                      {b.isPrimary && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-authBrand-soft px-1.5 py-0.5 text-[10px] font-semibold text-authBrand-600">
                          <Star className="h-2.5 w-2.5" /> 主要
                        </span>
                      )}
                      {district && (
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-neutral-text-muted">
                          {district}
                        </span>
                      )}
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${b.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-surface-2 text-neutral-text-muted'}`}>
                        {b.isActive ? '使用中' : '已暫停'}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-neutral-text">{b.fullAddress}</p>
                    {b.businessHours && (
                      <p className="mt-0.5 text-[11px] text-neutral-text-muted">營業：{b.businessHours}</p>
                    )}
                    {b.notes && (
                      <p className="mt-0.5 text-[11px] text-amber-700">⚠ {b.notes}</p>
                    )}
                    {(b.contactPhone || b.contactWhatsapp) && (
                      <p className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-neutral-text-muted">
                        {b.contactPhone && <span>📞 {b.contactPhone}</span>}
                        {b.contactWhatsapp && <span>💬 WA: {b.contactWhatsapp}</span>}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-1.5 border-t border-line pt-2">
                  {!b.isPrimary && b.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSetPrimary(b)}
                      disabled={savingId === b.id}
                    >
                      <Star className="mr-1 h-3 w-3" /> 設為主要
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onToggleActive(b)}
                    disabled={savingId === b.id}
                  >
                    {b.isActive ? (
                      <><EyeOff className="mr-1 h-3 w-3" /> 暫停接單</>
                    ) : (
                      <><Eye className="mr-1 h-3 w-3" /> 重新啟用</>
                    )}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(b)} disabled={savingId === b.id}>
                    <Pencil className="mr-1 h-3 w-3" /> 編輯
                  </Button>
                  {(
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-rose-600 hover:bg-rose-50"
                      onClick={() => setDeleteConfirmId(b.id)}
                      disabled={savingId === b.id}
                    >
                      <Trash2 className="mr-1 h-3 w-3" /> 刪除
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="mt-6 text-[10px] text-neutral-text-hint">
        刪除限制：如分店有進行中訂單，必須完成或取消後先可以刪除。可以暫停接單作過渡。
      </p>

      {/* ConfirmDialog v2（founder 2026-07-12，portal=authenticator） */}
      <ConfirmDialog
        open={!!deleteConfirmId}
        portal="authenticator"
        severity="danger"
        title="刪除呢間分店？"
        description={branches.find((x) => x.id === deleteConfirmId)?.name}
        consequence="呢個動作會將分店由你嘅公開檔案移除，買家將無法揀佢做面交點。有進行中訂單嘅分店 server 會擋。"
        confirmLabel="確認刪除"
        busy={savingId === deleteConfirmId}
        onConfirm={() => {
          const b = branches.find((x) => x.id === deleteConfirmId);
          if (b) onConfirmDelete(b);
        }}
        onCancel={() => setDeleteConfirmId(null)}
      />
      </AuthContent>
    </>
  );
}
