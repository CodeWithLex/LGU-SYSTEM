const fs = require('fs');
const path = require('path');

const compoundPrefixes = [
  'DEL ROSARIO',
  'DELA CALZADA',
  'DELA CRUZ',
  'DELA RAMA',
  'DELA TORRE',
  'DELA CERNA',
  'DELA PEÑA',
  'DELA PENA',
  'DELA ROSA',
  'DELA SERNA',
  'DE CASTRO',
  'DE TORRES',
  'DE LOS SANTOS',
  'DE LOS REYES',
  'DE GUZMAN',
  'DE LEON',
  'DE VERA',
  'SAN JUAN',
  'SAN JOSE',
  'SAN PEDRO',
  'SANTA MARIA',
  'STA. MARIA',
  'STA MARIA'
];

function formatName(name) {
  let n = name.trim().toUpperCase();
  if (n.includes(',')) return n;
  for (const cp of compoundPrefixes) {
    if (n.startsWith(cp + ' ')) {
      return cp + ', ' + n.slice(cp.length + 1).trim();
    }
  }
  const parts = n.split(/\s+/);
  if (parts.length > 1) {
    return parts[0] + ', ' + parts.slice(1).join(' ');
  }
  return n;
}

const sqlPath = path.join(__dirname, '../supabase/migrations/017_enrolled_students.sql');
let sql = fs.readFileSync(sqlPath, 'utf8');

sql = sql.replace(/\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\)/g, (match, name, sex, dept, course, yr) => {
  const formatted = formatName(name).replace(/'/g, "''");
  return `('${formatted}', '${sex}', '${dept}', '${course}', '${yr}')`;
});

fs.writeFileSync(sqlPath, sql);
console.log('Successfully formatted names with comma separation in 017_enrolled_students.sql.');
