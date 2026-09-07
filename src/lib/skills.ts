export type SkillDomain =
  | "operations-algebraic"
  | "base-ten"
  | "fractions"
  | "measurement-data"
  | "geometry";

/** Grade band a skill belongs to: 4 = fourth grade, 5 = fifth grade (unlocked per-domain). */
export type GradeLevel = 4 | 5;

export interface Skill {
  id: string;
  domain: SkillDomain;
  name: string;
  description: string;
  grade: GradeLevel;
}

export const SKILL_DOMAINS: { id: SkillDomain; name: string }[] = [
  { id: "operations-algebraic", name: "Operations & Algebraic Thinking" },
  { id: "base-ten", name: "Number & Operations in Base Ten" },
  { id: "fractions", name: "Number & Operations — Fractions" },
  { id: "measurement-data", name: "Measurement & Data" },
  { id: "geometry", name: "Geometry" },
];

export const SKILLS: Skill[] = [
  // Operations & Algebraic Thinking (10) — grade 4
  { id: "oa-mult-1digit", domain: "operations-algebraic", name: "Multiply 1-digit numbers", description: "Recall and apply single-digit multiplication facts fluently.", grade: 4 },
  { id: "oa-div-facts", domain: "operations-algebraic", name: "Division facts", description: "Solve division problems using known multiplication facts.", grade: 4 },
  { id: "oa-mult-digit-1digit", domain: "operations-algebraic", name: "Multiply multi-digit by 1-digit", description: "Multiply numbers up to 4 digits by a 1-digit number with regrouping.", grade: 4 },
  { id: "oa-mult-2digit-2digit", domain: "operations-algebraic", name: "Multiply 2-digit by 2-digit", description: "Use place value and partial products to multiply two 2-digit numbers.", grade: 4 },
  { id: "oa-div-1digit-divisor", domain: "operations-algebraic", name: "Divide with 1-digit divisors", description: "Divide up to 4-digit dividends by 1-digit divisors, with remainders.", grade: 4 },
  { id: "oa-multistep-word", domain: "operations-algebraic", name: "Multi-step word problems", description: "Solve two-step word problems with all four operations, interpreting remainders.", grade: 4 },
  { id: "oa-factor-pairs", domain: "operations-algebraic", name: "Factor pairs", description: "Find all factor pairs for whole numbers up to 100.", grade: 4 },
  { id: "oa-multiples-prime", domain: "operations-algebraic", name: "Multiples, prime & composite", description: "Identify multiples and classify numbers as prime or composite.", grade: 4 },
  { id: "oa-patterns", domain: "operations-algebraic", name: "Number & shape patterns", description: "Generate and analyze patterns from a rule; spot features not in the rule.", grade: 4 },
  { id: "oa-remainders", domain: "operations-algebraic", name: "Interpreting remainders", description: "Decide what a remainder means in context: round up, drop, or split.", grade: 4 },
  // Base Ten (9) — grade 4
  { id: "bt-place-value", domain: "base-ten", name: "Place value to 1,000,000", description: "Read, write, and compare multi-digit numbers using base-ten structure.", grade: 4 },
  { id: "bt-rounding", domain: "base-ten", name: "Rounding", description: "Round multi-digit numbers to any place using place-value reasoning.", grade: 4 },
  { id: "bt-add-multidigit", domain: "base-ten", name: "Add multi-digit numbers", description: "Fluently add multi-digit whole numbers with regrouping.", grade: 4 },
  { id: "bt-sub-multidigit", domain: "base-ten", name: "Subtract multi-digit numbers", description: "Fluently subtract multi-digit whole numbers with regrouping.", grade: 4 },
  { id: "bt-add-sub-word", domain: "base-ten", name: "Add/subtract word problems", description: "Solve multi-digit addition and subtraction word problems.", grade: 4 },
  { id: "bt-multiply-10s", domain: "base-ten", name: "Multiply by powers of 10", description: "Multiply whole numbers by 10, 100, and 1,000 using place-value shifts.", grade: 4 },
  { id: "bt-estimate", domain: "base-ten", name: "Estimate with rounding", description: "Use rounding to estimate answers and check reasonableness.", grade: 4 },
  { id: "bt-compare-order", domain: "base-ten", name: "Compare & order", description: "Compare multi-digit numbers with <, >, = and order them.", grade: 4 },
  { id: "bt-expanded-form", domain: "base-ten", name: "Expanded form", description: "Write numbers in expanded form and rebuild them from parts.", grade: 4 },
  // Fractions (10) — grade 4
  { id: "fr-equiv", domain: "fractions", name: "Equivalent fractions", description: "Recognize and generate equivalent fractions using visual models.", grade: 4 },
  { id: "fr-compare", domain: "fractions", name: "Compare fractions", description: "Compare two fractions with different numerators/denominators using benchmarks.", grade: 4 },
  { id: "fr-add-like", domain: "fractions", name: "Add fractions, like denominators", description: "Add fractions with the same denominator and simplify.", grade: 4 },
  { id: "fr-sub-like", domain: "fractions", name: "Subtract fractions, like denominators", description: "Subtract fractions with the same denominator and simplify.", grade: 4 },
  { id: "fr-add-unlike-10-100", domain: "fractions", name: "Add tenths & hundredths", description: "Add fractions with denominators 10 and 100 by converting.", grade: 4 },
  { id: "fr-mixed-numbers", domain: "fractions", name: "Mixed numbers", description: "Convert between mixed numbers and improper fractions; decompose them.", grade: 4 },
  { id: "fr-mult-fraction-whole", domain: "fractions", name: "Multiply fraction by whole number", description: "Multiply a fraction by a whole number using repeated addition and models.", grade: 4 },
  { id: "fr-fraction-word", domain: "fractions", name: "Fraction word problems", description: "Solve word problems with fraction addition, subtraction, and scaling.", grade: 4 },
  { id: "fr-decimals-tenths", domain: "fractions", name: "Decimals: tenths & hundredths", description: "Read, write, and model decimals to hundredths; relate to fractions.", grade: 4 },
  { id: "fr-compare-decimals", domain: "fractions", name: "Compare decimals", description: "Compare two decimals to hundredths using place value.", grade: 4 },
  // Measurement & Data (9) — grade 4
  { id: "md-length-convert", domain: "measurement-data", name: "Convert length units", description: "Convert between km, m, cm and in, ft, yd, mi in measurement problems.", grade: 4 },
  { id: "md-mass-capacity", domain: "measurement-data", name: "Mass & capacity units", description: "Convert between g/kg and ml/L; solve measurement word problems.", grade: 4 },
  { id: "md-time", domain: "measurement-data", name: "Time: convert & elapsed", description: "Convert time units and solve elapsed-time word problems.", grade: 4 },
  { id: "md-money", domain: "measurement-data", name: "Money problems", description: "Solve word problems with dollars and cents using decimals.", grade: 4 },
  { id: "md-area", domain: "measurement-data", name: "Area", description: "Find area of rectangles and rectilinear figures by tiling and formulas.", grade: 4 },
  { id: "md-perimeter", domain: "measurement-data", name: "Perimeter", description: "Find perimeter of polygons; solve missing-side problems.", grade: 4 },
  { id: "md-line-plots", domain: "measurement-data", name: "Line plots with fractions", description: "Make line plots with fractional units and solve add/subtract problems from the data.", grade: 4 },
  { id: "md-angles", domain: "measurement-data", name: "Angles & protractor", description: "Measure and sketch angles; decompose angle measures additively.", grade: 4 },
  { id: "md-area-perimeter-word", domain: "measurement-data", name: "Area & perimeter in context", description: "Apply area and perimeter formulas to real-world problems.", grade: 4 },
  // Geometry (7) — grade 4
  { id: "geo-points-lines", domain: "geometry", name: "Points, lines & rays", description: "Identify and draw points, lines, line segments, rays, and parallel/perpendicular lines.", grade: 4 },
  { id: "geo-angles-types", domain: "geometry", name: "Angle types", description: "Classify angles as right, acute, or obtuse in 2D figures.", grade: 4 },
  { id: "geo-triangles", domain: "geometry", name: "Classify triangles", description: "Classify triangles by sides and angles.", grade: 4 },
  { id: "geo-quadrilaterals", domain: "geometry", name: "Classify quadrilaterals", description: "Classify quadrilaterals including trapezoid, parallelogram, rhombus, rectangle, square.", grade: 4 },
  { id: "geo-symmetry", domain: "geometry", name: "Line symmetry", description: "Recognize and draw lines of symmetry in 2D figures.", grade: 4 },
  { id: "geo-composite-shapes", domain: "geometry", name: "Compose & decompose shapes", description: "Build and break apart 2D shapes to reason about their properties.", grade: 4 },
  { id: "geo-coordinate-intro", domain: "geometry", name: "Intro to coordinate plane", description: "Plot and read points in the first quadrant of a coordinate grid.", grade: 4 },
  // ---- Grade 5 (unlock per-domain via graduation rules in src/lib/plan/graduation.ts) ----
  // Operations & Algebraic Thinking — grade 5
  { id: "oa-order-ops", domain: "operations-algebraic", name: "Order of operations basics", description: "Evaluate expressions with parentheses and mixed operations in the right order.", grade: 5 },
  { id: "oa-multistep-frac", domain: "operations-algebraic", name: "Multi-step problems with fractions", description: "Solve multi-step word problems that mix fractions and whole numbers.", grade: 5 },
  { id: "oa-expressions", domain: "operations-algebraic", name: "Write numerical expressions", description: "Turn words into numerical expressions with parentheses and operators.", grade: 5 },
  // Base Ten — grade 5
  { id: "bt-dec-add-sub", domain: "base-ten", name: "Add & subtract decimals", description: "Add and subtract decimals to hundredths using place value.", grade: 5 },
  { id: "bt-dec-mult-pow10", domain: "base-ten", name: "Multiply decimals by powers of 10", description: "Multiply decimals by 10, 100, and 1,000 by shifting the decimal point.", grade: 5 },
  // Fractions — grade 5
  { id: "fr-add-unlike-5", domain: "fractions", name: "Add fractions, unlike denominators", description: "Add fractions with different denominators by finding common denominators.", grade: 5 },
  { id: "fr-sub-unlike-5", domain: "fractions", name: "Subtract fractions, unlike denominators", description: "Subtract fractions with different denominators by finding common denominators.", grade: 5 },
  { id: "fr-mult-whole-adv", domain: "fractions", name: "Multiply fraction by whole number", description: "Multiply a fraction by a whole number and simplify, including scaling past one whole.", grade: 5 },
  // Measurement & Data — grade 5
  { id: "md-volume", domain: "measurement-data", name: "Volume of boxes", description: "Find the volume of rectangular prisms by packing unit cubes and using length × width × height.", grade: 5 },
  // Geometry — grade 5
  { id: "geo-coord-plane", domain: "geometry", name: "Coordinate plane basics", description: "Read and plot ordered pairs in the first quadrant of the coordinate plane.", grade: 5 },
  { id: "geo-quad-hierarchy", domain: "geometry", name: "Quadrilateral hierarchy", description: "Classify quadrilaterals by hierarchy: all squares are rectangles and rhombuses.", grade: 5 },
];
