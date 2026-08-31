const fs = require('fs');
const path = require('path');

const rosterCode = fs.readFileSync(path.join(__dirname, '../client/js/roster.js'), 'utf8');

// Extract names/records from roster.js
const regex = /{\s*name:\s*"([^"]+)",\s*sex:\s*"([^"]+)",\s*course:\s*"([^"]+)",\s*year:\s*"([^"]+)"\s*}/g;
const records = [];
let m;
while ((m = regex.exec(rosterCode)) !== null) {
  records.push({
    name: m[1],
    sex: m[2],
    course: m[3],
    year: m[4]
  });
}

let sql = `-- Migration 017: Enrolled Students Master Roster Table & Seed

CREATE TABLE IF NOT EXISTS public.enrolled_students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  sex TEXT,
  department TEXT DEFAULT 'CoE',
  course TEXT NOT NULL,
  year_level TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast name searches
CREATE INDEX IF NOT EXISTS idx_enrolled_students_name ON public.enrolled_students (full_name);
CREATE INDEX IF NOT EXISTS idx_enrolled_students_course ON public.enrolled_students (course);

-- RLS Policies
ALTER TABLE public.enrolled_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read enrolled students" ON public.enrolled_students
  FOR SELECT TO authenticated USING (true);

-- Populate Master Roster
INSERT INTO public.enrolled_students (full_name, sex, department, course, year_level) VALUES
`;

const values = records.map(s => {
  const safeName = s.name.replace(/'/g, "''");
  return `  ('${safeName}', '${s.sex}', 'CoE', '${s.course}', '${s.year}')`;
});

sql += values.join(',\n') + ';\n';

fs.writeFileSync(path.join(__dirname, '../supabase/migrations/017_enrolled_students.sql'), sql);
console.log(`Generated 017_enrolled_students.sql with ${records.length} student records.`);
