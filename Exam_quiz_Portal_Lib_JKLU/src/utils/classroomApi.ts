import type { AxiosRequestConfig } from 'axios';
import { API } from '@/utils/api';
import type {
  Announcement,
  Assignment,
  ClassroomNotification,
  ClassroomWorkspace,
  Offering,
  SimilarityReport,
  Submission,
} from '@/types/classroom';

export const classroomApi = {
  // Notifications & Multi-course Overviews
  getNotifications: (limit = 15) =>
    API.client
      .get<{ notifications: ClassroomNotification[]; unread_count: number }>(
        `/classroom/notifications?limit=${limit}`
      )
      .then((r) => r.data),

  markAllNotificationsRead: () =>
    API.client.patch('/classroom/notifications/read-all').then((r) => r.data),

  markNotificationRead: (notificationId: number) =>
    API.client.patch(`/classroom/notifications/${notificationId}/read`).then((r) => r.data),

  getFacultyOverview: () =>
    API.client.get<any>('/classroom/faculty/overview').then((r) => r.data),

  getStudentOverview: () =>
    API.client.get<any>('/classroom/student/overview').then((r) => r.data),

  // Offerings & Course Management
  listOfferings: () =>
    API.client.get<{ items: Offering[]; tasks?: any[] }>('/classroom/offerings').then((r) => r.data),

  getWorkspace: (offeringId: number, config?: AxiosRequestConfig) =>
    API.client
      .get<ClassroomWorkspace>(`/classroom/offerings/${offeringId}`, config)
      .then((r) => r.data),

  getAnalytics: (offeringId: number) =>
    API.client.get<any>(`/classroom/offerings/${offeringId}/analytics`).then((r) => r.data),

  createOffering: (payload: Record<string, any>) =>
    API.client.post<{ offering?: Offering; message?: string }>('/classroom/offerings', payload).then((r) => r.data),

  updateBanner: (offeringId: number, bannerImageUrl: string | null) =>
    API.client
      .patch<{ offering?: Offering; banner_image_url?: string | null; message?: string }>(
        `/classroom/offerings/${offeringId}/banner`,
        { banner_image_url: bannerImageUrl }
      )
      .then((r) => r.data),

  regenerateJoinCode: (offeringId: number) =>
    API.client
      .post<{ join_code: string; message?: string }>(
        `/classroom/offerings/${offeringId}/regenerate-join-code`
      )
      .then((r) => r.data),

  joinByCode: (payload: { join_code: string; preferred_section?: string }) =>
    API.client
      .post<{ offering?: Offering; offering_id?: number; message?: string }>(
        '/classroom/offerings/join-code',
        payload
      )
      .then((r) => r.data),

  updateMySections: (offeringId: number, assignedSections: string[]) =>
    API.client
      .patch<{ message?: string }>(`/classroom/offerings/${offeringId}/me/sections`, {
        assigned_sections: assignedSections,
      })
      .then((r) => r.data),

  updateOfferingSections: (offeringId: number, sections: string[]) =>
    API.client
      .patch<{ message?: string }>(`/classroom/offerings/${offeringId}/sections`, { sections })
      .then((r) => r.data),

  addInstructor: (
    offeringId: number,
    payload: { email: string; role_label?: string; assigned_sections: string[] }
  ) =>
    API.client
      .post<{ message?: string }>(`/classroom/offerings/${offeringId}/add-instructor`, payload)
      .then((r) => r.data),

  updateInstructorSections: (offeringId: number, professorId: number, assignedSections: string[]) =>
    API.client
      .patch<{ message?: string }>(
        `/classroom/offerings/${offeringId}/instructors/${professorId}/sections`,
        { assigned_sections: assignedSections }
      )
      .then((r) => r.data),

  removeInstructor: (offeringId: number, professorId: number) =>
    API.client
      .delete<{ message?: string }>(`/classroom/offerings/${offeringId}/instructors/${professorId}`)
      .then((r) => r.data),

  addTA: (offeringId: number, payload: Record<string, any>) =>
    API.client.post<{ message?: string }>(`/classroom/offerings/${offeringId}/add-ta`, payload).then((r) => r.data),

  updateTA: (offeringId: number, taId: number, patch: Record<string, any>) =>
    API.client
      .patch<{ message?: string }>(`/classroom/offerings/${offeringId}/tas/${taId}`, patch)
      .then((r) => r.data),

  removeTA: (offeringId: number, taId: number) =>
    API.client.delete(`/classroom/offerings/${offeringId}/tas/${taId}`).then((r) => r.data),

  updateStudentSection: (offeringId: number, enrollmentId: number, section: string) =>
    API.client
      .patch<{ message?: string }>(
        `/classroom/offerings/${offeringId}/students/${enrollmentId}/section`,
        { section }
      )
      .then((r) => r.data),

  removeStudent: (offeringId: number, enrollmentId: number) =>
    API.client
      .delete(`/classroom/offerings/${offeringId}/students/${enrollmentId}`)
      .then((r) => r.data),

  uploadSyllabusPdf: (offeringId: number, formData: FormData) =>
    API.client
      .post<{ message?: string }>(`/classroom/offerings/${offeringId}/syllabus-pdf`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data),

  downloadSyllabusPdf: (offeringId: number, download = false) =>
    API.client
      .get<Blob>(`/classroom/offerings/${offeringId}/syllabus-pdf${download ? '?download=1' : ''}`, {
        responseType: 'blob',
      })
      .then((r) => r.data),

  deleteSyllabusPdf: (offeringId: number) =>
    API.client.delete(`/classroom/offerings/${offeringId}/syllabus-pdf`).then((r) => r.data),

  uploadRoster: (offeringId: number, formData: FormData) =>
    API.client
      .post<any>(`/classroom/offerings/${offeringId}/roster-upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data),

  getRosterTemplateUrl: () =>
    `${API.client.defaults.baseURL || 'http://localhost:8001'}/classroom/roster-template.csv`,

  cloneOffering: (offeringId: number, payload: Record<string, any>) =>
    API.client.post<{ offering?: Offering; message?: string }>(`/classroom/offerings/${offeringId}/clone`, payload).then((r) => r.data),

  listRequests: (offeringId: number) =>
    API.client.get<{ requests: any[] }>(`/classroom/offerings/${offeringId}/requests`).then((r) => r.data),

  submitEnrollmentRequest: (offeringId: number, payload: Record<string, any>) =>
    API.client
      .post<{ message?: string }>(`/classroom/offerings/${offeringId}/enrollment-request`, payload)
      .then((r) => r.data),

  submitSectionChangeRequest: (offeringId: number, payload: { requested_section: string; reason: string }) =>
    API.client
      .post<{ message?: string }>(`/classroom/offerings/${offeringId}/section-change-request`, payload)
      .then((r) => r.data),

  reviewRequest: (requestId: number, status: 'APPROVED' | 'REJECTED') =>
    API.client.patch(`/classroom/requests/${requestId}`, { status }).then((r) => r.data),

  // Stream: Announcements, Comments, Read Receipts, Polls, Office Hours
  createAnnouncement: (offeringId: number, payload: Record<string, any>) =>
    API.client
      .post<{ announcement?: Announcement; message?: string }>(
        `/classroom/offerings/${offeringId}/announcements`,
        payload
      )
      .then((r) => r.data),

  updateAnnouncement: (announcementId: number, payload: Record<string, any>) =>
    API.client.patch(`/classroom/announcements/${announcementId}`, payload).then((r) => r.data),

  deleteAnnouncement: (announcementId: number) =>
    API.client.delete(`/classroom/announcements/${announcementId}`).then((r) => r.data),

  addComment: (announcementId: number, payload: { content: string }) =>
    API.client.post(`/classroom/announcements/${announcementId}/comments`, payload).then((r) => r.data),

  verifyComment: (commentId: number) =>
    API.client.patch(`/classroom/comments/${commentId}/verify`).then((r) => r.data),

  deleteComment: (commentId: number) =>
    API.client.delete(`/classroom/comments/${commentId}`).then((r) => r.data),

  markAnnouncementSeen: (announcementId: number) =>
    API.client.post(`/classroom/announcements/${announcementId}/seen`).then((r) => r.data),

  getAnnouncementSeen: (announcementId: number) =>
    API.client.get<any>(`/classroom/announcements/${announcementId}/seen`).then((r) => r.data),

  listPolls: (offeringId: number) =>
    API.client.get<{ polls: any[] }>(`/classroom/offerings/${offeringId}/polls`).then((r) => r.data),

  createPoll: (offeringId: number, payload: Record<string, any>) =>
    API.client.post(`/classroom/offerings/${offeringId}/polls`, payload).then((r) => r.data),

  votePoll: (pollId: number, optionIndex: number) =>
    API.client.post(`/classroom/polls/${pollId}/vote`, { option_index: optionIndex }).then((r) => r.data),

  closePoll: (pollId: number) =>
    API.client.patch(`/classroom/polls/${pollId}/close`).then((r) => r.data),

  deletePoll: (pollId: number) =>
    API.client.delete(`/classroom/polls/${pollId}`).then((r) => r.data),

  listOfficeHours: (offeringId: number) =>
    API.client.get<{ slots: any[] }>(`/classroom/offerings/${offeringId}/office-hours`).then((r) => r.data),

  createOfficeHour: (offeringId: number, payload: Record<string, any>) =>
    API.client.post(`/classroom/offerings/${offeringId}/office-hours`, payload).then((r) => r.data),

  bookOfficeHour: (slotId: number, topic: string) =>
    API.client.post(`/classroom/office-hours/${slotId}/book`, { topic }).then((r) => r.data),

  cancelOfficeHourBooking: (slotId: number) =>
    API.client.delete(`/classroom/office-hours/${slotId}/book`).then((r) => r.data),

  deleteOfficeHour: (slotId: number) =>
    API.client.delete(`/classroom/office-hours/${slotId}`).then((r) => r.data),

  // Assignments, Submissions, Versions, Similarity, Groups & Messages
  createAssignment: (offeringId: number, payload: Record<string, any>) =>
    API.client
      .post<{ assignment?: Assignment; message?: string }>(
        `/classroom/offerings/${offeringId}/assignments`,
        payload
      )
      .then((r) => r.data),

  updateAssignment: (assignmentId: number, payload: Record<string, any>) =>
    API.client.patch(`/classroom/assignments/${assignmentId}`, payload).then((r) => r.data),

  deleteAssignment: (assignmentId: number) =>
    API.client.delete(`/classroom/assignments/${assignmentId}`).then((r) => r.data),

  cloneAssignment: (assignmentId: number) =>
    API.client.post<{ message?: string }>(`/classroom/assignments/${assignmentId}/clone`, {}).then((r) => r.data),

  submitAssignment: (assignmentId: number, payload: Record<string, any>) =>
    API.client
      .post<{ submission?: Submission; message?: string }>(
        `/classroom/assignments/${assignmentId}/submit`,
        payload
      )
      .then((r) => r.data),

  submitAssignmentFile: (assignmentId: number, formData: FormData) =>
    API.client
      .post<{ submission?: Submission; message?: string }>(
        `/classroom/assignments/${assignmentId}/submit-file`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      .then((r) => r.data),

  gradeSubmission: (submissionId: number, payload: Record<string, any>) =>
    API.client.patch(`/classroom/submissions/${submissionId}/grade`, payload).then((r) => r.data),

  getSubmissionVersions: (submissionId: number) =>
    API.client.get<{ versions: any[] }>(`/classroom/submissions/${submissionId}/versions`).then((r) => r.data),

  getSubmissionFileBlob: (submissionId: number) =>
    API.client
      .get<Blob>(`/classroom/submissions/${submissionId}/file`, { responseType: 'blob' })
      .then((r) => r.data),

  getSubmissionMessages: (submissionId: number) =>
    API.client.get<{ messages: any[] }>(`/classroom/submissions/${submissionId}/messages`).then((r) => r.data),

  postSubmissionMessage: (submissionId: number, message: string) =>
    API.client.post(`/classroom/submissions/${submissionId}/messages`, { message }).then((r) => r.data),

  getAssignmentSimilarity: (assignmentId: number, section?: string) => {
    const q = section ? `?section=${encodeURIComponent(section)}` : '';
    return API.client
      .get<SimilarityReport>(`/classroom/assignments/${assignmentId}/similarity${q}`)
      .then((r) => r.data);
  },

  downloadSubmissionsZip: (assignmentId: number, section = 'ALL') =>
    API.client
      .get<Blob>(
        `/classroom/assignments/${assignmentId}/submissions-zip?section=${encodeURIComponent(section)}`,
        { responseType: 'blob' }
      )
      .then((r) => r.data),

  listAssignmentGroups: (assignmentId: number) =>
    API.client.get<any>(`/classroom/assignments/${assignmentId}/groups`).then((r) => r.data),

  createAssignmentGroup: (assignmentId: number, name: string) =>
    API.client
      .post<{ message?: string }>(`/classroom/assignments/${assignmentId}/groups`, { name })
      .then((r) => r.data),

  joinGroup: (groupId: number) =>
    API.client.post<{ message?: string }>(`/classroom/groups/${groupId}/join`).then((r) => r.data),

  leaveGroup: (groupId: number) =>
    API.client.delete<{ message?: string }>(`/classroom/groups/${groupId}/leave`).then((r) => r.data),

  toggleLockGroup: (groupId: number, isLocked: boolean) =>
    API.client.patch(`/classroom/groups/${groupId}/lock`, { is_locked: isLocked }).then((r) => r.data),

  addGroupMember: (groupId: number, email: string) =>
    API.client.post(`/classroom/groups/${groupId}/members`, { email }).then((r) => r.data),

  removeGroupMember: (groupId: number, studentId: number) =>
    API.client.delete(`/classroom/groups/${groupId}/members/${studentId}`).then((r) => r.data),

  // Excel Marks Sheet, Gradebook, Re-eval & TCS Export
  downloadMarksWorkbook: (offeringId: number, queryString = '') =>
    API.client
      .get<Blob>(`/classroom/offerings/${offeringId}/marks-workbook.xlsx${queryString}`, {
        responseType: 'blob',
      })
      .then((r) => r.data),

  uploadMarksWorkbook: (offeringId: number, formData: FormData) =>
    API.client
      .post<any>(`/classroom/offerings/${offeringId}/marks-upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data),

  saveMarksBulk: (offeringId: number, entries: any[]) =>
    API.client
      .post<any>(`/classroom/offerings/${offeringId}/marks-bulk`, { entries })
      .then((r) => r.data),

  importTcsRoster: (offeringId: number, csvText: string) =>
    API.client
      .post<{ message?: string }>(`/classroom/offerings/${offeringId}/tcs-roster-import`, {
        csv_text: csvText,
      })
      .then((r) => r.data),

  exportTcsMarksCsv: (offeringId: number) =>
    API.client
      .get<Blob>(`/classroom/offerings/${offeringId}/tcs-marks-export`, { responseType: 'blob' })
      .then((r) => r.data),

  getMyGrades: (offeringId: number, previewSection?: string | null) => {
    const q = previewSection ? `?section=${encodeURIComponent(previewSection)}` : '';
    return API.client.get<any>(`/classroom/offerings/${offeringId}/my-grades${q}`).then((r) => r.data);
  },

  getGradeDistribution: (offeringId: number, section = 'ALL') =>
    API.client
      .get<any>(
        `/classroom/offerings/${offeringId}/grade-distribution?section=${encodeURIComponent(section)}`
      )
      .then((r) => r.data),

  listReevalRequests: (offeringId: number) =>
    API.client
      .get<{ requests: any[] }>(`/classroom/offerings/${offeringId}/reeval-requests`)
      .then((r) => r.data),

  updateReevalSettings: (offeringId: number, reevalEnabled: boolean) =>
    API.client
      .patch<{ reeval_enabled: boolean; message?: string }>(
        `/classroom/offerings/${offeringId}/reeval-settings`,
        { reeval_enabled: reevalEnabled }
      )
      .then((r) => r.data),

  updateGradeWeights: (offeringId: number, weights: Record<string, number>) =>
    API.client
      .put<{ message?: string }>(`/classroom/offerings/${offeringId}/grade-weights`, weights)
      .then((r) => r.data),

  publishAssignmentGrades: (assignmentId: number, gradesPublished: boolean) =>
    API.client
      .patch<{ message?: string }>(`/classroom/assignments/${assignmentId}/publish-grades`, {
        grades_published: gradesPublished,
      })
      .then((r) => r.data),

  toggleAssignmentReeval: (assignmentId: number, reevalEnabled: boolean) =>
    API.client
      .patch(`/classroom/assignments/${assignmentId}/reeval-toggle`, { reeval_enabled: reevalEnabled })
      .then((r) => r.data),

  updateAssignmentRubric: (assignmentId: number, criteria: any[]) =>
    API.client.put(`/classroom/assignments/${assignmentId}/rubric`, { criteria }).then((r) => r.data),

  createReevalRequest: (submissionId: number, reason: string) =>
    API.client
      .post<{ message?: string }>(`/classroom/submissions/${submissionId}/reeval`, { reason })
      .then((r) => r.data),

  resolveReevalRequest: (reqId: number, payload: Record<string, any>) =>
    API.client.patch<any>(`/classroom/reeval-requests/${reqId}`, payload).then((r) => r.data),

  // Modules & Past Papers
  listModules: (offeringId: number, previewSection?: string | null) => {
    const q = previewSection
      ? `?preview=student&section=${encodeURIComponent(previewSection)}`
      : '';
    return API.client.get<{ modules: any[] }>(`/classroom/offerings/${offeringId}/modules${q}`).then((r) => r.data);
  },

  getCoursePastPapers: (offeringId: number) =>
    API.client.get<{ papers: any[] }>(`/classroom/offerings/${offeringId}/past-papers`).then((r) => r.data),

  createModule: (offeringId: number, payload: Record<string, any>) =>
    API.client.post(`/classroom/offerings/${offeringId}/modules`, payload).then((r) => r.data),

  deleteModule: (moduleId: number) =>
    API.client.delete(`/classroom/modules/${moduleId}`).then((r) => r.data),

  addModuleFileItem: (moduleId: number, formData: FormData) =>
    API.client
      .post(`/classroom/modules/${moduleId}/items`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data),

  addModuleLinkItem: (moduleId: number, payload: Record<string, any>) =>
    API.client.post(`/classroom/modules/${moduleId}/items`, payload).then((r) => r.data),

  downloadModuleItemFile: (itemId: number) =>
    API.client.get<Blob>(`/classroom/module-items/${itemId}/file`, { responseType: 'blob' }).then((r) => r.data),

  deleteModuleItem: (itemId: number) =>
    API.client.delete(`/classroom/module-items/${itemId}`).then((r) => r.data),

  updateModuleItemProgress: (itemId: number, patch: { bookmarked?: boolean; completed?: boolean }) =>
    API.client.post(`/classroom/module-items/${itemId}/progress`, patch).then((r) => r.data),

  // Attendance & OD Leave
  listAttendanceSessions: (offeringId: number, section = 'ALL') =>
    API.client
      .get<{ sessions: any[] }>(
        `/classroom/offerings/${offeringId}/attendance/sessions?section=${encodeURIComponent(section)}`
      )
      .then((r) => r.data),

  listOdRequests: (offeringId: number) =>
    API.client.get<{ requests: any[] }>(`/classroom/offerings/${offeringId}/od-requests`).then((r) => r.data),

  getAttendanceAtRisk: (offeringId: number, section = 'ALL') =>
    API.client
      .get<{ students: any[] }>(
        `/classroom/offerings/${offeringId}/at-risk?section=${encodeURIComponent(section)}`
      )
      .then((r) => r.data),

  getMyAttendance: (offeringId: number, previewSection?: string | null) => {
    const q = previewSection ? `?section=${encodeURIComponent(previewSection)}` : '';
    return API.client.get<any>(`/classroom/offerings/${offeringId}/my-attendance${q}`).then((r) => r.data);
  },

  createAttendanceSession: (offeringId: number, payload: Record<string, any>) =>
    API.client
      .post<any>(`/classroom/offerings/${offeringId}/attendance/sessions`, payload)
      .then((r) => r.data),

  generateCheckinPin: (offeringId: number, payload: { section: string; duration_seconds: number }) =>
    API.client
      .post<any>(`/classroom/offerings/${offeringId}/attendance/checkin-pin`, payload)
      .then((r) => r.data),

  saveAttendanceRecords: (sessionId: number, records: any[]) =>
    API.client.put(`/classroom/attendance/sessions/${sessionId}/records`, { records }).then((r) => r.data),

  studentCheckin: (offeringId: number, pin: string) =>
    API.client
      .post<{ message?: string }>('/classroom/attendance/checkin', { offering_id: offeringId, pin })
      .then((r) => r.data),

  submitOdRequest: (offeringId: number, formData: FormData) =>
    API.client
      .post(`/classroom/offerings/${offeringId}/od-requests`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data),

  reviewOdRequest: (requestId: number, status: 'APPROVED' | 'REJECTED') =>
    API.client.patch(`/classroom/od-requests/${requestId}`, { status }).then((r) => r.data),

  getCalendarSyncLink: () =>
    API.client
      .get<{ ics_url: string; google_subscribe_url: string }>('/classroom/calendar/link')
      .then((r) => r.data),

  listCatalogCourses: () => API.client.get<any>('/courses').then((r) => r.data),

  // Quizzes & Question Bank
  listQuizzes: (offeringId: number, previewSection?: string | null) => {
    const q = previewSection
      ? `?preview=student&section=${encodeURIComponent(previewSection)}`
      : '';
    return API.client.get<{ quizzes: any[] }>(`/classroom/offerings/${offeringId}/quizzes${q}`).then((r) => r.data);
  },

  createQuiz: (offeringId: number, payload: Record<string, any>) =>
    API.client.post<{ message?: string }>(`/classroom/offerings/${offeringId}/quizzes`, payload).then((r) => r.data),

  deleteQuiz: (quizId: number) =>
    API.client.delete(`/classroom/quizzes/${quizId}`).then((r) => r.data),

  startQuiz: (quizId: number) =>
    API.client.post<any>(`/classroom/quizzes/${quizId}/start`).then((r) => r.data),

  submitQuizAttempt: (attemptId: number, answers: Record<string, any>) =>
    API.client.post<any>(`/classroom/quiz-attempts/${attemptId}/submit`, { answers }).then((r) => r.data),

  listQuestionBank: (courseCode: string) =>
    API.client
      .get<{ items: any[] }>(`/classroom/question-bank?course_code=${encodeURIComponent(courseCode)}`)
      .then((r) => r.data),

  addQuestionBankItem: (payload: Record<string, any>) =>
    API.client.post('/classroom/question-bank', payload).then((r) => r.data),

  deleteQuestionBankItem: (bankId: number) =>
    API.client.delete(`/classroom/question-bank/${bankId}`).then((r) => r.data),
};
