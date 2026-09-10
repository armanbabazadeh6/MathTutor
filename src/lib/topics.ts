import { SKILLS } from "./skills";

/**
 * Free-text topic matching for the Today screen.
 *
 * A kid types whatever they remember from class ("pizza fractions", "the
 * times tables", "how to tell time") and the app has to turn that sentence
 * into real skills the plan engine can generate problems for. Pure and
 * deterministic: no fuzzy-search dependency, no randomness — the same text
 * always yields the same ids, which is what lets the assignment be named and
 * tested.
 *
 * Two tiers, in order:
 *  1. the hand-written alias table (how kids actually say it), which resolves
 *     a whole topic to the skills it covers;
 *  2. a scored keyword match over each skill's own `name` and `description`
 *     for phrasings the alias table does not list.
 * Nothing matching either tier returns `null`, and the caller owes the kid an
 * honest "we couldn't find that one" instead of serving unrelated problems.
 */

export interface TopicMatch {
  /** Real `SKILLS` ids covering the topic, in table/registry order. */
  skillIds: string[];
  /** Kid-facing session name, e.g. "Pizza fractions". */
  label: string;
}

/** One spoken topic: what a kid might type, the skills it covers, its name. */
export interface TopicAlias {
  /** Whole-word triggers, lowercase. Any one of them lands the topic. */
  triggers: string[];
  /** Skills the topic covers. Every id MUST exist in `SKILLS`. */
  skillIds: string[];
  /** Session name shown for this topic. */
  label: string;
}

/**
 * The alias table. Ordered from the specific to the general so a shared label
 * reads in a stable, sensible order ("Area & Perimeter", never the reverse).
 */
export const TOPIC_ALIASES: TopicAlias[] = [
  {
    triggers: [
      "times",
      "times tables",
      "time tables",
      "multiplication",
      "multiplication facts",
      "multiply",
      "multiplying",
      "x",
    ],
    skillIds: ["oa-mult-1digit", "oa-mult-digit-1digit", "oa-mult-2digit-2digit"],
    label: "Times tables",
  },
  {
    triggers: ["division", "divide", "dividing", "long division", "remainders", "remainder"],
    skillIds: ["oa-div-facts", "oa-div-1digit-divisor", "oa-remainders"],
    label: "Division",
  },
  {
    triggers: [
      "fraction",
      "fractions",
      "pizza",
      "pizzas",
      "pizza fractions",
      "halves",
      "quarters",
      "thirds",
      "numerator",
      "denominator",
      "mixed numbers",
    ],
    skillIds: [
      "fr-equiv",
      "fr-compare",
      "fr-add-like",
      "fr-sub-like",
      "fr-add-unlike-10-100",
      "fr-mixed-numbers",
      "fr-mult-fraction-whole",
      "fr-fraction-word",
      "fr-decimals-tenths",
      "fr-compare-decimals",
      "fr-add-unlike-5",
      "fr-sub-unlike-5",
      "fr-mult-whole-adv",
    ],
    label: "Pizza fractions",
  },
  {
    triggers: ["decimals", "decimal", "tenths", "hundredths", "decimal point"],
    skillIds: [
      "fr-decimals-tenths",
      "fr-compare-decimals",
      "fr-add-unlike-10-100",
      "bt-dec-add-sub",
      "bt-dec-mult-pow10",
    ],
    label: "Decimals",
  },
  {
    triggers: ["clock", "clocks", "time", "elapsed time", "elapsed", "minutes", "hours", "seconds"],
    skillIds: ["md-time"],
    label: "Time & clocks",
  },
  {
    triggers: ["money", "dollars", "dollar", "cents", "cent", "coins", "shopping", "change"],
    skillIds: ["md-money"],
    label: "Money",
  },
  {
    triggers: [
      "measuring",
      "measurement",
      "measure",
      "length",
      "lengths",
      "centimeters",
      "centimetres",
      "meters",
      "metres",
      "kilometers",
      "inches",
      "feet",
      "yards",
      "miles",
      "mass",
      "weight",
      "capacity",
      "liters",
      "litres",
      "grams",
      "kilograms",
    ],
    skillIds: ["md-length-convert", "md-mass-capacity"],
    label: "Measuring",
  },
  {
    triggers: ["area"],
    skillIds: ["md-area", "md-area-perimeter-word"],
    label: "Area",
  },
  {
    triggers: ["perimeter"],
    skillIds: ["md-perimeter", "md-area-perimeter-word"],
    label: "Perimeter",
  },
  {
    triggers: ["volume", "cubes", "boxes", "prisms", "rectangular prisms"],
    skillIds: ["md-volume"],
    label: "Volume",
  },
  {
    triggers: [
      "rounding",
      "round",
      "rounding numbers",
      "estimate",
      "estimating",
      "nearest ten",
      "nearest hundred",
    ],
    skillIds: ["bt-rounding", "bt-estimate"],
    label: "Rounding",
  },
  {
    triggers: [
      "place value",
      "big numbers",
      "millions",
      "thousands",
      "expanded form",
      "comparing numbers",
    ],
    skillIds: ["bt-place-value", "bt-compare-order", "bt-expanded-form"],
    label: "Big numbers",
  },
  {
    triggers: [
      "adding",
      "addition",
      "add",
      "subtracting",
      "subtraction",
      "subtract",
      "plus",
      "minus",
    ],
    skillIds: ["bt-add-multidigit", "bt-sub-multidigit", "bt-add-sub-word"],
    label: "Adding & subtracting",
  },
  {
    triggers: [
      "shapes",
      "shape",
      "geometry",
      "triangles",
      "triangle",
      "quadrilaterals",
      "quadrilateral",
      "angles",
      "angle",
      "lines",
      "rays",
      "polygons",
      "coordinate plane",
      "coordinate grid",
      "points",
    ],
    skillIds: [
      "geo-points-lines",
      "geo-angles-types",
      "geo-triangles",
      "geo-quadrilaterals",
      "geo-composite-shapes",
      "geo-coordinate-intro",
      "geo-coord-plane",
      "geo-quad-hierarchy",
    ],
    label: "Shapes",
  },
  {
    triggers: ["symmetry", "symmetric", "mirror"],
    skillIds: ["geo-symmetry"],
    label: "Symmetry",
  },
  {
    triggers: ["patterns", "pattern"],
    skillIds: ["oa-patterns"],
    label: "Patterns",
  },
  {
    triggers: [
      "factors",
      "factor pairs",
      "factor",
      "multiples",
      "primes",
      "prime",
      "composite",
      "divisibility",
    ],
    skillIds: ["oa-factor-pairs", "oa-multiples-prime"],
    label: "Factors & multiples",
  },
  {
    triggers: [
      "word problems",
      "word problem",
      "story problems",
      "story problem",
      "two step problems",
      "multi-step problems",
      "real world problems",
    ],
    skillIds: [
      "oa-multistep-word",
      "bt-add-sub-word",
      "fr-fraction-word",
      "md-area-perimeter-word",
      "oa-multistep-frac",
    ],
    label: "Word problems",
  },
  {
    triggers: ["order of operations", "pemdas", "parentheses", "brackets"],
    skillIds: ["oa-order-ops"],
    label: "Order of operations",
  },
  {
    triggers: ["expressions", "expression", "equations", "equation", "numerical expressions"],
    skillIds: ["oa-expressions"],
    label: "Writing expressions",
  },
  {
    triggers: ["line plots", "line plot", "graphs", "graph", "charts", "data"],
    skillIds: ["md-line-plots"],
    label: "Line plots",
  },
];

/**
 * Words too generic to mean a topic. Without this list, a vague sentence
 * ("we did numbers today") would match a third of the registry by keyword.
 */
const STOP_WORDS: Record<string, true> = {
  the: true,
  a: true,
  an: true,
  and: true,
  or: true,
  with: true,
  of: true,
  in: true,
  to: true,
  on: true,
  for: true,
  by: true,
  using: true,
  use: true,
  up: true,
  from: true,
  that: true,
  it: true,
  this: true,
  my: true,
  me: true,
  i: true,
  we: true,
  us: true,
  our: true,
  about: true,
  some: true,
  any: true,
  all: true,
  please: true,
  learn: true,
  learned: true,
  learning: true,
  practice: true,
  practiced: true,
  practicing: true,
  today: true,
  like: true,
  do: true,
  did: true,
  does: true,
  was: true,
  were: true,
  is: true,
  are: true,
  be: true,
  am: true,
  what: true,
  whats: true,
  how: true,
  can: true,
  help: true,
  more: true,
  also: true,
  get: true,
  got: true,
  need: true,
  want: true,
  know: true,
  study: true,
  school: true,
  class: true,
  homework: true,
  work: true,
  again: true,
  still: true,
  not: true,
  so: true,
  then: true,
  them: true,
  they: true,
  at: true,
};

/** Lowercase, strip punctuation to spaces, collapse runs of whitespace. */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Prefix match that tolerates plurals/tenses: "fractions" ~ "fraction",
 * "rounding" ~ "round". Only stems of four or more letters, so short words
 * ("in", "of") can never swallow longer ones.
 */
function wordMatches(word: string, token: string): boolean {
  if (word === token) return true;
  const short = word.length < token.length ? word : token;
  const long = word.length < token.length ? token : word;
  return short.length >= 4 && long.startsWith(short);
}

/** Keywords a skill is scored against: its name and description split to words. */
const SKILL_WORDS: { id: string; name: string; nameWords: string[]; descWords: string[] }[] =
  SKILLS.map((s) => ({
    id: s.id,
    name: s.name,
    nameWords: normalizeText(s.name).split(" "),
    descWords: normalizeText(s.description).split(" "),
  }));

/**
 * Scores every skill whose own words overlap the input, and returns the
 * highest-scoring ones (ties keep registry order). `null` when nothing
 * overlaps. Alias rules are consulted by the caller, not here.
 */
function matchBySkillText(text: string): TopicMatch | null {
  const tokens = normalizeText(text)
    .split(" ")
    .filter((t, i, all) => t.length >= 3 && !STOP_WORDS[t] && all.indexOf(t) === i);
  if (!tokens.length) return null;
  let best = 0;
  const scored: { id: string; name: string; score: number }[] = [];
  for (const skill of SKILL_WORDS) {
    let score = 0;
    for (const token of tokens) {
      if (skill.nameWords.some((w) => wordMatches(w, token))) score += 3;
      else if (skill.descWords.some((w) => wordMatches(w, token))) score += 1;
    }
    if (score > best) best = score;
    if (score > 0) scored.push({ id: skill.id, name: skill.name, score });
  }
  if (best === 0) return null;
  const hits = scored.filter((s) => s.score === best);
  return { skillIds: hits.map((h) => h.id), label: hits[0].name };
}

/**
 * Turn free text into the skills to practise, or `null` when nothing matches.
 *
 * Deterministic: same input, same output. Every returned id exists in
 * `SKILLS`, in registry order.
 */
export function matchSkillsFromText(text: string): TopicMatch | null {
  if (typeof text !== "string") return null;
  const norm = normalizeText(text);
  if (!norm) return null;
  const padded = ` ${norm} `;

  const matched = TOPIC_ALIASES.filter((rule) =>
    // Whole-word match, so "x" never fires inside a longer word.
    rule.triggers.some((t) => padded.includes(` ${t} `)),
  );
  if (matched.length) {
    const ids: string[] = [];
    for (const rule of matched) {
      for (const id of rule.skillIds) {
        if (!ids.includes(id)) ids.push(id);
      }
    }
    // Registry order keeps the result stable regardless of how many alias
    // rules landed on the same skill.
    const ordered = SKILL_WORDS.filter((s) => ids.includes(s.id)).map((s) => s.id);
    return { skillIds: ordered, label: matched.map((r) => r.label).join(" & ") };
  }

  return matchBySkillText(norm);
}
