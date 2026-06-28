/**
 * Default/shared skill provisioning (openimago-q41x).
 *
 * The global default skill tier lives at
 *   <opencode config dir>/skills/<name>/SKILL.md
 * and is written by deployment/admin tooling — never by users. These tests use
 * a temp base dir + the in-memory SkillFileSystem so they never touch the real
 * ~/.config/opencode.
 */
import { describe, test, expect, beforeEach } from "bun:test"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  DEFAULT_SKILLS,
  resolveGlobalSkillsDir,
  provisionDefaultSkills,
} from "../src/skills/defaults"
import {
  serializeSkillMd,
  validateSkillName,
  validateSkillDescription,
  type SkillFileSystem,
} from "../src/skills/service"

/** In-memory fs capturing mkdir / writeFile / rm, mirroring WorkDirService's pattern. */
function memFs() {
  const dirs = new Set<string>()
  const files = new Map<string, string>()
  const fs: SkillFileSystem = {
    mkdir: async (dir) => { dirs.add(dir) },
    writeFile: async (file, data) => { files.set(file, data) },
    rm: async (dir) => {
      dirs.delete(dir)
      for (const key of [...files.keys()]) {
        if (key.startsWith(dir + path.sep) || key === dir) files.delete(key)
      }
    },
    readdir: async () => [],
  }
  return { fs, dirs, files }
}

describe("resolveGlobalSkillsDir", () => {
  test("honors OPENCODE_CONFIG_DIR override when set", () => {
    const dir = resolveGlobalSkillsDir({ OPENCODE_CONFIG_DIR: "/custom/oc" })
    expect(dir).toBe(path.join("/custom/oc", "skills"))
  })

  test("uses XDG_CONFIG_HOME/opencode/skills when no explicit override", () => {
    const dir = resolveGlobalSkillsDir({ XDG_CONFIG_HOME: "/xdg" })
    expect(dir).toBe(path.join("/xdg", "opencode", "skills"))
  })

  test("falls back to ~/.config/opencode/skills from home", () => {
    const dir = resolveGlobalSkillsDir({ HOME: "/home/bob" })
    expect(dir).toBe(path.join("/home/bob", ".config", "opencode", "skills"))
  })
})

describe("DEFAULT_SKILLS data", () => {
  test("ships at least one real default with required fields", () => {
    expect(DEFAULT_SKILLS.length).toBeGreaterThanOrEqual(1)
    for (const s of DEFAULT_SKILLS) {
      expect(typeof s.name).toBe("string")
      expect(s.name.length).toBeGreaterThan(0)
      expect(typeof s.description).toBe("string")
      expect(s.description.length).toBeGreaterThan(0)
      expect(typeof s.content).toBe("string")
      expect(s.content.length).toBeGreaterThan(0)
    }
  })

  test("default names are unique", () => {
    const names = DEFAULT_SKILLS.map((s) => s.name)
    expect(new Set(names).size).toBe(names.length)
  })

  test("defaults satisfy the per-project validators (so a project can override by name)", () => {
    for (const s of DEFAULT_SKILLS) {
      expect(validateSkillName(s.name)).toBe(true)
      expect(validateSkillDescription(s.description)).toBe(true)
    }
  })
})

describe("provisionDefaultSkills", () => {
  const base = path.join(tmpdir(), "oc-skills-test")

  test("writes each default to <base>/<name>/SKILL.md via serializeSkillMd", async () => {
    const { fs, files } = memFs()
    const result = await provisionDefaultSkills({ baseDir: base, fs })

    expect(result.written).toBe(DEFAULT_SKILLS.length)
    for (const s of DEFAULT_SKILLS) {
      const expectedPath = path.join(base, s.name, "SKILL.md")
      expect(files.has(expectedPath)).toBe(true)
      expect(files.get(expectedPath)).toBe(serializeSkillMd(s.name, s.description, s.content))
    }
  })

  test("each written file round-trips through serializeSkillMd", async () => {
    const { fs, files } = memFs()
    await provisionDefaultSkills({ baseDir: base, fs })
    for (const s of DEFAULT_SKILLS) {
      const file = files.get(path.join(base, s.name, "SKILL.md"))!
      expect(file).toBe(serializeSkillMd(s.name, s.description, s.content))
      expect(file).toContain(`name: ${s.name}`)
    }
  })

  test("is idempotent — re-running yields the same file set, no duplicates", async () => {
    const { fs, files } = memFs()
    await provisionDefaultSkills({ baseDir: base, fs })
    const firstCount = files.size
    const firstSnapshot = new Map(files)

    const second = await provisionDefaultSkills({ baseDir: base, fs })
    expect(files.size).toBe(firstCount)
    expect(second.written).toBe(DEFAULT_SKILLS.length)
    for (const [k, v] of firstSnapshot) {
      expect(files.get(k)).toBe(v)
    }
  })
})
