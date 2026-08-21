// Smoke test for the academic standing PDF: runs the exact drawing code
// extracted from server/routes/units.js with mock data, so we can verify the
// letterhead (banner + footer) lands on every page and the appendix is gone.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const PDFDocument = require('pdfkit');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'server', 'routes', 'units.js'), 'utf8');
const start = source.indexOf('const doc = new PDFDocument');
const end = source.indexOf('doc.end();') + 'doc.end();'.length;
const block = source.slice(start, end);

// ---- mock data (BSCoE curriculum, 4 years) ----
const PROGRAM_NAMES = {
  BSCoE: 'BS Computer Engineering',
  BSCE: 'BS Civil Engineering',
  BSECE: 'BS Electronics Engineering',
};
const SEM_LABELS = { 1: '1st Semester', 2: '2nd Semester', 3: 'Summer Term' };
const SEM_SHORT = { 1: '1st Sem', 2: '2nd Sem', 3: 'Summer' };
const STATUS_LABELS = {
  enrolled: 'Enrolled', passed: 'Passed', failed: 'Failed',
  dropped: 'Dropped', incomplete: 'Incomplete',
};

let id = 0;
const subjects = [];
const records = [];
const statuses = ['passed', 'passed', 'passed', 'passed', 'enrolled'];
const grades = [1.25, 1.5, 1.75, 2.0, null];
[1, 2, 3, 4].forEach((year, yi) => {
  [1, 2].forEach((sem) => {
    for (let n = 1; n <= 5; n++) {
      const s = {
        id: `subj-${++id}`, program: 'BSCoE', year_level: year, semester: sem,
        code: `BSC${year}${sem}${n}`, units: n === 5 ? 1 : 3,
        title: `Subject ${year}-${sem} No. ${n} with a somewhat longer descriptive title`,
      };
      subjects.push(s);
      const st = statuses[(id + yi + sem) % statuses.length];
      records.push({
        id: `rec-${id}`, student_id: 'u1', subject_id: s.id,
        school_year: `20${22 + yi}-20${23 + yi}`, semester: sem,
        status: st, grade: st === 'passed' ? grades[(id + yi) % grades.length] : null,
      });
    }
  });
});

const total = subjects.reduce((a, s) => a + Number(s.units || 0), 0);
const passedIds = new Set(records.filter(r => r.status === 'passed').map(r => r.subject_id));
const completed = subjects.filter(s => passedIds.has(s.id)).reduce((a, s) => a + Number(s.units || 0), 0);
const pct = Math.min(100, Math.round((completed / total) * 100));
const recordBySubject = new Map();
records.forEach(r => { if (!recordBySubject.has(r.subject_id)) recordBySubject.set(r.subject_id, r); });

const outFile = path.join(root, 'scripts', 'standing-smoke.pdf');
// doc.pipe(res) needs a real writable stream (like the Express response).
const out = fs.createWriteStream(outFile);
const res = Object.assign(out, { setHeader() {} });

const sandbox = {
  fs, path, PDFDocument,
  __dirname: path.join(root, 'server', 'routes'),
  console,
  doc: null,
  fullName: 'Juan Dela Cruz',
  studentProgram: 'BSCoE',
  enrolledYear: 2022,
  gradYear: 2026,
  subjects, records, total, passedIds, completed, pct, recordBySubject,
  req: { user: { email: 'juan@corjesu.edu.ph' } },
  res,
  PROGRAM_NAMES, SEM_LABELS, SEM_SHORT, STATUS_LABELS,
};
vm.createContext(sandbox);
vm.runInContext(block, sandbox, { filename: 'standing-route.js' });
out.on('close', () => console.log('PDF written:', outFile));
out.on('error', (e) => { console.error('write error', e); process.exit(1); });
