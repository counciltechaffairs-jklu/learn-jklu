import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  Download,
  Eye,
  FileText,
  GraduationCap,
  Search,
  UploadCloud,
} from 'lucide-react';
import { Stage, Window, Bar, Text, type Act } from '@/components/stageshow/kit';
import { MorphLabel, SPRING_FLUID } from '@/components/animations/MotionPrimitives';

type DemoTabId = 'past-papers' | 'classroom';

const STAGE_REST = {
  wide: { x: 580, y: 250 },
  compact: { x: 255, y: 318 },
};

/* -------------------------------------------------------------------------- */
/* Demo 1: Past Paper Archive (Student Perspective)                           */
/* -------------------------------------------------------------------------- */

interface PaperDemoState {
  focused: boolean;
  query: string;
  endTermOnly: boolean;
  previewOpen: boolean;
  downloaded: boolean;
}

const PAPER_INITIAL: PaperStateStrict = {
  focused: false,
  query: '',
  endTermOnly: false,
  previewOpen: false,
  downloaded: false,
};

type PaperStateStrict = PaperDemoState;

const PAPER_POSTER: PaperDemoState = {
  focused: false,
  query: 'CS1135',
  endTermOnly: true,
  previewOpen: true,
  downloaded: true,
};

async function pastPaperScript(a: Act<PaperDemoState>) {
  await a.wait(450);

  // Beat 1: Focus search with keyboard shortcut & search by course code
  await a.move('pp-search');
  await a.wait(220);
  await a.key('cmd+k');
  await a.set({ focused: true });
  await a.type('query', 'CS1135', { interval: 55 });
  await a.set({ focused: false });
  await a.wait(320);

  // Beat 2: Filter to End-Term papers
  await a.move('pp-chip-endterm');
  await a.wait(180);
  await a.click();
  await a.set({ endTermOnly: true });
  await a.wait(380);

  // Beat 3: Open PDF Quick Preview satellite card
  await a.move('pp-preview-btn');
  await a.wait(200);
  await a.click();
  await a.set({ previewOpen: true });
  await a.wait(850);

  // Beat 4: Save official PDF & hold payoff
  await a.move('pp-download-btn');
  await a.wait(200);
  await a.click();
  await a.set({ downloaded: true });
  await a.wait(1900);

  // Seamless loop reset back to initial state and cursor rest point
  await a.set({ ...PAPER_INITIAL });
  await a.move(STAGE_REST[a.layout]);
  await a.wait(350);
}

function PastPaperStudentStage() {
  return (
    <Stage<PaperDemoState>
      width={860}
      height={380}
      compact={{ below: 640, width: 358, height: 420 }}
      initial={PAPER_INITIAL}
      poster={PAPER_POSTER}
      script={pastPaperScript}
      theme="light"
      greys="warm"
      accent="#E04F33"
      ground={['rgba(137, 106, 189, 0.22)', 'rgba(224, 79, 51, 0.16)', 'rgba(245, 198, 165, 0.24)']}
      play="loop"
      keys="bottom-left"
      cursor={{ at: STAGE_REST, ripple: true, idle: false }}
    >
      {(s, _rect, layout) => {
        const isFiltered = s.query.length >= 4 || s.endTermOnly;
        return (
          <>
            <Window
              chrome="glass"
              lights="grey"
              nav
              url="learnjklu.edu.in/past-papers"
              urlShape="pill"
              className="ss-stu-hero-win"
            >
              <div className="ss-stu-pp-page">
                {/* Top Search Bar */}
                <div className="ss-stu-pp-top">
                  <div
                    data-target="pp-search"
                    data-active={s.focused}
                    className="ss-stu-searchbox"
                  >
                    <Search className="w-3.5 h-3.5 shrink-0" style={{ color: '#896ABD' }} />
                    {s.query ? (
                      <span className="ss-stu-search-text">
                        {s.query}
                        {s.focused && <span className="ss-stu-caret" aria-hidden="true" />}
                      </span>
                    ) : (
                      <span className="ss-stu-search-placeholder">
                        Search past exam papers (e.g. CS1135)...
                        {s.focused && <span className="ss-stu-caret" aria-hidden="true" />}
                      </span>
                    )}
                    {layout === 'wide' && <span className="ss-stu-kbd">⌘K</span>}
                  </div>
                </div>

                {/* Filter Chips */}
                <div className="ss-stu-filters">
                  <button
                    type="button"
                    className="ss-stu-chip"
                    data-selected={!s.endTermOnly}
                  >
                    All Exams
                  </button>
                  <button
                    type="button"
                    data-target="pp-chip-endterm"
                    data-selected={s.endTermOnly}
                    className="ss-stu-chip"
                  >
                    End-Term
                  </button>
                  <Bar w={56} h={16} r={999} tone={2} />
                  {layout === 'wide' && <Bar w={64} h={16} r={999} tone={1} />}
                </div>

                {/* Paper Rows: real copy on matching target card, quiet Bars below */}
                <div className="ss-stu-paper-list">
                  <div
                    className="ss-stu-paper-row"
                    data-featured={isFiltered}
                    style={layout === 'compact' ? { flexDirection: 'column', alignItems: 'stretch' } : undefined}
                  >
                    <div className="ss-stu-paper-meta">
                      <div className="ss-stu-paper-badges">
                        <span className="ss-stu-code">CS1135</span>
                        <span className="ss-stu-tag">2025 · End-Term · PDF</span>
                      </div>
                      <div className="ss-stu-title">
                        Data Structures &amp; Algorithms
                      </div>
                    </div>

                    <div className="ss-stu-actions">
                      <button
                        type="button"
                        data-target="pp-preview-btn"
                        className="ss-stu-btn"
                      >
                        <Eye className="w-3 h-3" style={{ color: '#896ABD' }} />
                        <span>Preview</span>
                      </button>
                      <button
                        type="button"
                        data-target="pp-download-btn"
                        className={`ss-stu-btn ${s.downloaded ? 'ss-stu-btn--success' : 'ss-stu-btn--primary'}`}
                      >
                        {s.downloaded ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Saved PDF</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3 h-3" />
                            <span>Download</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Quiet context rows */}
                  <div className="ss-stu-paper-row ss-stu-paper-row--filler">
                    <div className="ss-stu-paper-meta">
                      <div className="ss-stu-paper-badges">
                        <Bar w={46} h={12} r={4} tone={3} />
                        <Bar w={78} h={8} r={4} tone={2} />
                      </div>
                      <Bar w={layout === 'compact' ? 148 : 210} h={10} r={4} tone={4} />
                    </div>
                    {layout === 'wide' && <Bar w={118} h={22} r={6} tone={2} />}
                  </div>

                  <div className="ss-stu-paper-row ss-stu-paper-row--filler">
                    <div className="ss-stu-paper-meta">
                      <div className="ss-stu-paper-badges">
                        <Bar w={46} h={12} r={4} tone={2} />
                        <Bar w={64} h={8} r={4} tone={1} />
                      </div>
                      <Bar w={layout === 'compact' ? 132 : 176} h={10} r={4} tone={3} />
                    </div>
                    {layout === 'wide' && <Bar w={118} h={22} r={6} tone={1} />}
                  </div>
                </div>
              </div>
            </Window>

            {/* Satellite: PDF Quick Preview Payoff */}
            <aside
              className="ss-stu-sat"
              data-show={s.previewOpen}
              aria-hidden={!s.previewOpen}
            >
              <div className="ss-stu-sat-head">
                <span className="ss-stu-sat-eyebrow">PDF PREVIEW</span>
                <span className="ss-stu-sat-badge">
                  {s.downloaded ? 'Downloaded' : 'Page 1 of 6'}
                </span>
              </div>
              <div className="ss-stu-sat-title">
                <FileText
                  className="w-3.5 h-3.5 inline mr-1.5 align-text-bottom"
                  style={{ color: '#E04F33' }}
                />
                CS1135_EndTerm_2025.pdf
              </div>
              <div className="ss-stu-sat-lines">
                <Text tone={4} w={180} h={7} filler>
                  Q1. Analyze AVL vs Red-Black worst-case height
                </Text>
                <Bar w="92%" h={6} tone={2} />
                <Bar w="76%" h={6} tone={2} />
                <Bar w="84%" h={6} tone={1} />
              </div>
              <div className="ss-stu-sat-note">
                Verified archive paper — instant preview &amp; one-click PDF download.
              </div>
            </aside>
          </>
        );
      }}
    </Stage>
  );
}

/* -------------------------------------------------------------------------- */
/* Demo 2: Student Classroom (Turn In + Own Grades Only)                      */
/* -------------------------------------------------------------------------- */

interface ClassroomDemoState {
  tab: 'work' | 'grades';
  turnedIn: boolean;
  receiptOpen: boolean;
}

const CLASSROOM_INITIAL: ClassroomDemoState = {
  tab: 'work',
  turnedIn: false,
  receiptOpen: false,
};

const CLASSROOM_POSTER: ClassroomDemoState = {
  tab: 'grades',
  turnedIn: true,
  receiptOpen: false,
};

async function classroomStudentScript(a: Act<ClassroomDemoState>) {
  await a.wait(500);

  // Beat 1: Student turns in assignment on Classwork tab
  await a.move('cr-submit-btn');
  await a.wait(220);
  await a.click();
  await a.set({ turnedIn: true, receiptOpen: true });
  await a.wait(1250);

  // Beat 2: Switch to "My Grades" tab (shows ONLY the student's own private grade & attendance)
  await a.move('cr-tab-grades');
  await a.wait(200);
  await a.click();
  await a.set({ tab: 'grades', receiptOpen: false });
  await a.wait(2200);

  // Seamless loop reset back to initial state
  await a.move('cr-tab-work');
  await a.click();
  await a.set({ ...CLASSROOM_INITIAL });
  await a.move(STAGE_REST[a.layout]);
  await a.wait(350);
}

function ClassroomStudentStage() {
  return (
    <Stage<ClassroomDemoState>
      width={860}
      height={380}
      compact={{ below: 640, width: 358, height: 420 }}
      initial={CLASSROOM_INITIAL}
      poster={CLASSROOM_POSTER}
      script={classroomStudentScript}
      theme="light"
      greys="warm"
      accent="#E04F33"
      play="loop"
      cursor={{ at: STAGE_REST, ripple: true, idle: false }}
    >
      {(s, _rect, layout) => (
        <>
          <Window
            title="CS1135 · Sec A"
            sidebarWidth={168}
            className="ss-stu-hero-win"
            sidebar={
              <div className="ss-stu-sidebar">
                <div className="ss-stu-side-label">MY COURSES</div>
                <div className="ss-stu-course-item" data-active="true">
                  <span>CS1135 · DSA</span>
                  <span className="ss-stu-course-sec">Sec A</span>
                </div>
                <div className="ss-stu-course-item">
                  <span>CS1108 · DBMS</span>
                  <span className="ss-stu-course-sec">Sec A</span>
                </div>
                <div style={{ padding: '6px 9px' }}>
                  <Bar w={104} h={7} tone={2} />
                </div>
                <div style={{ padding: '4px 9px' }}>
                  <Bar w={84} h={7} tone={1} />
                </div>
              </div>
            }
            toolbar={
              <div className="ss-stu-toolbar-tabs">
                <button
                  type="button"
                  data-target="cr-tab-work"
                  data-active={s.tab === 'work'}
                  className="ss-stu-tab"
                >
                  Classwork
                </button>
                <button
                  type="button"
                  data-target="cr-tab-grades"
                  data-active={s.tab === 'grades'}
                  className="ss-stu-tab"
                >
                  My Grades
                </button>
              </div>
            }
          >
            <div className="ss-stu-cr-body">
              <div className="ss-stu-cr-header">
                <div className="ss-stu-cr-heading">
                  {s.tab === 'work' ? 'My Upcoming Task' : 'My Grade & Attendance Report'}
                </div>
                <span className="ss-stu-role-pill">Student View</span>
              </div>

              {s.tab === 'work' ? (
                <>
                  {/* Student's own assignment card */}
                  <div
                    className="ss-stu-card-row"
                    style={layout === 'compact' ? { flexDirection: 'column', alignItems: 'stretch' } : undefined}
                  >
                    <div className="ss-stu-paper-meta">
                      <div className="ss-stu-paper-badges">
                        <span
                          className={`ss-stu-status-badge ${
                            s.turnedIn ? 'ss-stu-status-badge--done' : 'ss-stu-status-badge--pending'
                          }`}
                        >
                          {s.turnedIn ? '✓ Turned In' : 'Due Fri 11:59 PM'}
                        </span>
                        <span className="ss-stu-tag">Lab · 20 pts</span>
                      </div>
                      <div className="ss-stu-title">Lab 04 — Balanced BST Implementation</div>
                    </div>

                    <button
                      type="button"
                      data-target="cr-submit-btn"
                      className={`ss-stu-btn ${
                        s.turnedIn ? 'ss-stu-btn--success' : 'ss-stu-btn--primary'
                      }`}
                    >
                      {s.turnedIn ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Submitted</span>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="w-3 h-3" />
                          <span>Turn In PDF</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Quiet filler tasks */}
                  <div className="ss-stu-card-row" style={{ opacity: 0.72, background: '#faf9f6' }}>
                    <div className="ss-stu-paper-meta">
                      <Bar w={92} h={10} r={4} tone={2} />
                      <Bar w={180} h={8} r={4} tone={3} />
                    </div>
                    {layout === 'wide' && <Bar w={76} h={22} r={6} tone={2} />}
                  </div>

                  <div className="ss-stu-card-row" style={{ opacity: 0.6, background: '#faf9f6' }}>
                    <div className="ss-stu-paper-meta">
                      <Bar w={74} h={10} r={4} tone={1} />
                      <Bar w={146} h={8} r={4} tone={2} />
                    </div>
                    {layout === 'wide' && <Bar w={76} h={22} r={6} tone={1} />}
                  </div>
                </>
              ) : (
                <>
                  {/* Student's OWN private grade & attendance KPIs ONLY (no classmate data, no class avg) */}
                  <div className="ss-stu-stats-strip">
                    <div className="ss-stu-stat-box">
                      <span className="ss-stu-stat-label">My Weighted Score</span>
                      <span className="ss-stu-stat-val">90%</span>
                    </div>
                    <div className="ss-stu-stat-box">
                      <span className="ss-stu-stat-label">My Attendance</span>
                      <span className="ss-stu-stat-val" style={{ color: '#15803d' }}>
                        92%
                      </span>
                    </div>
                  </div>

                  <div className="ss-stu-card-row">
                    <div className="ss-stu-paper-meta">
                      <div className="ss-stu-title">Lab 04 — Balanced BST Implementation</div>
                      <span className="ss-stu-tag">Published · Re-evaluation Open</span>
                    </div>
                    <span className="ss-stu-grade-score">18 / 20</span>
                  </div>

                  <div className="ss-stu-card-row" style={{ background: '#faf9f6' }}>
                    <div className="ss-stu-paper-meta">
                      <div className="ss-stu-title">Quiz 02 — Heaps &amp; Priority Queues</div>
                      <span className="ss-stu-tag">Published</span>
                    </div>
                    <span className="ss-stu-grade-score">9 / 10</span>
                  </div>
                </>
              )}
            </div>
          </Window>

          {/* Satellite: Student Submission Receipt */}
          <aside
            className="ss-stu-sat"
            data-show={s.receiptOpen}
            aria-hidden={!s.receiptOpen}
          >
            <div className="ss-stu-sat-head">
              <span className="ss-stu-sat-eyebrow">SUBMISSION RECEIPT</span>
              <span className="ss-stu-sat-badge">On Time</span>
            </div>
            <div className="ss-stu-sat-title">Lab 04_Submission.pdf Received</div>
            <div className="ss-stu-sat-lines">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  color: '#262628',
                  fontWeight: 500,
                }}
              >
                <Calendar className="w-3 h-3" style={{ color: '#896ABD' }} />
                <span>Added deadline to Google Calendar</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  color: '#262628',
                  fontWeight: 500,
                }}
              >
                <Check className="w-3 h-3" style={{ color: '#15803d' }} />
                <span>Private receipt sent via email</span>
              </div>
            </div>
            <div className="ss-stu-sat-note">
              Only you and your course instructor see your submission and grade.
            </div>
          </aside>
        </>
      )}
    </Stage>
  );
}

/* -------------------------------------------------------------------------- */
/* Section Wrapper Mounted Below Hero on HomePage                             */
/* -------------------------------------------------------------------------- */

const DEMO_TABS: {
  id: DemoTabId;
  label: string;
  caption: string;
  ctaLabel: string;
  ctaHref: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  {
    id: 'past-papers',
    label: 'Past Paper Archive',
    caption: 'Search by subject or code, filter End-Term exams, preview PDFs, and download in one click.',
    ctaLabel: 'Browse Past Papers',
    ctaHref: '/past-papers',
    icon: BookOpen,
  },
  {
    id: 'classroom',
    label: 'Student Classroom',
    caption: 'Submit assignments with instant receipts and check your own private grades & attendance.',
    ctaLabel: 'Open Student Classroom',
    ctaHref: '/classroom',
    icon: GraduationCap,
  },
];

export const StudentStageshowSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DemoTabId>('past-papers');
  const currentTab = DEMO_TABS.find((t) => t.id === activeTab) || DEMO_TABS[0];

  return (
    <section
      aria-label="Interactive Student Walkthrough"
      className="rounded-2xl border border-[#E5E2DC]/90 dark:border-white/10 bg-white/95 dark:bg-[#111117]/90 backdrop-blur-md p-5 sm:p-6 shadow-[var(--shadow-surface)] space-y-5"
    >
      {/* Header + 2-Tab Segmented Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="font-mono-tabular text-[10px] uppercase tracking-wider text-[#E04F33] font-semibold block">
            Student Walkthrough · Stageshow Preview
          </span>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#0A0A0C] dark:text-[#F5F4F0]">
            See How Past Papers &amp; Student Classroom Work
          </h2>
        </div>

        <div
          role="tablist"
          aria-label="Choose student demo"
          className="inline-flex items-center max-w-full overflow-x-auto p-1 rounded-xl border border-[#E5E2DC] dark:border-white/10 bg-[#FAF9F6] dark:bg-white/[0.04] self-start md:self-auto"
        >
          {DEMO_TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-2.5 sm:px-3.5 py-2 rounded-[10px] text-[11px] sm:text-xs font-semibold inline-flex items-center gap-1.5 transition-colors duration-150 shrink-0 ${
                  selected
                    ? 'text-[#FAF9F6] dark:text-[#0A0A0C]'
                    : 'text-[#5C5B57] dark:text-[#A09F9A] hover:text-[#0A0A0C] dark:hover:text-white'
                }`}
              >
                {selected && (
                  <motion.span
                    layoutId="studentStageshowTabPill"
                    transition={SPRING_FLUID}
                    className="absolute inset-0 rounded-[10px] bg-[#0A0A0C] dark:bg-[#F5F4F0] shadow-sm"
                  />
                )}
                <Icon className="w-3.5 h-3.5 relative z-10 shrink-0" />
                <span className="relative z-10 whitespace-nowrap">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Stageshow Stage Container */}
      <div className="ss-student-demo">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
          >
            {activeTab === 'past-papers' ? <PastPaperStudentStage /> : <ClassroomStudentStage />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Concise Caption + Direct Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-0.5 text-xs">
        <MorphLabel
          stateKey={currentTab.id}
          className="text-[#5C5B57] dark:text-[#A09F9A]"
        >
          {currentTab.caption}
        </MorphLabel>

        <Link
          to={currentTab.ctaHref}
          className="inline-flex items-center gap-1.5 font-semibold text-[#E04F33] hover:text-[#0A0A0C] dark:hover:text-white transition-colors duration-150 shrink-0"
        >
          <span>{currentTab.ctaLabel}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </section>
  );
};

export default StudentStageshowSection;
