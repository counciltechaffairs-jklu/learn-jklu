import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bookmark,
  BookOpen,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  FolderPlus,
  Lock,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { classroomApi } from '@/utils/classroomApi';

interface ModulesResourcesTabProps {
  offeringId: number;
  courseCode: string;
  isStaff: boolean;
  canCreate: boolean;
  allowedSections: string[];
  previewSection?: string | null;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

export const ModulesResourcesTab: React.FC<ModulesResourcesTabProps> = ({
  offeringId,
  courseCode,
  isStaff,
  canCreate,
  allowedSections,
  previewSection,
  onToast,
}) => {
  const [modules, setModules] = useState<any[]>([]);
  const [pastPapers, setPastPapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modForm, setModForm] = useState({ title: '', description: '', target_section: 'ALL', unlock_at: '' });
  const [itemTargetModId, setItemTargetModId] = useState<number | null>(null);
  const [itemForm, setItemForm] = useState({ title: '', resource_url: '', mode: 'FILE' as 'FILE' | 'LINK' });
  const [itemFile, setItemFile] = useState<File | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [mData, pData] = await Promise.all([
        classroomApi.listModules(offeringId, previewSection),
        classroomApi.getCoursePastPapers(offeringId),
      ]);
      setModules(mData?.modules || []);
      setPastPapers(pData?.papers || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [offeringId, previewSection]);

  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modForm.title.trim()) return;
    try {
      await classroomApi.createModule(offeringId, {
        title: modForm.title.trim(),
        description: modForm.description.trim(),
        target_sections: modForm.target_section === 'ALL' ? ['ALL'] : [modForm.target_section],
        unlock_at: modForm.unlock_at ? new Date(modForm.unlock_at).toISOString() : null,
      });
      onToast('Module created', 'success');
      setModForm({ title: '', description: '', target_section: 'ALL', unlock_at: '' });
      await loadData();
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Could not create module', 'error');
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemTargetModId) return;
    try {
      if (itemForm.mode === 'FILE' && itemFile) {
        const fd = new FormData();
        fd.append('file', itemFile);
        fd.append('title', itemForm.title.trim() || itemFile.name);
        await classroomApi.addModuleFileItem(itemTargetModId, fd);
      } else {
        await classroomApi.addModuleLinkItem(itemTargetModId, {
          title: itemForm.title.trim(),
          resource_url: itemForm.resource_url.trim(),
          item_type: 'LINK',
        });
      }
      onToast('Resource added to unit', 'success');
      setItemTargetModId(null);
      setItemForm({ title: '', resource_url: '', mode: 'FILE' });
      setItemFile(null);
      await loadData();
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Failed to add material', 'error');
    }
  };

  const handleDownloadFile = async (item: any) => {
    try {
      const blobData = await classroomApi.downloadModuleItemFile(item.id);
      const url = URL.createObjectURL(blobData);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.file_name || item.title || 'material';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Failed to download file', 'error');
    }
  };

  const toggleProgress = async (itemId: number, patch: { bookmarked?: boolean; completed?: boolean }) => {
    try {
      await classroomApi.updateModuleItemProgress(itemId, patch);
      setModules((prev) =>
        prev.map((m) => ({
          ...m,
          items: (m.items || []).map((it: any) =>
            it.id === itemId ? { ...it, ...patch } : it
          ),
        }))
      );
    } catch {}
  };

  const allItems = modules.flatMap((m) => m.items || []);
  const completedCount = allItems.filter((i: any) => i.completed).length;
  const pct = allItems.length > 0 ? Math.round((completedCount / allItems.length) * 100) : 0;

  return (
    <div className="space-y-6 text-xs">
      {/* Header + Progress Bar */}
      <div className="rounded-2xl border border-[#DDD8CE] bg-white p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-[#0A0A0C] flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#896ABD]" />
            <span>Structured Course Modules &amp; Lecture Slides</span>
          </h3>
          <p className="text-[#5C5B57] mt-0.5">
            Organized unit-by-unit slides, notebooks, lab manuals, and verified {courseCode} past papers.
          </p>
        </div>
        {allItems.length > 0 && (
          <div className="min-w-[200px] space-y-1">
            <div className="flex justify-between font-mono-tabular text-[11px]">
              <span className="text-[#5C5B57]">Study Progress</span>
              <span className="font-semibold text-[#0A0A0C]">
                {completedCount}/{allItems.length} ({pct}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-[#E5E2DC] overflow-hidden">
              <div
                className="h-full w-full origin-left bg-[#10B981] transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
                style={{ transform: `scaleX(${Math.max(0, Math.min(1, Number(pct || 0) / 100))})` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Staff Create Module Form */}
      {canCreate && !previewSection && (
        <form onSubmit={handleCreateModule} className="rounded-2xl border border-[#DDD8CE] bg-white p-4 grid grid-cols-1 sm:grid-cols-5 gap-2.5">
          <input
            type="text"
            required
            placeholder="New Unit / Module Title (e.g. Unit 2: Balanced Trees)"
            value={modForm.title}
            onChange={(e) => setModForm({ ...modForm, title: e.target.value })}
            className="sm:col-span-2 px-3 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6]"
          />
          <select
            value={modForm.target_section}
            onChange={(e) => setModForm({ ...modForm, target_section: e.target.value })}
            className="px-2.5 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6] font-mono-tabular"
          >
            <option value="ALL">All Sections</option>
            {allowedSections
              .filter((s) => s !== 'ALL')
              .map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
          </select>
          <input
            type="datetime-local"
            title="Optional unlock date/time"
            value={modForm.unlock_at}
            onChange={(e) => setModForm({ ...modForm, unlock_at: e.target.value })}
            className="px-2.5 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6]"
          />
          <button type="submit" className="px-4 py-2 rounded-xl bg-[#0A0A0C] hover:bg-[#E04F33] text-white font-semibold inline-flex items-center justify-center gap-1.5">
            <FolderPlus className="w-3.5 h-3.5" /> Add Unit
          </button>
        </form>
      )}

      {/* Module List */}
      {loading ? (
        <p className="text-center py-6 text-[#5C5B57]">Loading course materials...</p>
      ) : modules.length === 0 ? (
        <div className="rounded-2xl border border-[#DDD8CE] bg-white p-8 text-center text-[#5C5B57]">
          No unit modules uploaded yet for {courseCode}.
        </div>
      ) : (
        <div className="space-y-4">
          {modules.map((m) => (
            <div key={m.id} className="rounded-2xl border border-[#DDD8CE] bg-white overflow-hidden">
              <div className="px-5 py-3.5 bg-[#FAF9F6] border-b border-[#E5E2DC] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-semibold text-[#0A0A0C]">{m.title}</h4>
                    <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] bg-[#896ABD]/12 text-[#5B3B96] font-semibold">
                      {(m.target_sections || ['ALL']).join(', ')}
                    </span>
                    {m.is_locked && (
                      <span className="px-2 py-0.5 rounded font-mono-tabular text-[10px] bg-amber-500/15 text-amber-800 inline-flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Unlocks {new Date(m.unlock_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                  {m.description && <p className="text-[#5C5B57] mt-0.5">{m.description}</p>}
                </div>

                {m.can_edit && !previewSection && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setItemTargetModId(m.id)}
                      className="px-3 py-1.5 rounded-lg bg-[#E04F33] text-white font-semibold inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Material
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await classroomApi.deleteModule(m.id);
                        await loadData();
                      }}
                      className="p-1.5 rounded-lg border border-rose-500/25 text-rose-600 bg-white"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="divide-y divide-[#E5E2DC]/70">
                {(m.items || []).length === 0 ? (
                  <div className="p-4 text-[#5C5B57] italic">No files or links in this unit yet.</div>
                ) : (
                  (m.items || []).map((it: any) => (
                    <div key={it.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleProgress(it.id, { completed: !it.completed })}
                          title={it.completed ? 'Completed' : 'Mark as completed'}
                          className={`p-1 rounded-full border transition-colors ${
                            it.completed
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : 'border-[#DDD8CE] text-[#8E8D88] hover:border-[#10B981]'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                        <div className="min-w-0">
                          <div className="font-semibold text-[#0A0A0C] truncate">{it.title}</div>
                          <div className="text-[10px] font-mono-tabular text-[#5C5B57]">
                            {it.has_file
                              ? `${it.file_name} (${Math.max(1, Math.round((it.file_size || 1024) / 1024))} KB)`
                              : it.resource_url}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleProgress(it.id, { bookmarked: !it.bookmarked })}
                          className={`p-1.5 rounded-lg border ${
                            it.bookmarked
                              ? 'border-[#896ABD] bg-[#896ABD]/10 text-[#5B3B96]'
                              : 'border-[#DDD8CE] text-[#5C5B57]'
                          }`}
                          title="Bookmark"
                        >
                          <Bookmark className="w-3.5 h-3.5" />
                        </button>
                        {it.has_file ? (
                          <button
                            type="button"
                            onClick={() => handleDownloadFile(it)}
                            className="px-3 py-1.5 rounded-lg bg-[#0A0A0C] hover:bg-[#E04F33] text-white font-semibold inline-flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" /> Open / Download
                          </button>
                        ) : (
                          <a
                            href={it.resource_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg border border-[#DDD8CE] bg-[#FAF9F6] hover:border-[#896ABD] font-semibold inline-flex items-center gap-1 text-[#5B3B96]"
                          >
                            <ExternalLink className="w-3 h-3" /> Open Link
                          </a>
                        )}
                        {m.can_edit && !previewSection && (
                          <button
                            type="button"
                            onClick={async () => {
                              await classroomApi.deleteModuleItem(it.id);
                              await loadData();
                            }}
                            className="p-1.5 rounded-lg border border-rose-500/25 text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Auto-Linked Approved Past Papers for Course Code */}
      <div className="rounded-2xl border border-[#DDD8CE] bg-white p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-[#0A0A0C] flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#E04F33]" />
            <span>Auto-Linked Past Question Papers ({courseCode})</span>
          </h4>
          <Link
            to={`/past-papers?q=${encodeURIComponent(courseCode)}`}
            className="text-xs font-semibold text-[#896ABD] hover:underline"
          >
            Browse All Archive →
          </Link>
        </div>
        {pastPapers.length === 0 ? (
          <p className="text-[#5C5B57]">No approved past papers archived for {courseCode} yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {pastPapers.map((p) => (
              <Link
                key={p.id}
                to={`/past-papers?q=${encodeURIComponent(courseCode)}`}
                className="p-3 rounded-xl border border-[#E5E2DC] bg-[#FAF9F6] hover:border-[#896ABD] flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-[#0A0A0C] truncate">{p.title}</div>
                  <div className="font-mono-tabular text-[11px] text-[#5C5B57]">
                    {p.paper_type} · {p.exam_session || p.year} · Sem {p.semester}
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-[#896ABD] shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Add Material Modal */}
      {itemTargetModId && (
        <div className="modal-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="modal-panel-enter w-full max-w-md rounded-2xl bg-white border border-[#DDD8CE] shadow-[var(--shadow-elevated)] p-6 space-y-4">
            <h4 className="text-base font-semibold text-[#0A0A0C]">Add Slide, PDF or Link</h4>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#FAF9F6] border border-[#E5E2DC]">
              <button
                type="button"
                onClick={() => setItemForm({ ...itemForm, mode: 'FILE' })}
                className={`py-1.5 rounded-lg font-semibold ${itemForm.mode === 'FILE' ? 'bg-[#0A0A0C] text-white' : ''}`}
              >
                Upload File (≤25MB)
              </button>
              <button
                type="button"
                onClick={() => setItemForm({ ...itemForm, mode: 'LINK' })}
                className={`py-1.5 rounded-lg font-semibold ${itemForm.mode === 'LINK' ? 'bg-[#0A0A0C] text-white' : ''}`}
              >
                External Link
              </button>
            </div>
            <form onSubmit={handleAddItem} className="space-y-3">
              <input
                type="text"
                required={itemForm.mode === 'LINK'}
                placeholder="Material Title (e.g. Lecture 4 Slides)"
                value={itemForm.title}
                onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6]"
              />
              {itemForm.mode === 'FILE' ? (
                <label className="flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-[#896ABD]/40 cursor-pointer bg-[#FAF9F6]">
                  <Upload className="w-4 h-4 text-[#896ABD]" />
                  <span>{itemFile ? itemFile.name : 'Choose PDF / PPTX / DOCX / ZIP / IPYNB'}</span>
                  <input
                    type="file"
                    required
                    accept=".pdf,.pptx,.ppt,.docx,.doc,.zip,.png,.jpg,.jpeg,.txt,.py,.ipynb,.csv"
                    onChange={(e) => setItemFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
              ) : (
                <input
                  type="url"
                  required
                  placeholder="https://drive.google.com/... or YouTube recording"
                  value={itemForm.resource_url}
                  onChange={(e) => setItemForm({ ...itemForm, resource_url: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6]"
                />
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setItemTargetModId(null)}
                  className="px-3.5 py-2 rounded-xl border border-[#DDD8CE]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#E04F33] text-white font-semibold"
                >
                  Add to Unit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
