import React, { useEffect, useState } from 'react';
import { Lock, Plus, Trash2, Unlock, UserPlus, Users, X } from 'lucide-react';
import { classroomApi } from '@/utils/classroomApi';

interface GroupFormationModalProps {
  assignment: any;
  isStaff: boolean;
  canManageCourse: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

export const GroupFormationModal: React.FC<GroupFormationModalProps> = ({
  assignment,
  isStaff,
  canManageCourse,
  onClose,
  onChanged,
  onToast,
}) => {
  const [groups, setGroups] = useState<any[]>([]);
  const [myGroupId, setMyGroupId] = useState<number | null>(null);
  const [maxSize, setMaxSize] = useState<number>(assignment.max_group_size || 4);
  const [newName, setNewName] = useState('');
  const [memberEmailMap, setMemberEmailMap] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const data = await classroomApi.listAssignmentGroups(assignment.id);
      setGroups(data?.groups || []);
      setMyGroupId(data?.my_group_id ?? null);
      setMaxSize(Number(data?.max_group_size || 4));
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Failed to load groups', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, [assignment.id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const data = await classroomApi.createAssignmentGroup(assignment.id, newName.trim());
      onToast(data?.message || 'Group created', 'success');
      setNewName('');
      await Promise.all([loadGroups(), onChanged()]);
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Could not create group', 'error');
    }
  };

  const handleJoin = async (gid: number) => {
    try {
      const data = await classroomApi.joinGroup(gid);
      onToast(data?.message || 'Joined group', 'success');
      await Promise.all([loadGroups(), onChanged()]);
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Could not join group', 'error');
    }
  };

  const handleLeave = async (gid: number) => {
    try {
      const data = await classroomApi.leaveGroup(gid);
      onToast(data?.message || 'Left group', 'success');
      await Promise.all([loadGroups(), onChanged()]);
    } catch (err: any) {
      onToast(err?.response?.data?.detail || 'Could not leave group', 'error');
    }
  };

  return (
    <div className="modal-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
      <div className="modal-panel-enter w-full max-w-2xl rounded-2xl bg-white border border-[#DDD8CE] shadow-[var(--shadow-elevated)] p-6 space-y-4 max-h-[90vh] overflow-y-auto text-xs">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#E5E2DC]">
          <div>
            <h3 className="text-base font-semibold text-[#0A0A0C] flex items-center gap-2">
              <Users className="w-4 h-4 text-[#896ABD]" />
              <span>Team Formation — {assignment.title}</span>
            </h3>
            <p className="text-[#5C5B57] mt-0.5">
              Max team size: {maxSize} members. A student may join only <strong>one group</strong> in this assignment.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg border border-[#DDD8CE]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Create New Group */}
        {(isStaff || !myGroupId) && (
          <form onSubmit={handleCreate} className="flex items-center gap-2">
            <input
              type="text"
              required
              placeholder="Enter new group / team name (e.g. Alpha Builders)..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6]"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#E04F33] text-white font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Group</span>
            </button>
          </form>
        )}

        {loading ? (
          <p className="py-6 text-center text-[#5C5B57]">Loading assignment groups...</p>
        ) : groups.length === 0 ? (
          <p className="py-6 text-center text-[#5C5B57]">
            No groups created yet for this assignment. Create the first team above!
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {groups.map((g) => {
              const members = g.members || [];
              const isMine = Number(myGroupId) === Number(g.id);
              const isFull = members.length >= maxSize;
              return (
                <div
                  key={g.id}
                  className={`p-3.5 rounded-xl border space-y-2.5 ${
                    isMine
                      ? 'border-[#896ABD] bg-[#896ABD]/5'
                      : 'border-[#E5E2DC] bg-[#FAF9F6]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm text-[#0A0A0C] truncate">
                      {g.name}{' '}
                      <span className="font-mono-tabular text-[11px] font-normal text-[#5C5B57]">
                        ({members.length}/{maxSize})
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {g.is_locked && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 font-mono-tabular text-[10px]">
                          Locked
                        </span>
                      )}
                      {isStaff && (
                        <button
                          type="button"
                          onClick={async () => {
                            await classroomApi.toggleLockGroup(g.id, !g.is_locked);
                            await loadGroups();
                          }}
                          className="p-1 rounded border border-[#DDD8CE] bg-white"
                          title={g.is_locked ? 'Unlock group' : 'Lock group'}
                        >
                          {g.is_locked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    {members.map((m: any) => (
                      <div key={m.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-white border border-[#E5E2DC]">
                        <span className="truncate font-medium text-[#0A0A0C]">
                          {m.student_name || m.student_email}
                          {m.role === 'leader' && (
                            <span className="ml-1.5 text-[10px] font-mono-tabular text-[#E04F33]">
                              (Leader)
                            </span>
                          )}
                        </span>
                        {canManageCourse && (
                          <button
                            type="button"
                            onClick={async () => {
                              await classroomApi.removeGroupMember(g.id, m.student_id);
                              await Promise.all([loadGroups(), onChanged()]);
                            }}
                            className="text-rose-600 hover:bg-rose-50 p-0.5 rounded"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {!isStaff && (
                    <div className="pt-1">
                      {isMine ? (
                        <button
                          type="button"
                          disabled={g.is_locked}
                          onClick={() => handleLeave(g.id)}
                          className="w-full py-1.5 rounded-lg border border-rose-500/30 text-rose-700 font-semibold disabled:opacity-50"
                        >
                          {g.is_locked ? 'Group Locked' : 'Leave Group'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={Boolean(myGroupId) || isFull || g.is_locked}
                          onClick={() => handleJoin(g.id)}
                          className="w-full py-1.5 rounded-lg bg-[#0A0A0C] hover:bg-[#E04F33] text-white font-semibold disabled:opacity-45"
                        >
                          {myGroupId ? 'Already in a group' : isFull ? 'Group Full' : 'Join Group'}
                        </button>
                      )}
                    </div>
                  )}

                  {canManageCourse && !isFull && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const email = (memberEmailMap[g.id] || '').trim();
                        if (!email) return;
                        try {
                          await classroomApi.addGroupMember(g.id, email);
                          setMemberEmailMap({ ...memberEmailMap, [g.id]: '' });
                          await Promise.all([loadGroups(), onChanged()]);
                        } catch (err: any) {
                          onToast(err?.response?.data?.detail || 'Could not add member', 'error');
                        }
                      }}
                      className="flex items-center gap-1 pt-1"
                    >
                      <input
                        type="email"
                        placeholder="Add student email..."
                        value={memberEmailMap[g.id] || ''}
                        onChange={(e) =>
                          setMemberEmailMap({ ...memberEmailMap, [g.id]: e.target.value })
                        }
                        className="flex-1 px-2 py-1 rounded-lg border border-[#DDD8CE] bg-white"
                      />
                      <button type="submit" className="p-1.5 rounded-lg bg-[#0A0A0C] text-white">
                        <UserPlus className="w-3 h-3" />
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
