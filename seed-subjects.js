// =============================================
// seed-subjects.js — Seed the Credit Unit Tracker curriculum
// Fallback for environments where the SQL migration
// (supabase/migrations/005_credit_unit_tracker.sql) cannot be
// applied through the SQL console. Safe to re-run — subjects that
// are no longer in the prospectus are pruned, everything else is
// upserted. Note: student records for pruned subjects are removed
// by the FK (ON DELETE CASCADE).
//
// Usage: node seed-subjects.js
// Requires SUPABASE_URL + SUPABASE_SERVICE_KEY in .env
// =============================================
require('dotenv').config();
const supabase = require('./server/lib/supabase');

// Curriculum data transcribed from the official PROSPECTUS.docx.
// Totals must stay in sync with supabase/migrations/005_credit_unit_tracker.sql
const REQUIREMENTS = [
  {
    "program": "BSCoE",
    "total_units": 189,
    "total_subjects": 67
  },
  {
    "program": "BSECE",
    "total_units": 204,
    "total_subjects": 68
  },
  {
    "program": "BSCE",
    "total_units": 213,
    "total_subjects": 75
  }
];

// [code, title, units, program, year_level, semester, prerequisites, is_elective]
const SUBJECTS = [
[
"RS 1",
"God's Salvific Act",
3,
"BSCoE",
1,
1,
null,
false
],
[
"CpE 111",
"Computer Engineering as a Discipline",
1,
"BSCoE",
1,
1,
null,
false
],
[
"CpE 112",
"Programming Logic and Design",
2,
"BSCoE",
1,
1,
null,
false
],
[
"CpE 113",
"Computer System Servicing",
1,
"BSCoE",
1,
1,
null,
false
],
[
"EMath 100",
"Math of Engineering",
3,
"BSCoE",
1,
1,
null,
false
],
[
"EMath 111",
"Calculus 1",
4,
"BSCoE",
1,
1,
null,
false
],
[
"EChem 111",
"Chemistry for Engineers",
4,
"BSCoE",
1,
1,
null,
false
],
[
"Gen Ed 4",
"Mathematics in the World",
3,
"BSCoE",
1,
1,
null,
false
],
[
"PE 1",
"Physical Education 1",
2,
"BSCoE",
1,
1,
null,
false
],
[
"NSTP 1",
"NSTP 1",
3,
"BSCoE",
1,
1,
null,
false
],
[
"RS 2",
"Jesus the Kingdom of God",
3,
"BSCoE",
1,
2,
"RS 1",
false
],
[
"CpE 121",
"Object Oriented Programming",
2,
"BSCoE",
1,
2,
"CpE 112",
false
],
[
"EMath 121",
"Calculus 2",
4,
"BSCoE",
1,
2,
"EMath 111",
false
],
[
"EMath 122",
"Discrete Mathematics",
3,
"BSCoE",
1,
2,
"EMath 111",
false
],
[
"EPhys 121",
"Physics for Engineers",
4,
"BSCoE",
1,
2,
"EMath 111",
false
],
[
"Gen Ed 1",
"Understanding the Self",
3,
"BSCoE",
1,
2,
null,
false
],
[
"GE E1",
"General Education Elective 1",
3,
"BSCoE",
1,
2,
null,
true
],
[
"PE 2",
"Physical Education 2",
2,
"BSCoE",
1,
2,
"PE 1",
false
],
[
"NSTP 2",
"NSTP 2",
3,
"BSCoE",
1,
2,
"NSTP 1",
false
],
[
"RS 3",
"The Church and Her Celebrations",
3,
"BSCoE",
2,
1,
"RS 2",
false
],
[
"CpE 211",
"Data Structures and Algorithms",
2,
"BSCoE",
2,
1,
"CpE 121",
false
],
[
"CpE 212",
"Fundamentals of Electric Circuits",
4,
"BSCoE",
2,
1,
"EPhys 121",
false
],
[
"EMath 211",
"Differential Equations",
3,
"BSCoE",
2,
1,
"EMath 121",
false
],
[
"ES 211",
"Engineering Economics",
3,
"BSCoE",
2,
1,
"2nd Yr Standing",
false
],
[
"Gen Ed 6",
"Arts Appreciation",
3,
"BSCoE",
2,
1,
null,
false
],
[
"Gen Ed 7",
"Science, Technology and Society",
3,
"BSCoE",
2,
1,
null,
false
],
[
"PE 3",
"Physical Education 3",
2,
"BSCoE",
2,
1,
"PE 2",
false
],
[
"SklDrv",
"Basic Skill in Driving",
1,
"BSCoE",
2,
1,
null,
false
],
[
"RS 4",
"Christian Discipleship: Stewardship & Morality",
3,
"BSCoE",
2,
2,
"RS 3",
false
],
[
"CpE 221",
"Numerical Methods",
4,
"BSCoE",
2,
2,
"EMath 211",
false
],
[
"CpE 222",
"Software Design",
4,
"BSCoE",
2,
2,
"CpE 211",
false
],
[
"CpE 223",
"Fundamentals of Electronic Circuits",
4,
"BSCoE",
2,
2,
"CpE 212",
false
],
[
"ES 221",
"Computer-Aided Drafting",
1,
"BSCoE",
2,
2,
"2nd Yr Standing",
false
],
[
"Gen Ed 5",
"Purposive Communication",
3,
"BSCoE",
2,
2,
null,
false
],
[
"Gen Ed 8",
"Ethics",
3,
"BSCoE",
2,
2,
null,
false
],
[
"PE 4",
"Physical Education 4",
2,
"BSCoE",
2,
2,
"PE 3",
false
],
[
"CpE 311",
"Logic Circuits and Design",
4,
"BSCoE",
3,
1,
"CpE 223",
false
],
[
"CpE 312",
"Methods of Research",
2,
"BSCoE",
3,
1,
"EMath 123",
false
],
[
"CpE 313",
"Data and Digital Communications",
3,
"BSCoE",
3,
1,
"CpE 223",
false
],
[
"CpE 315",
"Feedback and Control Systems",
3,
"BSCoE",
3,
1,
"CpE 223; CpE 112",
false
],
[
"CpE 316",
"Fundamentals of Mixed Signals and Sensors",
3,
"BSCoE",
3,
1,
"CpE 212",
false
],
[
"CpE 317",
"Computer Engineering Drafting and Design",
1,
"BSCoE",
3,
1,
"CpE 223",
false
],
[
"CpE 318",
"Computer Architecture and Organization",
4,
"BSCoE",
3,
1,
"Co-req CpE 223",
false
],
[
"EMath 311",
"Engineering Data Analysis",
3,
"BSCoE",
3,
1,
"EMath 111",
false
],
[
"GE E2",
"General Education Elective 2",
3,
"BSCoE",
3,
1,
null,
true
],
[
"CpE 321",
"Basic Occupational Health and Safety",
3,
"BSCoE",
3,
2,
"3rd Yr Standing",
false
],
[
"CpE 322",
"Computer Networks and Security",
4,
"BSCoE",
3,
2,
"CpE 313",
false
],
[
"CpE 323",
"Microprocessor",
4,
"BSCoE",
3,
2,
"CpE 311",
false
],
[
"CpE 324",
"Operating System",
3,
"BSCoE",
3,
2,
"CpE 211",
false
],
[
"CpE 325",
"Cognate/Elective 1",
3,
"BSCoE",
3,
2,
null,
true
],
[
"CpE 327",
"Introduction to HDL",
1,
"BSCoE",
3,
2,
"CpE 112; CpE 223",
false
],
[
"ES 321",
"Technopreneurship",
3,
"BSCoE",
3,
2,
"3rd Yr Standing",
false
],
[
"Gen Ed 9",
"Life and Works of Rizal",
3,
"BSCoE",
3,
2,
null,
false
],
[
"CpE 411",
"CpE Practice Design 1",
1,
"BSCoE",
4,
1,
"CpE 323; CpE 324",
false
],
[
"CpE 413",
"Embedded Systems",
4,
"BSCoE",
4,
1,
"CpE 323",
false
],
[
"CpE 414",
"Digital Signal Processing",
4,
"BSCoE",
4,
1,
"CpE 315",
false
],
[
"CpE 415",
"Cognate/Elective 2",
3,
"BSCoE",
4,
1,
"4th Yr Standing",
true
],
[
"CpE 416",
"Cognate/Elective 3",
3,
"BSCoE",
4,
1,
"4th Yr Standing",
true
],
[
"FL 1",
"Foreign Language",
3,
"BSCoE",
4,
1,
null,
false
],
[
"Gen Ed 2",
"Readings in Philippine History",
3,
"BSCoE",
4,
1,
null,
false
],
[
"Gen Ed 3",
"Contemporary World",
3,
"BSCoE",
4,
1,
null,
false
],
[
"CpE 421",
"CpE Practice and Design 2",
2,
"BSCoE",
4,
2,
"CpE 411",
false
],
[
"CpE 422",
"Seminars and Field Trips",
1,
"BSCoE",
4,
2,
"4th Yr Standing",
false
],
[
"CpE 423",
"On the Job Training",
3,
"BSCoE",
4,
2,
"*240 hours / 4th Yr Standing",
false
],
[
"CpE 424",
"Emerging Technologies in CpE",
3,
"BSCoE",
4,
2,
"3rd Yr Standing",
false
],
[
"CpE 425",
"CpE Laws and Professional Practice",
2,
"BSCoE",
4,
2,
"2nd Yr Standing",
false
],
[
"GE E3",
"General Education Elective 3",
3,
"BSCoE",
4,
2,
null,
true
],
[
"RS 1",
"God's Salvific Act",
3,
"BSECE",
1,
1,
null,
false
],
[
"EMath 100",
"Mathematics for Engineers",
3,
"BSECE",
1,
1,
null,
false
],
[
"EMath 111",
"Calculus 1",
4,
"BSECE",
1,
1,
null,
false
],
[
"EChem 111",
"Chemistry for Engineers",
4,
"BSECE",
1,
1,
null,
false
],
[
"Comp 111",
"Basic Computer Programming",
1,
"BSECE",
1,
1,
null,
false
],
[
"Gen Ed 2",
"Readings in Philippine History",
3,
"BSECE",
1,
1,
null,
false
],
[
"Gen Ed 4",
"Mathematics in the Modern World",
3,
"BSECE",
1,
1,
null,
false
],
[
"PE 1",
"Physical Education 1",
2,
"BSECE",
1,
1,
null,
false
],
[
"NSTP 1",
"NSTP 1",
3,
"BSECE",
1,
1,
null,
false
],
[
"RS 2",
"Jesus and the Kingdom of God",
3,
"BSECE",
1,
2,
"RS 1",
false
],
[
"Comp 121",
"Computer Programming",
2,
"BSECE",
1,
2,
"Comp 111",
false
],
[
"EMath 121",
"Calculus 2",
4,
"BSECE",
1,
2,
"EMath 111",
false
],
[
"EPhys 121",
"Physics for Engineers",
4,
"BSECE",
1,
2,
"EMath 111",
false
],
[
"EPhys 122",
"Physics 2",
4,
"BSECE",
1,
2,
"Co: Ephys 121",
false
],
[
"ECE 121",
"Materials Science and Engineering",
3,
"BSECE",
1,
2,
"EChem 111",
false
],
[
"EDraw 121",
"Computer-Aided Drafting",
1,
"BSECE",
1,
2,
null,
false
],
[
"PE 2",
"Physical Education 2",
2,
"BSECE",
1,
2,
"PE 1",
false
],
[
"NSTP 2",
"NSTP 2",
3,
"BSECE",
1,
2,
"NSTP 1",
false
],
[
"RS 3",
"The Church and Her Celebrations",
3,
"BSECE",
2,
1,
"RS 2",
false
],
[
"ECE 210",
"Electronics Engineering Drafting and Design",
1,
"BSECE",
2,
1,
null,
false
],
[
"EMath 211",
"Differential Equations",
3,
"BSECE",
2,
1,
"EMath 121",
false
],
[
"ECE 211",
"Circuits 1",
4,
"BSECE",
2,
1,
"Ephys 122",
false
],
[
"ECE 212",
"Electronics 1: Electronics Devices and Circuits",
4,
"BSECE",
2,
1,
"Co: ECE 211",
false
],
[
"ES 211",
"Engineering Management",
2,
"BSECE",
2,
1,
null,
false
],
[
"Gen Ed 3",
"The Contemporary World",
3,
"BSECE",
2,
1,
null,
false
],
[
"Gen Ed 6",
"Art Appreciation",
3,
"BSECE",
2,
1,
null,
false
],
[
"Gen Ed 7",
"Science, Technology and Society",
3,
"BSECE",
2,
1,
null,
false
],
[
"PE 3",
"Physical Education 3",
2,
"BSECE",
2,
1,
"PE 2",
false
],
[
"RS 4",
"Christian Discipleship: Stewardship & Morality",
3,
"BSECE",
2,
2,
"RS 3",
false
],
[
"EMath 221",
"Advanced Engineering Mathematics for ECE",
4,
"BSECE",
2,
2,
"EMath 211",
false
],
[
"ECE 221",
"Circuits 2",
4,
"BSECE",
2,
2,
"ECE 211",
false
],
[
"ECE 222",
"Electronics 2: Electronics Circuit Analysis and Design",
4,
"BSECE",
2,
2,
"ECE 212",
false
],
[
"ECE 223",
"Communications 1: Principles of Communication Systems",
4,
"BSECE",
2,
2,
"Co: ECE 222",
false
],
[
"ECE 224",
"Electromagnetics",
4,
"BSECE",
2,
2,
"Emath 211",
false
],
[
"Gen Ed 1",
"Understanding the Self",
3,
"BSECE",
2,
2,
null,
false
],
[
"PE 4",
"Physical Education 4",
2,
"BSECE",
2,
2,
"PE 3",
false
],
[
"ECE 312",
"Electronics 3: Electronic Systems and Design",
4,
"BSECE",
3,
1,
"ECE 222",
false
],
[
"ECE 313",
"Communications 2: Modulation and Coding Techniques",
4,
"BSECE",
3,
1,
"ECE 223",
false
],
[
"ECE 314",
"Digital Electronics 1: Logic Circuits and Design",
4,
"BSECE",
3,
1,
"ECE 212",
false
],
[
"ECE 315",
"Feedback and Control Systems",
4,
"BSECE",
3,
1,
"Emath 221",
false
],
[
"EMath 311",
"Engineering Data Analysis",
3,
"BSECE",
3,
1,
null,
false
],
[
"ES 311",
"Engineering Economics",
3,
"BSECE",
3,
1,
null,
false
],
[
"ECE 316",
"Methods of Research",
3,
"BSECE",
3,
1,
"3rd Year Standing",
false
],
[
"GE L1",
"General Education Elective 1",
3,
"BSECE",
3,
1,
null,
true
],
[
"ECE 323",
"Communications 3: Data Communications",
4,
"BSECE",
3,
2,
"ECE 313",
false
],
[
"ECE 324",
"Communications 4: Transmission Media and Antenna System and Design",
4,
"BSECE",
3,
2,
"ECE 313",
false
],
[
"ECE 325",
"Digital Electronics 2: Microprocessor, Microcontroller System and Design",
4,
"BSECE",
3,
2,
"ECE 314",
false
],
[
"ECE 326",
"Signals, Spectra and Signal Processing",
4,
"BSECE",
3,
2,
"Emath 221",
false
],
[
"ES 321",
"Environmental Science and Engineering",
3,
"BSECE",
3,
2,
null,
false
],
[
"Gen Ed 5",
"Purposive Communication",
3,
"BSECE",
3,
2,
null,
false
],
[
"GE L2",
"General Education Elective 2",
3,
"BSECE",
3,
2,
null,
true
],
[
"ES 322",
"Technopreneurship",
3,
"BSECE",
3,
2,
null,
false
],
[
"ECE 410",
"Design 1/Capstone Project 1",
1,
"BSECE",
4,
1,
"4th Year Standing",
false
],
[
"ECE L1",
"ECE Elective 1",
4,
"BSECE",
4,
1,
"4th Year Standing",
true
],
[
"ECE 411",
"Seminars/Colloquium",
1,
"BSECE",
4,
1,
"4th Year Standing",
false
],
[
"ECE 412",
"ECE Laws, Contracts, Ethics, Standards and Safety",
3,
"BSECE",
4,
1,
null,
false
],
[
"ECE 413",
"ECE Correlation Course 1",
3,
"BSECE",
4,
1,
null,
false
],
[
"ECE 414",
"ECE Correlation Course 2",
3,
"BSECE",
4,
1,
null,
false
],
[
"Gen Ed 8",
"Ethics",
3,
"BSECE",
4,
1,
null,
false
],
[
"Gen Ed 9",
"Life and Works of Rizal",
3,
"BSECE",
4,
1,
null,
false
],
[
"FL 1",
"Foreign Language",
3,
"BSECE",
4,
1,
null,
false
],
[
"Skl Dev 1",
"Computer System Servicing",
1,
"BSECE",
4,
1,
null,
false
],
[
"Skl Dev 2",
"Driving Mechanics",
1,
"BSECE",
4,
1,
null,
false
],
[
"ECE 420",
"Design 2/Capstone Project 2",
1,
"BSECE",
4,
2,
"ECE 410",
false
],
[
"ECE L2",
"ECE Elective 2",
4,
"BSECE",
4,
2,
"ECE L1",
true
],
[
"GE L3",
"General Education Elective 3",
3,
"BSECE",
4,
2,
null,
true
],
[
"ECE 423",
"ECE Correlation Course 3",
3,
"BSECE",
4,
2,
null,
false
],
[
"ECE 400",
"On-the-Job Training - 320 Hours",
3,
"BSECE",
4,
2,
null,
false
],
[
"RS 1",
"God's Salvific Act",
3,
"BSCE",
1,
1,
null,
false
],
[
"EMath 100",
"Mathematics of Engineering",
3,
"BSCE",
1,
1,
null,
false
],
[
"EMath 111",
"Calculus 1 (Differential Calculus)",
4,
"BSCE",
1,
1,
null,
false
],
[
"EDraw 111",
"Engineering Drawings and Plans",
2,
"BSCE",
1,
1,
null,
false
],
[
"CE 100",
"Civil Engineering Orientation",
2,
"BSCE",
1,
1,
null,
false
],
[
"GEN ED 2",
"Readings in Philippine History",
3,
"BSCE",
1,
1,
null,
false
],
[
"GEN ED 3",
"Contemporary World",
3,
"BSCE",
1,
1,
null,
false
],
[
"GEN ED 4",
"Mathematics in the Modern World",
3,
"BSCE",
1,
1,
null,
false
],
[
"PE 1",
"Physical Education 1",
2,
"BSCE",
1,
1,
null,
false
],
[
"NSTP 1",
"NSTP 1",
3,
"BSCE",
1,
1,
null,
false
],
[
"RS 2",
"Jesus and The Kingdom of God",
3,
"BSCE",
1,
2,
"RS 1",
false
],
[
"EMath 121",
"Calculus 2 (Integral Calculus)",
4,
"BSCE",
1,
2,
"EMath 100, EMath 111",
false
],
[
"EPhys 121",
"Physics for Engineers (Calculus-based)",
4,
"BSCE",
1,
2,
"EMath 111, co-requisite: EMath 121",
false
],
[
"EChem 121",
"Chemistry for Engineers",
4,
"BSCE",
1,
2,
null,
false
],
[
"Comp 121",
"Computer Fundamentals and Programming",
2,
"BSCE",
1,
2,
null,
false
],
[
"GE L1",
"General Elective 1",
3,
"BSCE",
1,
2,
null,
true
],
[
"GEN ED 6",
"Arts Appreciation",
3,
"BSCE",
1,
2,
null,
false
],
[
"PE 2",
"Physical Education 2",
2,
"BSCE",
1,
2,
"PE 1",
false
],
[
"NSTP 2",
"NSTP 2",
3,
"BSCE",
1,
2,
"NSTP 1",
false
],
[
"RS 3",
"The Church and Her Celebrations",
3,
"BSCE",
2,
1,
"RS 2",
false
],
[
"GE L2",
"General Elective 2",
3,
"BSCE",
2,
1,
null,
true
],
[
"EMath 211",
"Differential Equations",
3,
"BSCE",
2,
1,
"EMath 121",
false
],
[
"EDraw 211",
"Computer-Aided Drafting",
1,
"BSCE",
2,
1,
"EDraw 111",
false
],
[
"ESurv 211",
"Fundamentals of Surveying",
4,
"BSCE",
2,
1,
"EDraw 111",
false
],
[
"CE 211",
"Statics of Rigid Bodies",
3,
"BSCE",
2,
1,
"EMath 121, EPhys 121",
false
],
[
"CE 212",
"Engineering Utilities 1",
3,
"BSCE",
2,
1,
"EPhys 121",
false
],
[
"EGeo 211",
"Geology For Engineers",
2,
"BSCE",
2,
1,
"EChem 121",
false
],
[
"GEN ED 7",
"Science, Technology and Society",
3,
"BSCE",
2,
1,
null,
false
],
[
"PE 3",
"Physical Education 3",
2,
"BSCE",
2,
1,
"PE 2",
false
],
[
"RS 4",
"Christian Discipleship: Stewardship & Morality",
3,
"BSCE",
2,
2,
"RS 3",
false
],
[
"EMath 221",
"Numerical Solutions to CE Problems",
3,
"BSCE",
2,
2,
"EMath 211",
false
],
[
"CE 221",
"Dynamics of Rigid Bodies",
2,
"BSCE",
2,
2,
"CE 211; co-requisite: CE 222",
false
],
[
"CE 222",
"Mechanics of Deformable Bodies",
4,
"BSCE",
2,
2,
"CE 211",
false
],
[
"CE 223",
"Engineering Economics",
3,
"BSCE",
2,
2,
"2nd Year Standing",
false
],
[
"CE 224",
"Highway and Railroad Engineering",
3,
"BSCE",
2,
2,
"ESurv 211",
false
],
[
"CE 225",
"Engineering Utilities 2",
3,
"BSCE",
2,
2,
"EPhys 121",
false
],
[
"CE 226",
"Hydrology",
2,
"BSCE",
2,
2,
"EMath 121",
false
],
[
"GEN ED 1",
"Understanding the Self",
3,
"BSCE",
2,
2,
null,
false
],
[
"PE 4",
"Physical Education 4",
2,
"BSCE",
2,
2,
"PE 3",
false
],
[
"GEN ED 5",
"Purposive Communication",
3,
"BSCE",
3,
1,
null,
false
],
[
"EMath 311",
"Engineering Data Analysis",
3,
"BSCE",
3,
1,
"3rd Year Standing",
false
],
[
"CE 311",
"Structural Theory",
5,
"BSCE",
3,
1,
"CE 222",
false
],
[
"CE 312",
"Building Systems Design",
3,
"BSCE",
3,
1,
"EDraw 111; CE 225",
false
],
[
"CE 313",
"Principles of Transportation Engineering",
3,
"BSCE",
3,
1,
"CE 224",
false
],
[
"CE 314",
"Geotechnical Engineering 1 (Soil Mechanics)",
4,
"BSCE",
3,
1,
"EGeo 211, CE 222",
false
],
[
"CE 315",
"Construction Materials & Testing",
3,
"BSCE",
3,
1,
"CE 222",
false
],
[
"CE 316",
"Methods of Research for CE",
3,
"BSCE",
3,
1,
"3rd Year Standing",
false
],
[
"SMAW",
"Welding Technology",
1,
"BSCE",
3,
1,
null,
false
],
[
"GEN ED 8",
"Ethics",
3,
"BSCE",
3,
2,
null,
false
],
[
"GEN ED 9",
"Life and Works of Rizal",
3,
"BSCE",
3,
2,
null,
false
],
[
"ES 321",
"Technopreneurship 101",
3,
"BSCE",
3,
2,
"3rd Year Standing",
false
],
[
"CE 321",
"Principles of Steel Design",
3,
"BSCE",
3,
2,
"CE 222; CE 311",
false
],
[
"CE 322",
"Principles of Reinforced/Prestressed Concrete",
4,
"BSCE",
3,
2,
"CE 311",
false
],
[
"CE 323",
"Hydraulics",
5,
"BSCE",
3,
2,
"CE 221; CE 222",
false
],
[
"CE 324",
"Quantity Surveying",
2,
"BSCE",
3,
2,
"CE 312",
false
],
[
"CE 325",
"Engineering Management",
2,
"BSCE",
3,
2,
"3rd Year Standing",
false
],
[
"CE 326",
"CE Special Topics 1",
3,
"BSCE",
3,
2,
"EMath 311; CE 313",
false
],
[
"GE L3",
"General Elective 3",
3,
"BSCE",
3,
3,
"3rd Year Standing",
true
],
[
"FL 1",
"Foreign Languages",
3,
"BSCE",
3,
3,
null,
false
],
[
"CE 400",
"Safety Management",
2,
"BSCE",
3,
3,
"3rd Year Standing",
false
],
[
"Skl Dv 1",
"Driving Mechanics",
1,
"BSCE",
3,
3,
null,
false
],
[
"CE 411",
"CE Project 1",
2,
"BSCE",
4,
1,
"4th Year Standing",
false
],
[
"CE 412",
"Construction Methods & Project Mgt",
4,
"BSCE",
4,
1,
"4th Year Standing",
false
],
[
"CE 413",
"CE Laws, Ethics & Contracts",
2,
"BSCE",
4,
1,
"4th Year Standing",
false
],
[
"CE 414",
"Professional Course - Specialized 1",
3,
"BSCE",
4,
1,
"4th Year Standing",
true
],
[
"CE 415",
"Professional Course - Specialized 2",
3,
"BSCE",
4,
1,
"4th Year Standing",
true
],
[
"CE 416",
"Professional Course - Specialized 3",
3,
"BSCE",
4,
1,
"4th Year Standing",
true
],
[
"CE 417",
"Professional Course - Specialized 4",
3,
"BSCE",
4,
1,
"4th Year Standing",
true
],
[
"CE 418",
"Computer Applications for Civil Engrs",
1,
"BSCE",
4,
1,
"4th Year Standing",
false
],
[
"CE 419",
"CE Special Topics 2",
3,
"BSCE",
4,
1,
"CE 326",
false
],
[
"CE 421",
"CE Project 2",
2,
"BSCE",
4,
2,
"CE 411",
false
],
[
"CE 422",
"Seminars and Field Trips",
2,
"BSCE",
4,
2,
"CE 411",
false
],
[
"CE 423",
"Professional Course - Specialized 5",
3,
"BSCE",
4,
2,
"4th Year Standing",
true
],
[
"CE 424",
"On-the-Job Training",
3,
"BSCE",
4,
2,
"4th Year Standing",
false
],
[
"CE 425",
"CE Special Topics 3",
3,
"BSCE",
4,
2,
"CE 419",
false
]
];

async function main() {
  console.log('[seed] Upserting curriculum requirements…');
  const { error: reqErr } = await supabase
    .from('curriculum_requirements')
    .upsert(REQUIREMENTS, { onConflict: 'program' });
  if (reqErr) throw reqErr;

  console.log(`[seed] Upserting ${SUBJECTS.length} subjects…`);
  const rows = SUBJECTS.map(([code, title, units, program, year_level, semester, prerequisites, is_elective]) => ({
    code, title, units, program, year_level, semester, prerequisites, is_elective,
  }));

  // Prune subjects that are no longer in the prospectus so the
  // tracker always mirrors the document exactly.
  for (const program of REQUIREMENTS.map(r => r.program)) {
    const { data: existing } = await supabase
      .from('subjects')
      .select('code')
      .eq('program', program);
    const keep = new Set(rows.filter(r => r.program === program).map(r => r.code));
    const stale = (existing || []).filter(s => !keep.has(s.code));
    if (stale.length) {
      console.log(`[seed] Removing ${stale.length} stale ${program} subjects: ${stale.map(s => s.code).join(', ')}`);
      const { error: delErr } = await supabase
        .from('subjects')
        .delete()
        .eq('program', program)
        .in('code', stale.map(s => s.code));
      if (delErr) throw delErr;
    }
  }

  const { error: subjErr } = await supabase
    .from('subjects')
    .upsert(rows, { onConflict: 'program,code' });
  if (subjErr) throw subjErr;

  console.log('[seed] Done. Curriculum is ready for the Credit Unit Tracker.');
}

main().catch(err => {
  console.error('[seed] FAILED:', err.message);
  process.exit(1);
});
