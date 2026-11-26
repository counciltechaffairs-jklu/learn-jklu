import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Upload,
  Save,
  Search,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { classroomApi } from '@/utils/classroomApi';

interface RosterStudent {
  id: number;
  student_id?: number | null;
  roll_no?: string | null;
  student_name?: string | null;
  student_email: string;
  section?: string | null;
}

interface AssignmentItem {
  id: number;
  title: string;
  assignment_type?: string;
  max_marks: number;
  target_sections?: string[];
  submissions?: Array<{
    id?: number;
    assignment_id?: number;
    student_id?: number | null;
    student_email?: string | null;
    student_section?: string | null;
    can_grade_submission?: boolean;
    marks_obtained?: number | string | null;
    feedback?: string | null;
    upload_mode?: string | null;
    submission_url?: string | null;
  }>;
}

interface ExcelMarksSheetProps {
  offeringId: number;
  courseCode: string;
  roster: RosterStudent[];
  assignments: AssignmentItem[];
  sections?: string[];
  assignedSections?: string[];
  onMarksSaved: () => Promise<void> | void;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

function makeCellKey(email: string, assignmentId: number) {
  return `${String(email || '').trim().toLowerCase()}::${assignmentId}`;
}

export const ExcelMarksSheet: React.FC<ExcelMarksSheetProps> = ({
  offeringId,
  courseCode,
  roster,
  assignments,
  sections = [],
  assignedSections = ['ALL'],
  onMarksSaved,
  showToast,
}) => {
  const isUnrestricted = useMemo(
    () =>
      !assignedSections ||
      assignedSections.length === 0 ||
      assignedSections.some((s) => String(s).trim().toUpperCase() === 'ALL'),
    [assignedSections]
  );

  const [selectedSection, setSelectedSection] = useState<string>(() =>
    !isUnrestricted && assignedSections.length === 1 ? assignedSections[0] : 'ALL'
  );
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [dirtyMarks, setDirtyMarks] = useState<Record<string, string>>({});
  const [dirtyFeedback, setDirtyFeedback] = useState<Record<string, string>>({});
  const [savingBulk, setSavingBulk] = useState(false);
  const [downloadingXlsx, setDownloadingXlsx] = useState(false);
  const [uploadingXlsx, setUploadingXlsx] = useState(false);
  const [uploadReport, setUploadReport] = useState<any | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Reset unsaved grid state when switching classrooms
  useEffect(() => {
    setDirtyMarks({});
    setDirtyFeedback({});
    setUploadReport(null);
    setSelectedAssignmentId('ALL');
    setSelectedSection(
      !isUnrestricted && assignedSections.length === 1 ? assignedSections[0] : 'ALL'
    );
  }, [offeringId, isUnrestricted, assignedSections]);

  const availableSections = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (val: string) => {
      const clean = String(val || '').trim();
      if (!clean || /^all$/i.test(clean)) return;
      const key = clean.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(clean);
      }
    };
    sections.forEach(add);
    (roster || []).forEach((r) => add(r.section || 'Sec A'));
    return out.length > 0 ? out : ['Sec A'];
  }, [sections, roster]);

  const isMyAssignedSection = (sec: string) => {
    if (isUnrestricted) return true;
    const target = String(sec || 'Sec A').trim().toLowerCase();
    return assignedSections.some((s) => String(s).trim().toLowerCase() === target);
  };

  const canEditCell = (asgn: AssignmentItem, stu: RosterStudent) => {
    if (isUnrestricted) return true;
    const targets =
      Array.isArray(asgn.target_sections) && asgn.target_sections.length > 0
        ? asgn.target_sections
        : ['ALL'];
    // If posted to All Sections, ANY course professor or grading TA can grade it
    if (targets.some((t) => String(t).trim().toUpperCase() === 'ALL')) {
      return true;
    }
    const allTargetsMine = targets.every((t) => isMyAssignedSection(t));
    return allTargetsMine && isMyAssignedSection(stu.section || 'Sec A');
  };

  const submissionLookup = useMemo(() => {
    const map = new Map<
      string,
      { marks: string; feedback: string; hasSubmission: boolean }
    >();
    for (const asgn of assignments || []) {
      const subs = Array.isArray(asgn.submissions) ? asgn.submissions : [];
      for (const s of subs) {
        const email = String(s.student_email || '').trim().toLowerCase();
        if (!email) continue;
        const marks =
          s.marks_obtained !== null && s.marks_obtained !== undefined
            ? String(Number(s.marks_obtained))
            : '';
        map.set(makeCellKey(email, Number(asgn.id)), {
          marks,
          feedback: s.feedback ? String(s.feedback) : '',
          hasSubmission: true,
        });
      }
    }
    return map;
  }, [assignments]);

  const visibleAssignments = useMemo(() => {
    const base = assignments || [];
    if (selectedAssignmentId !== 'ALL') {
      const targetId = Number(selectedAssignmentId);
      return base.filter((a) => Number(a.id) === targetId);
    }
    if (selectedSection === 'ALL') return base;
    return base.filter((a) => {
      const targets =
        Array.isArray(a.target_sections) && a.target_sections.length > 0
          ? a.target_sections
          : ['ALL'];
      return (
        targets.some((t) => String(t).trim().toUpperCase() === 'ALL') ||
        targets.some(
          (t) => String(t).trim().toLowerCase() === selectedSection.toLowerCase()
        )
      );
    });
  }, [assignments, selectedAssignmentId, selectedSection]);

  const singleAssignment =
    selectedAssignmentId !== 'ALL' && visibleAssignments.length === 1
      ? visibleAssignments[0]
      : null;

  const filteredRoster = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = (Array.isArray(roster) ? roster : []).filter((r) => {
      if (selectedSection === 'ALL') return true;
      return (
        String(r.section || 'Sec A')
          .trim()
          .toLowerCase() === selectedSection.toLowerCase()
      );
    });
    if (!q) return list;
    return list.filter((r) => {
      const hay = `${r.roll_no || ''} ${r.student_name || ''} ${r.student_email || ''} ${
        r.section || ''
      }`.toLowerCase();
      return hay.includes(q);
    });
  }, [roster, searchQuery, selectedSection]);

  const getCellDisplayValue = (email: string, assignmentId: number) => {
    const key = makeCellKey(email, assignmentId);
    if (Object.prototype.hasOwnProperty.call(dirtyMarks, key)) {
      return dirtyMarks[key];
    }
    return submissionLookup.get(key)?.marks ?? '';
  };

  const getFeedbackDisplayValue = (email: string, assignmentId: number) => {
    const key = makeCellKey(email, assignmentId);
    if (Object.prototype.hasOwnProperty.call(dirtyFeedback, key)) {
      return dirtyFeedback[key];
    }
    return submissionLookup.get(key)?.feedback ?? '';
  };

  const isCellOutOfRange = (rawVal: string, maxMarks: number) => {
    const trimmed = rawVal.trim();
    if (!trimmed) return false;
    const num = Number(trimmed);
    return !Number.isFinite(num) || num < 0 || num > Number(maxMarks || 100);
  };

  const validationErrorsCount = useMemo(() => {
    let count = 0;
    const maxMap = new Map<number, number>();
    for (const a of assignments || []) {
      maxMap.set(Number(a.id), Number(a.max_marks || 100));
    }
    for (const [key, rawVal] of Object.entries(dirtyMarks)) {
      const aid = Number(key.split('::')[1]);
      const maxM = maxMap.get(aid) ?? 100;
      if (isCellOutOfRange(rawVal, maxM)) count++;
    }
    return count;
  }, [dirtyMarks, assignments]);

  const dirtyCount = useMemo(() => {
    const uniqueKeys = new Set([
      ...Object.keys(dirtyMarks),
      ...Object.keys(dirtyFeedback),
    ]);
    return uniqueKeys.size;
  }, [dirtyMarks, dirtyFeedback]);

  const handleMarkChange = (
    email: string,
    assignmentId: number,
    nextVal: string
  ) => {
    const key = makeCellKey(email, assignmentId);
    const savedVal = submissionLookup.get(key)?.marks ?? '';
    setDirtyMarks((prev) => {
      const copy = { ...prev };
      if (nextVal.trim() === savedVal.trim()) {
        delete copy[key];
      } else {
        copy[key] = nextVal;
      }
      return copy;
    });
  };

  const handleFeedbackChange = (
    email: string,
    assignmentId: number,
    nextVal: string
  ) => {
    const key = makeCellKey(email, assignmentId);
    const savedVal = submissionLookup.get(key)?.feedback ?? '';
    setDirtyFeedback((prev) => {
      const copy = { ...prev };
      if (nextVal === savedVal) {
        delete copy[key];
      } else {
        copy[key] = nextVal;
      }
      return copy;
    });
  };

  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colIdx: number
  ) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = cellRefs.current[`${rowIdx + 1}:${colIdx}`];
      if (next) {
        next.focus();
        next.select();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = cellRefs.current[`${rowIdx - 1}:${colIdx}`];
      if (prev) {
        prev.focus();
        prev.select();
      }
    }
  };

  const handleMultiCellPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    startRowIdx: number,
    startColIdx: number
  ) => {
    const clip = e.clipboardData?.getData('text/plain') || '';
    if (!clip || (!clip.includes('\t') && !clip.includes('\n'))) {
      return;
    }
    e.preventDefault();
    const lines = clip
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    let pastedCells = 0;
    const nextDirty: Record<string, string> = { ...dirtyMarks };

    lines.forEach((line, rOffset) => {
      const student = filteredRoster[startRowIdx + rOffset];
      if (!student || !student.student_id) return;
      const cells = line.split('\t');
      cells.forEach((cellVal, cOffset) => {
        const asgn = visibleAssignments[startColIdx + cOffset];
        if (!asgn || !canEditCell(asgn, student)) return;
        const cleaned = cellVal.trim();
        if (!cleaned) return;
        const key = makeCellKey(student.student_email, Number(asgn.id));
        nextDirty[key] = cleaned;
        pastedCells++;
      });
    });

    setDirtyMarks(nextDirty);
    if (pastedCells > 0) {
      showToast(
        `Pasted ${pastedCells} cell value${pastedCells === 1 ? '' : 's'} into spreadsheet. Click Save All Marks to publish.`,
        'success'
      );
    }
  };

  const handleDownloadWorkbook = async () => {
    if (downloadingXlsx) return;
    setDownloadingXlsx(true);
    try {
      const params = new URLSearchParams();
      if (selectedAssignmentId !== 'ALL') {
        params.set('assignment_id', selectedAssignmentId);
      }
      if (selectedSection !== 'ALL') {
        params.set('section', selectedSection);
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      const rawBlob = await classroomApi.downloadMarksWorkbook(offeringId, query);
      const blob = new Blob([rawBlob], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${courseCode || 'COURSE'}${
        selectedSection !== 'ALL' ? `_${selectedSection.replace(/\s+/g, '')}` : ''
      }_Marks_Sheet.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1500);
      showToast('Downloaded official Excel marksheet (.xlsx)!', 'success');
    } catch (err: any) {
      showToast(
        err?.response?.data?.detail || 'Failed to download Excel marksheet',
        'error'
      );
    } finally {
      setDownloadingXlsx(false);
    }
  };

  const handleUploadWorkbook = async (file: File | null | undefined) => {
    if (!file || uploadingXlsx) return;
    setUploadingXlsx(true);
    setUploadReport(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (selectedAssignmentId !== 'ALL') {
        fd.append('assignment_id', selectedAssignmentId);
      }
      const resData = await classroomApi.uploadMarksWorkbook(offeringId, fd);
      setUploadReport(resData || null);
      setDirtyMarks({});
      setDirtyFeedback({});
      showToast(
        resData?.message || 'Excel marks sheet uploaded and grades updated!',
        'success'
      );
      await onMarksSaved();
    } catch (err: any) {
      showToast(
        err?.response?.data?.detail ||
          err?.message ||
          'Failed to import Excel marks sheet',
        'error'
      );
    } finally {
      setUploadingXlsx(false);
    }
  };

  const handleSaveAllDirty = async () => {
    if (dirtyCount === 0 || savingBulk) return;
    if (validationErrorsCount > 0) {
      showToast(
        `Fix ${validationErrorsCount} invalid mark cell(s) highlighted in red before saving.`,
        'error'
      );
      return;
    }

    const keys = Array.from(
      new Set([...Object.keys(dirtyMarks), ...Object.keys(dirtyFeedback)])
    );
    const entries: Array<{
      student_email: string;
      assignment_id: number;
      marks_obtained: number;
      feedback?: string;
    }> = [];

    let skippedBlank = 0;
    for (const key of keys) {
      const [email, aidStr] = key.split('::');
      const aid = Number(aidStr);
      const rawMark = Object.prototype.hasOwnProperty.call(dirtyMarks, key)
        ? dirtyMarks[key]
        : submissionLookup.get(key)?.marks ?? '';
      if (String(rawMark).trim() === '') {
        skippedBlank++;
        continue;
      }
      const num = Number(rawMark);
      if (!Number.isFinite(num)) continue;
      const entry: {
        student_email: string;
        assignment_id: number;
        marks_obtained: number;
        feedback?: string;
      } = {
        student_email: email,
        assignment_id: aid,
        marks_obtained: num,
      };
      if (Object.prototype.hasOwnProperty.call(dirtyFeedback, key)) {
        entry.feedback = dirtyFeedback[key];
      }
      entries.push(entry);
    }

    if (entries.length === 0) {
      if (skippedBlank > 0) {
        showToast('Blank cells are skipped — enter numeric marks to save.', 'error');
      }
      return;
    }

    setSavingBulk(true);
    try {
      const resData = await classroomApi.saveMarksBulk(offeringId, entries);
      setDirtyMarks({});
      setDirtyFeedback({});
      setUploadReport(resData || null);
      showToast(resData?.message || 'Marks saved successfully!', 'success');
      await onMarksSaved();
    } catch (err: any) {
      showToast(
        err?.response?.data?.detail || err?.message || 'Failed to save bulk marks',
        'error'
      );
    } finally {
      setSavingBulk(false);
    }
  };

  const totalVisibleMax = useMemo(
    () => visibleAssignments.reduce((acc, a) => acc + Number(a.max_marks || 0), 0),
    [visibleAssignments]
  );

  return (
    <section className="rounded-2xl border border-[#E5E2DC] bg-white/95 shadow-[0_6px_24px_rgba(10,10,12,0.04)] p-5 sm:p-6 space-y-4">
      {/* Header & Excel Actions Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono-tabular text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-800">
              Excel Marks Sheet &amp; Live Grid
            </span>
            {dirtyCount > 0 && (
              <span className="font-mono-tabular text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                {dirtyCount} unsaved change{dirtyCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <h3 className="text-lg font-bold text-[#0A0A0C] mt-1">
            Assign Student Marks — In Browser or via Microsoft Excel
          </h3>
          <p className="text-xs text-[#5C5B57] mt-0.5">
            Download the ready `.xlsx` sheet, fill marks offline &amp; upload — or enter marks directly below (supports paste from Excel / Google Sheets &amp; Enter/Arrow navigation).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 text-xs">
          <button
            type="button"
            disabled={downloadingXlsx}
            onClick={handleDownloadWorkbook}
            className="px-3.5 py-2 rounded-xl border border-[#DDD8CE] bg-white hover:border-[#896ABD] text-[#0A0A0C] font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-[#896ABD]" />
            <span>{downloadingXlsx ? 'Preparing .xlsx...' : 'Download Excel (.xlsx)'}</span>
          </button>

          <label
            className={`px-3.5 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6] hover:border-[#E04F33] hover:text-[#E04F33] text-[#0A0A0C] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              uploadingXlsx ? 'opacity-60 pointer-events-none' : ''
            }`}
          >
            <Upload className="w-3.5 h-3.5 text-[#E04F33]" />
            <span>{uploadingXlsx ? 'Importing Marks...' : 'Upload Filled Excel (.xlsx/.csv)'}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                handleUploadWorkbook(f);
                e.currentTarget.value = '';
              }}
            />
          </label>

          {dirtyCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setDirtyMarks({});
                setDirtyFeedback({});
              }}
              className="px-3 py-2 rounded-xl border border-[#E5E2DC] text-[#5C5B57] hover:text-[#0A0A0C] font-medium inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Discard</span>
            </button>
          )}

          <button
            type="button"
            disabled={savingBulk || dirtyCount === 0 || validationErrorsCount > 0}
            onClick={handleSaveAllDirty}
            className="px-4 py-2 rounded-xl bg-[#E04F33] hover:opacity-90 disabled:opacity-45 text-white font-semibold inline-flex items-center gap-1.5 shadow-sm transition-opacity"
          >
            <Save className="w-3.5 h-3.5" />
            <span>
              {savingBulk
                ? 'Saving Marks...'
                : dirtyCount > 0
                ? `Save All Marks (${dirtyCount})`
                : 'Save All Marks'}
            </span>
          </button>
        </div>
      </div>

      {/* Filter & Assignment Selector Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#896ABD] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter student by name, roll no, email, or section..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#DDD8CE] bg-[#FAF9F6] text-xs text-[#0A0A0C] focus:outline-none focus:border-[#896ABD]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="excel-section-filter"
              className="font-mono-tabular text-[11px] uppercase text-[#5C5B57] font-semibold"
            >
              Section:
            </label>
            <select
              id="excel-section-filter"
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[#DDD8CE] bg-white text-xs font-medium text-[#0A0A0C] focus:outline-none focus:border-[#896ABD]"
            >
              <option value="ALL">All Sections ({roster?.length || 0} students)</option>
              {availableSections.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                  {!isUnrestricted && isMyAssignedSection(sec) ? ' (Your Section)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label
              htmlFor="excel-assignment-scope"
              className="font-mono-tabular text-[11px] uppercase text-[#5C5B57] font-semibold"
            >
              Sheet View:
            </label>
            <select
              id="excel-assignment-scope"
              value={selectedAssignmentId}
              onChange={(e) => setSelectedAssignmentId(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[#DDD8CE] bg-white text-xs font-medium text-[#0A0A0C] focus:outline-none focus:border-[#896ABD]"
            >
              <option value="ALL">
                All Assignments ({assignments?.length || 0} columns)
              </option>
              {(assignments || []).map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.title} (Max {a.max_marks})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Upload / Save Summary Banner */}
      {uploadReport && (
        <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/80 text-xs space-y-1.5">
          <div className="flex items-center justify-between gap-2 font-semibold text-emerald-950">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{uploadReport.message || 'Marks updated.'}</span>
            </div>
            <button
              type="button"
              onClick={() => setUploadReport(null)}
              className="text-[11px] underline text-emerald-800"
            >
              Dismiss
            </button>
          </div>
          <p className="font-mono-tabular text-[11px] text-emerald-900">
            Cells Updated: {uploadReport.updated_marks ?? 0} · Students Matched:{' '}
            {uploadReport.students_matched ?? 0} · Skipped Cells:{' '}
            {uploadReport.skipped_cells ?? 0}
          </p>
          {Array.isArray(uploadReport.warnings) && uploadReport.warnings.length > 0 && (
            <div className="pt-1 text-amber-900 space-y-0.5 text-[11px]">
              <div className="font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Warnings:</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5">
                {uploadReport.warnings.slice(0, 8).map((w: string, i: number) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Spreadsheet Grid */}
      {(!assignments || assignments.length === 0) ? (
        <div className="p-8 rounded-xl border border-dashed border-[#DDD8CE] bg-[#FAF9F6] text-center space-y-2">
          <FileSpreadsheet className="w-6 h-6 text-[#896ABD] mx-auto" />
          <p className="text-sm font-semibold text-[#0A0A0C]">
            Publish at least one assignment, lab, or quiz first
          </p>
          <p className="text-xs text-[#5C5B57] max-w-md mx-auto">
            Once an assessment exists in Classwork, it automatically becomes a column in this live spreadsheet and in your downloadable `.xlsx` workbook.
          </p>
        </div>
      ) : filteredRoster.length === 0 ? (
        <div className="p-8 rounded-xl border border-dashed border-[#DDD8CE] bg-[#FAF9F6] text-center text-xs text-[#5C5B57]">
          No enrolled students match &ldquo;{searchQuery}&rdquo;.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#DDD8CE] bg-white">
          <table className="w-full text-left text-xs border-collapse min-w-[780px]">
            <thead>
              <tr className="bg-[#FAF9F6] border-b border-[#DDD8CE] font-mono-tabular text-[11px] uppercase text-[#44433E]">
                <th className="py-2.5 px-3 sticky left-0 z-20 bg-[#FAF9F6] border-r border-[#E5E2DC] w-[125px]">
                  Roll No
                </th>
                <th className="py-2.5 px-3 sticky left-[125px] z-20 bg-[#FAF9F6] border-r border-[#E5E2DC] min-w-[180px]">
                  Student
                </th>
                <th className="py-2.5 px-3 min-w-[190px] border-r border-[#E5E2DC]">
                  Email
                </th>
                <th className="py-2.5 px-2.5 w-[72px] border-r border-[#E5E2DC]">Sec</th>
                {visibleAssignments.map((a) => (
                  <th
                    key={a.id}
                    className="py-2.5 px-2.5 min-w-[130px] border-r border-[#E5E2DC]"
                  >
                    <div className="truncate font-sans font-semibold text-[#0A0A0C] text-[11px] normal-case max-w-[155px]">
                      {a.title}
                    </div>
                    <div className="text-[10px] text-[#6F4EA8] font-semibold flex items-center gap-1 flex-wrap">
                      <span>Max {a.max_marks}</span>
                      <span>·</span>
                      <span className="text-[#5C5B57]">
                        {(a.target_sections || ['ALL']).includes('ALL')
                          ? 'All Secs'
                          : (a.target_sections || []).join(', ')}
                      </span>
                    </div>
                  </th>
                ))}
                {singleAssignment && (
                  <th className="py-2.5 px-3 min-w-[200px] border-r border-[#E5E2DC]">
                    Feedback / Remarks
                  </th>
                )}
                <th className="py-2.5 px-3 text-right min-w-[95px] border-r border-[#E5E2DC]">
                  Total
                </th>
                <th className="py-2.5 px-3 text-right w-[70px]">%</th>
              </tr>
            </thead>
            <tbody>
              {filteredRoster.map((stu, rIdx) => {
                const email = String(stu.student_email || '').trim().toLowerCase();
                let rowSum = 0;
                for (const asgn of visibleAssignments) {
                  const val = getCellDisplayValue(email, Number(asgn.id)).trim();
                  const num = val ? Number(val) : NaN;
                  if (Number.isFinite(num) && num >= 0) rowSum += num;
                }
                const pct =
                  totalVisibleMax > 0
                    ? Math.round((rowSum / totalVisibleMax) * 1000) / 10
                    : 0;
                const isPreEnrolledOnly = !stu.student_id;

                return (
                  <tr
                    key={stu.id || email}
                    className="border-b border-[#EFECE6] last:border-b-0 hover:bg-[#FAF9F6]/60"
                  >
                    <td className="py-2 px-3 font-mono-tabular font-semibold text-[#0A0A0C] sticky left-0 z-10 bg-white border-r border-[#EFECE6]">
                      {stu.roll_no || '—'}
                    </td>
                    <td className="py-2 px-3 sticky left-[125px] z-10 bg-white border-r border-[#EFECE6]">
                      <div className="font-medium text-[#0A0A0C] truncate max-w-[180px]">
                        {stu.student_name || email.split('@')[0]}
                      </div>
                      {isPreEnrolledOnly && (
                        <span className="text-[10px] font-mono-tabular text-amber-700">
                          Not signed up yet
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono-tabular text-[11px] text-[#5C5B57] border-r border-[#EFECE6] truncate max-w-[220px]">
                      {email}
                    </td>
                    <td className="py-2 px-2.5 font-mono-tabular text-[11px] text-[#353430] border-r border-[#EFECE6]">
                      {stu.section || 'Sec A'}
                    </td>
                    {visibleAssignments.map((asgn, cIdx) => {
                      const aid = Number(asgn.id);
                      const cellKey = makeCellKey(email, aid);
                      const rawVal = getCellDisplayValue(email, aid);
                      const isDirty = Object.prototype.hasOwnProperty.call(
                        dirtyMarks,
                        cellKey
                      );
                      const invalid = isCellOutOfRange(rawVal, Number(asgn.max_marks || 100));
                      const subInfo = submissionLookup.get(cellKey);
                      const editable = canEditCell(asgn, stu);
                      const cellDisabled = isPreEnrolledOnly || !editable;

                      return (
                        <td
                          key={aid}
                          className="p-1.5 border-r border-[#EFECE6] align-middle"
                        >
                          <div className="relative flex items-center">
                            <input
                              ref={(el) => {
                                cellRefs.current[`${rIdx}:${cIdx}`] = el;
                              }}
                              type="text"
                              inputMode="decimal"
                              disabled={cellDisabled}
                              value={rawVal}
                              placeholder={
                                isPreEnrolledOnly
                                  ? 'Pending'
                                  : !editable
                                  ? 'Read-only'
                                  : subInfo?.hasSubmission
                                  ? 'Grade'
                                  : '—'
                              }
                              title={
                                isPreEnrolledOnly
                                  ? 'Student must sign in once before assignment marks can be saved.'
                                  : !editable
                                  ? 'Read-only: section-specific assignment outside your assigned section(s).'
                                  : `Enter marks (0 – ${asgn.max_marks}). Paste from Excel or press Enter to move down.`
                              }
                              onChange={(e) =>
                                handleMarkChange(email, aid, e.target.value)
                              }
                              onKeyDown={(e) => handleCellKeyDown(e, rIdx, cIdx)}
                              onPaste={(e) => handleMultiCellPaste(e, rIdx, cIdx)}
                              className={`w-full px-2.5 py-1.5 rounded-lg border font-mono-tabular text-xs text-right focus:outline-none transition-colors ${
                                cellDisabled
                                  ? 'bg-[#F4F3EF] border-[#E5E2DC] text-[#7D7B75] cursor-not-allowed'
                                  : invalid
                                  ? 'bg-rose-50 border-rose-500 text-rose-800 focus:border-rose-600'
                                  : isDirty
                                  ? 'bg-amber-50 border-amber-400 text-[#0A0A0C] focus:border-[#E04F33]'
                                  : 'bg-white border-[#DDD8CE] text-[#0A0A0C] focus:border-[#896ABD]'
                              }`}
                            />
                            {subInfo?.hasSubmission && !invalid && (
                              <span
                                title="Student submission / mark record exists"
                                className="w-1.5 h-1.5 rounded-full bg-emerald-500 absolute left-2 pointer-events-none"
                              />
                            )}
                          </div>
                        </td>
                      );
                    })}

                    {singleAssignment && (
                      <td className="p-1.5 border-r border-[#EFECE6]">
                        <input
                          type="text"
                          disabled={isPreEnrolledOnly || !canEditCell(singleAssignment, stu)}
                          value={getFeedbackDisplayValue(email, Number(singleAssignment.id))}
                          placeholder={
                            canEditCell(singleAssignment, stu)
                              ? 'Optional remarks...'
                              : 'Read-only'
                          }
                          onChange={(e) =>
                            handleFeedbackChange(
                              email,
                              Number(singleAssignment.id),
                              e.target.value
                            )
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-[#DDD8CE] bg-white text-xs focus:outline-none focus:border-[#896ABD] disabled:bg-[#F4F3EF] disabled:cursor-not-allowed"
                        />
                      </td>
                    )}

                    <td className="py-2 px-3 text-right font-mono-tabular font-semibold text-[#0A0A0C] border-r border-[#EFECE6]">
                      {rowSum % 1 === 0 ? rowSum : rowSum.toFixed(1)}{' '}
                      <span className="text-[#8E8D88] font-normal">/ {totalVisibleMax}</span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono-tabular font-semibold text-[#5B3B96]">
                      {pct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default ExcelMarksSheet;
