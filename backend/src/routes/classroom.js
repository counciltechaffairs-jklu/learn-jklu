import { createAsyncRouter } from '../utils/routerHelper.js';
import classroomOfferingsRouter, {
  GRADE_BUCKETS,
  ATTENDANCE_BUCKETS,
  bucketValues,
} from './classroomOfferings.js';
import classroomStreamRouter from './classroomStream.js';
import classroomAssignmentsRouter from './classroomAssignments.js';
import classroomMarksExcelRouter from './classroomMarksExcel.js';

export { GRADE_BUCKETS, ATTENDANCE_BUCKETS, bucketValues };

const router = createAsyncRouter();

router.use(classroomOfferingsRouter);
router.use(classroomStreamRouter);
router.use(classroomAssignmentsRouter);
router.use(classroomMarksExcelRouter);

export default router;
