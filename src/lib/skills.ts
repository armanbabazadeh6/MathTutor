export type SkillDomain =
  | "operations-algebraic"
  | "base-ten"
  | "fractions"
  | "measurement-data"
  | "geometry";

export interface Skill {
  id: string;
  domain: SkillDomain;
  name: string;
  description: string;
}

export const SKILL_DOMAINS: { id: SkillDomain; name: string }[] = [
  { id: "operations-algebraic", name: "Operations & Algebraic Thinking" },
  { id: "base-ten", name: "Number & Operations in Base Ten" },
  { id: "fractions", name: "Number & Operations — Fractions" },
  { id: "measurement-data", name: "Measurement & Data" },
  { id: "geometry", name: "Geometry" },
];

export const SKILLS: Skill[] = [
  // Operations & Algebraic Thinking (10)
  { id: "oa-mult-1digit", domain: "operations-algebraic", name: "Multiply 1-digit numbers", description: "Recall and apply single-digit multiplication facts fluently." },
  { id: "oa-div-facts", domain: "operations-algebraic", name: "Division facts", description: "Solve division problems using known multiplication facts." },
  { id: "oa-mult-digit-1digit", domain: "operations-algebraic", name: "Multiply multi-digit by 1-digit", description: "Multiply numbers up to 4 digits by a 1-digit number with regrouping." },
  { id: "oa-mult-2digit-2digit", domain: "operations-algebraic", name: "Multiply 2-digit by 2-digit", description: "Use place value and partial products to multiply two 2-digit numbers." },
  { id: "oa-div-1digit-divisor", domain: "operations-algebraic", name: "Divide with 1-digit divisors", description: "Divide up to 4-digit dividends by 1-digit divisors, with remainders." },
  { id: "oa-multistep-word", domain: "operations-algebraic", name: "Multi-step word problems", description: "Solve two-step word problems with all four operations, interpreting remainders." },
  { id: "oa-factor-pairs", domain: "operations-algebraic", name: "Factor pairs", description: "Find all factor pairs for whole numbers up to 100." },
  { id: "oa-multiples-prime", domain: "operations-algebraic", name: "Multiples, prime & composite", description: "Identify multiples and classify numbers as prime or composite." },
  { id: "oa-patterns", domain: "operations-algebraic", name: "Number & shape patterns", description: "Generate and analyze patterns from a rule; spot features not in the rule." },
  { id: "oa-remainders", domain: "operations-algebraic", name: "Interpreting remainders", description: "Decide what a remainder means in context: round up, drop, or split." },
  // Base Ten (9)
  { id: "bt-place-value", domain: "base-ten", name: "Place value to 1,000,000", description: "Read, write, and compare multi-digit numbers using base-ten structure." },
  { id: "bt-rounding", domain: "base-ten", name: "Rounding", description: "Round multi-digit numbers to any place using place-value reasoning." },
  { id: "bt-add-multidigit", domain: "base-ten", name: "Add multi-digit numbers", description: "Fluently add multi-digit whole numbers with regrouping." },
  { id: "bt-sub-multidigit", domain: "base-ten", name: "Subtract multi-digit numbers", description: "Fluently subtract multi-digit whole numbers with regrouping." },
  { id: "bt-add-sub-word", domain: "base-ten", name: "Add/subtract word problems", description: "Solve multi-digit addition and subtraction word problems." },
  { id: "bt-multiply-10s", domain: "base-ten", name: "Multiply by powers of 10", description: "Multiply whole numbers by 10, 100, and 1,000 using place-value shifts." },
  { id: "bt-estimate", domain: "base-ten", name: "Estimate with rounding", description: "Use rounding to estimate answers and check reasonableness." },
  { id: "bt-compare-order", domain: "base-ten", name: "Compare & order", description: "Compare multi-digit numbers with <, >, = and order them." },
  { id: "bt-expanded-form", domain: "base-ten", name: "Expanded form", description: "Write numbers in expanded form and rebuild them from parts." },
  // Fractions (10)
  { id: "fr-equiv", domain: "fractions", name: "Equivalent fractions", description: "Recognize and generate equivalent fractions using visual models." },
  { id: "fr-compare", domain: "fractions", name: "Compare fractions", description: "Compare two fractions with different numerators/denominators using benchmarks." },
  { id: "fr-add-like", domain: "fractions", name: "Add fractions, like denominators", description: "Add fractions with the same denominator and simplify." },
  { id: "fr-sub-like", domain: "fractions", name: "Subtract fractions, like denominators", description: "Subtract fractions with the same denominator and simplify." },
  { id: "fr-add-unlike-10-100", domain: "fractions", name: "Add tenths & hundredths", description: "Add fractions with denominators 10 and 100 by converting." },
  { id: "fr-mixed-numbers", domain: "fractions", name: "Mixed numbers", description: "Convert between mixed numbers and improper fractions; decompose them." },
  { id: "fr-mult-fraction-whole", domain: "fractions", name: "Multiply fraction by whole number", description: "Multiply a fraction by a whole number using repeated addition and models." },
  { id: "fr-fraction-word", domain: "fractions", name: "Fraction word problems", description: "Solve word problems with fraction addition, subtraction, and scaling." },
  { id: "fr-decimals-tenths", domain: "fractions", name: "Decimals: tenths & hundredths", description: "Read, write, and model decimals to hundredths; relate to fractions." },
  { id: "fr-compare-decimals", domain: "fractions", name: "Compare decimals", description: "Compare two decimals to hundredths using place value." },
  // Measurement & Data (9)
  { id: "md-length-convert", domain: "measurement-data", name: "Convert length units", description: "Convert between km, m, cm and in, ft, yd, mi in measurement problems." },
  { id: "md-mass-capacity", domain: "measurement-data", name: "Mass & capacity units", description: "Convert between g/kg and ml/L; solve measurement word problems." },
  { id: "md-time", domain: "measurement-data", name: "Time: convert & elapsed", description: "Convert time units and solve elapsed-time word problems." },
  { id: "md-money", domain: "measurement-data", name: "Money problems", description: "Solve word problems with dollars and cents using decimals." },
  { id: "md-area", domain: "measurement-data", name: "Area", description: "Find area of rectangles and rectilinear figures by tiling and formulas." },
  { id: "md-perimeter", domain: "measurement-data", name: "Perimeter", description: "Find perimeter of polygons; solve missing-side problems." },
  { id: "md-line-plots", domain: "measurement-data", name: "Line plots with fractions", description: "Make line plots with fractional units and solve add/subtract problems from the data." },
  { id: "md-angles", domain: "measurement-data", name: "Angles & protractor", description: "Measure and sketch angles; decompose angle measures additively." },
  { id: "md-area-perimeter-word", domain: "measurement-data", name: "Area & perimeter in context", description: "Apply area and perimeter formulas to real-world problems." },
  // Geometry (7)
  { id: "geo-points-lines", domain: "geometry", name: "Points, lines & rays", description: "Identify and draw points, lines, line segments, rays, and parallel/perpendicular lines." },
  { id: "geo-angles-types", domain: "geometry", name: "Angle types", description: "Classify angles as right, acute, or obtuse in 2D figures." },
  { id: "geo-triangles", domain: "geometry", name: "Classify triangles", description: "Classify triangles by sides and angles." },
  { id: "geo-quadrilaterals", domain: "geometry", name: "Classify quadrilaterals", description: "Classify quadrilaterals including trapezoid, parallelogram, rhombus, rectangle, square." },
  { id: "geo-symmetry", domain: "geometry", name: "Line symmetry", description: "Recognize and draw lines of symmetry in 2D figures." },
  { id: "geo-composite-shapes", domain: "geometry", name: "Compose & decompose shapes", description: "Build and break apart 2D shapes to reason about their properties." },
  { id: "geo-coordinate-intro", domain: "geometry", name: "Intro to coordinate plane", description: "Plot and read points in the first quadrant of a coordinate grid." },
];
