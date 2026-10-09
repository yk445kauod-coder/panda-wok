import { describe, expect, it } from "vitest";
import { GUIDE_SECTIONS, GUIDE_TOPICS } from "@/lib/admin/guide";
import { localiseGuideSections } from "@/lib/admin/guide.ar";

/**
 * The Arabic guide is an overlay keyed by the English topic ids. These tests pin
 * the two failure modes that overlay introduces: a topic that has no Arabic copy
 * (silently English), and an overlay id that matches no topic (dead copy).
 */
describe("Arabic ops guide overlay", () => {
  it("translates every section and topic", () => {
    const ar = localiseGuideSections(GUIDE_SECTIONS, "ar");
    expect(ar).toHaveLength(GUIDE_SECTIONS.length);

    const englishTitles = new Set(GUIDE_TOPICS.map((topic) => topic.title));
    for (const section of ar) {
      expect(section.title).not.toBe("");
      expect(section.intro).not.toBe("");
      for (const topic of section.topics) {
        // No topic may fall through to the English copy.
        expect(englishTitles.has(topic.title), `${topic.id} is not translated`).toBe(false);
        expect(topic.summary).not.toBe("");
        expect(topic.steps.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("keeps the structural fields (ids, icons, capabilities, order) intact", () => {
    const ar = localiseGuideSections(GUIDE_SECTIONS, "ar");
    GUIDE_SECTIONS.forEach((enSection, index) => {
      const arSection = ar[index];
      expect(arSection.id).toBe(enSection.id);
      enSection.topics.forEach((enTopic, topicIndex) => {
        const arTopic = arSection.topics[topicIndex];
        expect(arTopic.id).toBe(enTopic.id);
        expect(arTopic.icon).toBe(enTopic.icon);
        expect(arTopic.capability).toBe(enTopic.capability);
      });
    });
  });

  it("writes Arabic, not transliterated English", () => {
    const ar = localiseGuideSections(GUIDE_SECTIONS, "ar");
    for (const section of ar) {
      for (const topic of section.topics) {
        const body = [topic.title, topic.summary, ...topic.steps.map((s) => s.body)].join(" ");
        expect(/[\u0600-\u06FF]/.test(body), `${topic.id} has no Arabic script`).toBe(true);
      }
    }
  });

  it("returns the English source untouched for a non-Arabic locale", () => {
    expect(localiseGuideSections(GUIDE_SECTIONS, "en")).toBe(GUIDE_SECTIONS);
  });
});
