/**
 * Tests for the free-text topic matcher behind Today's "Anything else?" box.
 *
 * The behaviour that matters: a kid's phrasing lands on real skills the engine
 * can actually serve, gibberish is refused (so the UI can say "we couldn't
 * find that one" instead of drilling unrelated problems), and the result is
 * deterministic so the assignment can be named and replayed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOPIC_ALIASES, matchSkillsFromText } from "../src/lib/topics";
import { SKILLS } from "../src/lib/skills";
import type { SkillDomain } from "../src/lib/skills";

const SKILL_IDS = new Set(SKILLS.map((s) => s.id));

/** One realistic kid phrasing per registry domain, plus the topic it means. */
const PHRASINGS: { text: string; domains: SkillDomain[]; mustInclude: string }[] = [
  { text: "times tables", domains: ["operations-algebraic"], mustInclude: "oa-mult-1digit" },
  {
    text: "we are doing long division with remainders",
    domains: ["operations-algebraic"],
    mustInclude: "oa-div-1digit-divisor",
  },
  { text: "Big Numbers", domains: ["base-ten"], mustInclude: "bt-place-value" },
  { text: "rounding to the nearest ten", domains: ["base-ten"], mustInclude: "bt-rounding" },
  { text: "pizza fractions please", domains: ["fractions"], mustInclude: "fr-add-like" },
  // Decimals live in both the fraction and base-ten standards.
  {
    text: "decimals and hundredths",
    domains: ["fractions", "base-ten"],
    mustInclude: "fr-decimals-tenths",
  },
  { text: "how do I tell time on a clock", domains: ["measurement-data"], mustInclude: "md-time" },
  { text: "money and dollars", domains: ["measurement-data"], mustInclude: "md-money" },
  { text: "area and perimeter", domains: ["measurement-data"], mustInclude: "md-perimeter" },
  { text: "volume of boxes", domains: ["measurement-data"], mustInclude: "md-volume" },
  { text: "triangles and angles", domains: ["geometry"], mustInclude: "geo-triangles" },
  { text: "lines of symmetry", domains: ["geometry"], mustInclude: "geo-symmetry" },
  { text: "the coordinate plane", domains: ["geometry"], mustInclude: "geo-coord-plane" },
];

test("realistic kid phrasings across all five domains resolve to real skills", () => {
  const domains = new Set<SkillDomain>();
  for (const { text, domains: allowed, mustInclude } of PHRASINGS) {
    const match = matchSkillsFromText(text);
    assert.ok(match, `expected a match for ${JSON.stringify(text)}`);
    assert.ok(
      match.skillIds.includes(mustInclude),
      `${JSON.stringify(text)} should cover ${mustInclude}, got ${match.skillIds.join(", ")}`,
    );
    for (const id of match.skillIds) {
      assert.ok(SKILL_IDS.has(id), `${JSON.stringify(text)} returned unknown skill ${id}`);
      const skill = SKILLS.find((s) => s.id === id);
      assert.ok(
        skill && allowed.includes(skill.domain),
        `${JSON.stringify(text)} returned ${id} outside ${allowed.join("/")}`,
      );
    }
    assert.ok(match.label.length > 0, `${JSON.stringify(text)} produced an empty label`);
    for (const d of allowed) domains.add(d);
  }
  assert.equal(domains.size, 5, "the phrasings should cover all five domains");
});

test("typing just the topic serves that whole topic, named for it", () => {
  const fractions = matchSkillsFromText("fractions");
  assert.ok(fractions);
  assert.equal(fractions.label, "Pizza fractions");
  for (const id of [
    "fr-equiv",
    "fr-compare",
    "fr-add-like",
    "fr-sub-like",
    "fr-mixed-numbers",
    "fr-mult-fraction-whole",
    "fr-fraction-word",
  ]) {
    assert.ok(fractions.skillIds.includes(id), `fractions should cover ${id}`);
  }

  // A run of one topic must fill ten problems: "money" has exactly one skill.
  const money = matchSkillsFromText("money");
  assert.deepEqual(money?.skillIds, ["md-money"]);
  assert.equal(money?.label, "Money");
});

test("two topics in one sentence merge, with both kinds of problem", () => {
  const match = matchSkillsFromText("area and perimeter");
  assert.ok(match);
  assert.ok(match.skillIds.includes("md-area"));
  assert.ok(match.skillIds.includes("md-perimeter"));
  assert.equal(match.label, "Area & Perimeter");
});

test("phrasings the alias table does not list still match a skill's own words", () => {
  const match = matchSkillsFromText("equivalent");
  assert.deepEqual(match?.skillIds, ["fr-equiv"]);
  assert.equal(match?.label, "Equivalent fractions");
});

test("nonsense and empty input return null", () => {
  for (const text of ["banana", "purple dinosaur", "", "   ", "the and of"]) {
    assert.equal(matchSkillsFromText(text), null, `${JSON.stringify(text)} should not match`);
  }
});

test("matching is deterministic", () => {
  for (const text of ["fractions and money", "area and perimeter", "equivalent", "banana"]) {
    assert.deepEqual(matchSkillsFromText(text), matchSkillsFromText(text));
  }
  const first = matchSkillsFromText("triangles and angles");
  const second = matchSkillsFromText("triangles and angles");
  assert.deepEqual(first?.skillIds, second?.skillIds);
});

test("every alias resolves to real, unique skill ids", () => {
  assert.ok(TOPIC_ALIASES.length > 0);
  for (const rule of TOPIC_ALIASES) {
    assert.ok(rule.triggers.length > 0, `${rule.label} has no triggers`);
    assert.ok(rule.skillIds.length > 0, `${rule.label} has no skills`);
    assert.ok(rule.label.trim().length > 0);
    assert.equal(
      new Set(rule.skillIds).size,
      rule.skillIds.length,
      `${rule.label} repeats a skill`,
    );
    for (const id of rule.skillIds) {
      assert.ok(SKILL_IDS.has(id), `${rule.label} names unknown skill ${id}`);
    }
    for (const trigger of rule.triggers) {
      assert.equal(
        trigger,
        trigger.toLowerCase().trim(),
        `${rule.label} trigger "${trigger}" is not normalized`,
      );
      assert.ok(trigger.length > 0);
    }
  }
});

test("every returned id exists in the skill registry, for every trigger", () => {
  for (const rule of TOPIC_ALIASES) {
    for (const trigger of rule.triggers) {
      const match = matchSkillsFromText(trigger);
      assert.ok(match, `trigger "${trigger}" should match itself`);
      for (const id of match.skillIds) {
        assert.ok(SKILL_IDS.has(id), `trigger "${trigger}" returned unknown skill ${id}`);
      }
    }
  }
});
