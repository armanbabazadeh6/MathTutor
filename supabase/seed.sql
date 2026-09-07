-- supabase/seed.sql
-- Seed: full skill taxonomy (mirrors src/lib/skills.ts exactly — 45 skills),
-- one demo student (username+PIN stub), and 3 starter achievements.
-- Idempotent: safe to re-run (upserts on PK / unique columns).
--
-- NOTE: users.pin_hash below is a STUB PLACEHOLDER, not a real hash. It exists
-- so local development can exercise the username+PIN flow in src/lib/auth.ts
-- before Supabase Auth is wired. Never store production credentials here.

-- ------------------------------------------------------------ skills ------
-- Operations & Algebraic Thinking (10)
insert into public.skills (id, domain, name, description) values
  ('oa-mult-1digit', 'operations-algebraic', 'Multiply 1-digit numbers', 'Recall and apply single-digit multiplication facts fluently.'),
  ('oa-div-facts', 'operations-algebraic', 'Division facts', 'Solve division problems using known multiplication facts.'),
  ('oa-mult-digit-1digit', 'operations-algebraic', 'Multiply multi-digit by 1-digit', 'Multiply numbers up to 4 digits by a 1-digit number with regrouping.'),
  ('oa-mult-2digit-2digit', 'operations-algebraic', 'Multiply 2-digit by 2-digit', 'Use place value and partial products to multiply two 2-digit numbers.'),
  ('oa-div-1digit-divisor', 'operations-algebraic', 'Divide with 1-digit divisors', 'Divide up to 4-digit dividends by 1-digit divisors, with remainders.'),
  ('oa-multistep-word', 'operations-algebraic', 'Multi-step word problems', 'Solve two-step word problems with all four operations, interpreting remainders.'),
  ('oa-factor-pairs', 'operations-algebraic', 'Factor pairs', 'Find all factor pairs for whole numbers up to 100.'),
  ('oa-multiples-prime', 'operations-algebraic', 'Multiples, prime & composite', 'Identify multiples and classify numbers as prime or composite.'),
  ('oa-patterns', 'operations-algebraic', 'Number & shape patterns', 'Generate and analyze patterns from a rule; spot features not in the rule.'),
  ('oa-remainders', 'operations-algebraic', 'Interpreting remainders', 'Decide what a remainder means in context: round up, drop, or split.'),
  -- Base Ten (9)
  ('bt-place-value', 'base-ten', 'Place value to 1,000,000', 'Read, write, and compare multi-digit numbers using base-ten structure.'),
  ('bt-rounding', 'base-ten', 'Rounding', 'Round multi-digit numbers to any place using place-value reasoning.'),
  ('bt-add-multidigit', 'base-ten', 'Add multi-digit numbers', 'Fluently add multi-digit whole numbers with regrouping.'),
  ('bt-sub-multidigit', 'base-ten', 'Subtract multi-digit numbers', 'Fluently subtract multi-digit whole numbers with regrouping.'),
  ('bt-add-sub-word', 'base-ten', 'Add/subtract word problems', 'Solve multi-digit addition and subtraction word problems.'),
  ('bt-multiply-10s', 'base-ten', 'Multiply by powers of 10', 'Multiply whole numbers by 10, 100, and 1,000 using place-value shifts.'),
  ('bt-estimate', 'base-ten', 'Estimate with rounding', 'Use rounding to estimate answers and check reasonableness.'),
  ('bt-compare-order', 'base-ten', 'Compare & order', 'Compare multi-digit numbers with <, >, = and order them.'),
  ('bt-expanded-form', 'base-ten', 'Expanded form', 'Write numbers in expanded form and rebuild them from parts.'),
  -- Fractions (10)
  ('fr-equiv', 'fractions', 'Equivalent fractions', 'Recognize and generate equivalent fractions using visual models.'),
  ('fr-compare', 'fractions', 'Compare fractions', 'Compare two fractions with different numerators/denominators using benchmarks.'),
  ('fr-add-like', 'fractions', 'Add fractions, like denominators', 'Add fractions with the same denominator and simplify.'),
  ('fr-sub-like', 'fractions', 'Subtract fractions, like denominators', 'Subtract fractions with the same denominator and simplify.'),
  ('fr-add-unlike-10-100', 'fractions', 'Add tenths & hundredths', 'Add fractions with denominators 10 and 100 by converting.'),
  ('fr-mixed-numbers', 'fractions', 'Mixed numbers', 'Convert between mixed numbers and improper fractions; decompose them.'),
  ('fr-mult-fraction-whole', 'fractions', 'Multiply fraction by whole number', 'Multiply a fraction by a whole number using repeated addition and models.'),
  ('fr-fraction-word', 'fractions', 'Fraction word problems', 'Solve word problems with fraction addition, subtraction, and scaling.'),
  ('fr-decimals-tenths', 'fractions', 'Decimals: tenths & hundredths', 'Read, write, and model decimals to hundredths; relate to fractions.'),
  ('fr-compare-decimals', 'fractions', 'Compare decimals', 'Compare two decimals to hundredths using place value.'),
  -- Measurement & Data (9)
  ('md-length-convert', 'measurement-data', 'Convert length units', 'Convert between km, m, cm and in, ft, yd, mi in measurement problems.'),
  ('md-mass-capacity', 'measurement-data', 'Mass & capacity units', 'Convert between g/kg and ml/L; solve measurement word problems.'),
  ('md-time', 'measurement-data', 'Time: convert & elapsed', 'Convert time units and solve elapsed-time word problems.'),
  ('md-money', 'measurement-data', 'Money problems', 'Solve word problems with dollars and cents using decimals.'),
  ('md-area', 'measurement-data', 'Area', 'Find area of rectangles and rectilinear figures by tiling and formulas.'),
  ('md-perimeter', 'measurement-data', 'Perimeter', 'Find perimeter of polygons; solve missing-side problems.'),
  ('md-line-plots', 'measurement-data', 'Line plots with fractions', 'Make line plots with fractional units and solve add/subtract problems from the data.'),
  ('md-angles', 'measurement-data', 'Angles & protractor', 'Measure and sketch angles; decompose angle measures additively.'),
  ('md-area-perimeter-word', 'measurement-data', 'Area & perimeter in context', 'Apply area and perimeter formulas to real-world problems.'),
  -- Geometry (7)
  ('geo-points-lines', 'geometry', 'Points, lines & rays', 'Identify and draw points, lines, line segments, rays, and parallel/perpendicular lines.'),
  ('geo-angles-types', 'geometry', 'Angle types', 'Classify angles as right, acute, or obtuse in 2D figures.'),
  ('geo-triangles', 'geometry', 'Classify triangles', 'Classify triangles by sides and angles.'),
  ('geo-quadrilaterals', 'geometry', 'Classify quadrilaterals', 'Classify quadrilaterals including trapezoid, parallelogram, rhombus, rectangle, square.'),
  ('geo-symmetry', 'geometry', 'Line symmetry', 'Recognize and draw lines of symmetry in 2D figures.'),
  ('geo-composite-shapes', 'geometry', 'Compose & decompose shapes', 'Build and break apart 2D shapes to reason about their properties.'),
  ('geo-coordinate-intro', 'geometry', 'Intro to coordinate plane', 'Plot and read points in the first quadrant of a coordinate grid.')
on conflict (id) do update
  set domain = excluded.domain,
      name = excluded.name,
      description = excluded.description;

-- ------------------------------------------------------ demo student ------
-- Fixed UUIDs so FK references stay stable across re-seeds.
insert into public.users (id, username, role, pin_hash) values
  ('11111111-1111-1111-1111-111111111111', 'demo', 'student', 'STUB-NOT-A-HASH:demo:1234')
on conflict (id) do update
  set username = excluded.username,
      role = excluded.role,
      pin_hash = excluded.pin_hash;

insert into public.student_profiles (id, user_id, display_name, grade) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Demo Student', 4)
on conflict (id) do update
  set user_id = excluded.user_id,
      display_name = excluded.display_name,
      grade = excluded.grade;

-- ------------------------------------------------------- achievements -----
insert into public.achievements (id, name, description) values
  ('first-steps', 'First Steps', 'Complete your first assignment.'),
  ('streak-5', '5-Day Streak', 'Practice five days in a row.'),
  ('fraction-friend', 'Fraction Friend', 'Reach 80% mastery on any fractions skill.')
on conflict (id) do update
  set name = excluded.name,
      description = excluded.description;
