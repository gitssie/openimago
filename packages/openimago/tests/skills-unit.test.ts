/**
 * SkillConfigService pure-unit tests — no DB, no filesystem.
 *
 * Covers serializeSkillMd (frontmatter shape) and the name/description
 * validators, which are pure and independently testable.
 */
import { describe, test, expect } from "bun:test"
import { serializeSkillMd, validateSkillName, validateSkillDescription } from "../src/skills/service"

describe("serializeSkillMd", () => {
  test("emits YAML frontmatter with name + description, then the body", () => {
    const md = serializeSkillMd("my-skill", "Does a thing", "Step 1. Do the thing.")
    expect(md).toBe(
      "---\nname: my-skill\ndescription: Does a thing\n---\n\nStep 1. Do the thing.\n",
    )
  })

  test("strips a leading frontmatter block from content so output has exactly one", () => {
    // User pasted a full SKILL.md as content; the generated frontmatter must win
    // and the pasted leading block must be removed (no double frontmatter).
    const content = "---\nname: e2e-test-skill\ndescription: Old\n---\n\n# Updated Skill\nbody text\n"
    const md = serializeSkillMd("e2e-test-skill", "New description", content)
    // Exactly one frontmatter block: opening --- then a single closing --- line.
    const fmBlocks = md.match(/^---$/gm) ?? []
    expect(fmBlocks.length).toBe(2) // opening + closing of the single block
    expect(md).toContain("description: New description")
    expect(md).not.toContain("description: Old")
    expect(md).toContain("# Updated Skill")
    expect(md).toContain("body text")
  })

  test("leaves '---' that appears mid-body (horizontal rule) untouched", () => {
    const content = "intro paragraph\n\n---\n\nafter the rule\n"
    const md = serializeSkillMd("k", "d", content)
    // The mid-body rule must survive verbatim in the body.
    const bodyStart = md.indexOf("\n\n") + 2
    const body = md.slice(bodyStart)
    expect(body).toBe(content)
  })

  test("plain body without leading frontmatter is unchanged", () => {
    const md = serializeSkillMd("k", "d", "Step 1. Do the thing.")
    expect(md).toBe("---\nname: k\ndescription: d\n---\n\nStep 1. Do the thing.\n")
  })

  test("strips a leading frontmatter block even with leading whitespace before it", () => {
    const content = "  \n---\nname: x\n---\nreal body\n"
    const md = serializeSkillMd("k", "d", content)
    const fmBlocks = md.match(/^---$/gm) ?? []
    expect(fmBlocks.length).toBe(2)
    expect(md).toContain("real body")
    expect(md).not.toContain("name: x")
  })

  test("quotes description that contains a colon so YAML stays valid", () => {
    const md = serializeSkillMd("k", "Use: carefully", "body")
    expect(md).toContain('description: "Use: carefully"')
  })

  test("escapes embedded double-quotes when quoting", () => {
    const md = serializeSkillMd("k", 'Say "hi": now', "body")
    expect(md).toContain('description: "Say \\"hi\\": now"')
  })

  test("quotes a value containing '#' so a YAML inline comment can't truncate it", () => {
    // In YAML 1.1, ` # ` starts an inline comment. The description must be quoted
    // so it round-trips to the FULL string, not just "do".
    const description = "do # things"
    const md = serializeSkillMd("k", description, "body\n")
    expect(md).toContain(`description: "${description}"`)

    // Round-trip: a quoted scalar parses back to the whole value (comment-safe).
    const line = md.split("\n").find((l) => l.startsWith("description:"))!
    const parsed = line.slice("description:".length).trim().replace(/^"|"$/g, "")
    expect(parsed).toBe(description)
  })
})

describe("validateSkillName", () => {
  test("accepts slug names (lowercase alphanumeric + internal hyphens)", () => {
    expect(validateSkillName("my-skill")).toBe(true)
    expect(validateSkillName("skill1")).toBe(true)
    expect(validateSkillName("a")).toBe(true) // single char
    expect(validateSkillName("a-b-c")).toBe(true)
  })

  test("rejects leading/trailing hyphens (slug convention)", () => {
    expect(validateSkillName("-skill")).toBe(false)
    expect(validateSkillName("skill-")).toBe(false)
    expect(validateSkillName("-")).toBe(false)
    expect(validateSkillName("--")).toBe(false)
  })

  test("rejects uppercase / underscores", () => {
    expect(validateSkillName("My_Skill")).toBe(false)
    expect(validateSkillName("MySkill")).toBe(false)
  })

  test("rejects path traversal and dot names", () => {
    expect(validateSkillName("../x")).toBe(false)
    expect(validateSkillName(".")).toBe(false)
    expect(validateSkillName("..")).toBe(false)
    expect(validateSkillName("a/b")).toBe(false)
  })

  test("rejects empty and >64 chars", () => {
    expect(validateSkillName("")).toBe(false)
    expect(validateSkillName("a".repeat(65))).toBe(false)
    expect(validateSkillName("a".repeat(64))).toBe(true)
  })
})

describe("validateSkillDescription", () => {
  test("accepts non-empty <=1024", () => {
    expect(validateSkillDescription("hello")).toBe(true)
    expect(validateSkillDescription("a".repeat(1024))).toBe(true)
  })

  test("rejects empty and >1024", () => {
    expect(validateSkillDescription("")).toBe(false)
    expect(validateSkillDescription("a".repeat(1025))).toBe(false)
  })
})
