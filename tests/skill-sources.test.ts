import { describe, expect, it } from "vitest";
import { parseGithubSkillUrl } from "@/lib/agent/skill-sources";

/**
 * The import action fetches whatever URL an operator pastes, so this parser is a
 * security boundary, not a convenience. These tests pin the two things that
 * matter: only GitHub over https is reachable, and the accepted shapes map to the
 * right raw URL.
 */
describe("parseGithubSkillUrl", () => {
  it("maps a blob URL to raw.githubusercontent", () => {
    const ref = parseGithubSkillUrl(
      "https://github.com/openhands/example/blob/main/skills/review/SKILL.md",
    );
    expect(ref?.fetchUrl).toBe(
      "https://raw.githubusercontent.com/openhands/example/main/skills/review/SKILL.md",
    );
    expect(ref?.sourceUrl).toContain("github.com/openhands/example/blob/main");
  });

  it("expands a directory URL to its SKILL.md", () => {
    const ref = parseGithubSkillUrl(
      "https://github.com/openhands/example/tree/main/skills/review",
    );
    expect(ref?.fetchUrl).toBe(
      "https://raw.githubusercontent.com/openhands/example/main/skills/review/SKILL.md",
    );
  });

  it("accepts an already-raw URL", () => {
    const ref = parseGithubSkillUrl(
      "https://raw.githubusercontent.com/o/r/main/skills/a/SKILL.md",
    );
    expect(ref?.fetchUrl).toBe(
      "https://raw.githubusercontent.com/o/r/main/skills/a/SKILL.md",
    );
  });

  // The important half: every one of these must be refused.
  it.each([
    "http://github.com/o/r/blob/main/SKILL.md",
    "https://evil.example.com/o/r/blob/main/SKILL.md",
    "https://169.254.169.254/latest/meta-data/",
    "https://localhost:8080/x",
    "https://raw.githubusercontent.com.evil.com/o/r/main/x.md",
    "file:///etc/passwd",
    "not a url",
    "",
  ])("refuses %s", (input) => {
    expect(parseGithubSkillUrl(input)).toBeNull();
  });

  it("rejects a non-markdown blob", () => {
    expect(
      parseGithubSkillUrl("https://github.com/o/r/blob/main/secrets.env"),
    ).toBeNull();
  });
});
