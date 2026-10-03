import { describe, expect, it } from "vitest";
import { AGENT_TOOLS, specsForCapabilities, toolsForCapabilities } from "@/lib/agent/registry";
import {
  isDeliverableKind,
  isHtmlDeliverableKind,
  renderDeliverableCatalogue,
  deliverableContentType,
} from "@/lib/agent/deliverables";
import { renderToolCatalogue } from "@/lib/agent/tools";
import { capabilitiesFor } from "@/lib/auth/rbac";

/**
 * The reachability contract.
 *
 * A tool that exists in `tools.ts` but is missing from `registry.ts` is
 * invisible to the model: the loop sends only registered specs, so the agent
 * will truthfully answer "I have no way to do that" while the capability is
 * sitting right there. That is exactly what happened to CRM, users, full
 * inventory and recent orders — the functions worked, the agent never saw them.
 *
 * `READ_TOOLS` is typed as a complete `Record<AgentToolName, …>`, so `tsc`
 * catches an unregistered *read* tool. These tests cover the rest: the write
 * tools, the capability filter, and that every catalogue entry the prompt
 * advertises is actually callable.
 */
describe("agent tool reachability", () => {
  const ownerTools = specsForCapabilities(capabilitiesFor("owner")).map((s) => s.name);

  it("registers every tool the catalogue advertises", () => {
    const advertised = renderToolCatalogue()
      .split("\n")
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).split(":")[0].trim());

    expect(advertised.length).toBeGreaterThan(0);
    for (const name of advertised) {
      expect(Object.keys(AGENT_TOOLS)).toContain(name);
      expect(ownerTools).toContain(name);
    }
  });

  it("exposes the data tools the hard tasks need", () => {
    // Each of these answers a question the agent previously could not: CRM,
    // users, a full stock count, and "what came in lately".
    for (const name of [
      "crm_summary",
      "crm_customers",
      "users_summary",
      "stock_inventory",
      "orders_recent",
    ]) {
      expect(ownerTools).toContain(name);
    }
  });

  it("exposes the workspace tools that make memory and documents usable", () => {
    // Creating a document is not enough to work in a workspace: the agent must
    // be able to see what already exists, and to read and write its own memory.
    for (const name of ["create_document", "list_documents", "recall_memory", "remember_memory"]) {
      expect(ownerTools).toContain(name);
    }
  });

  it("gates the memory and document tools behind ai.manage", () => {
    // A kitchen role can read orders but must not reach the AI workspace.
    const kitchen = specsForCapabilities(capabilitiesFor("kitchen")).map((s) => s.name);
    for (const name of ["list_documents", "recall_memory", "remember_memory", "create_document"]) {
      expect(kitchen).not.toContain(name);
    }
  });

  it("declares the arguments the workspace tools require", () => {
    expect(AGENT_TOOLS.recall_memory.spec.parameters.query.required).toBe(true);
    expect(AGENT_TOOLS.remember_memory.spec.parameters.content.required).toBe(true);
  });

  it("gives every registered tool a description and a spec", () => {
    for (const [name, tool] of Object.entries(AGENT_TOOLS)) {
      expect(tool.spec.name, `${name} spec name`).toBe(name);
      expect(tool.spec.description.length, `${name} description`).toBeGreaterThan(10);
      expect(typeof tool.run).toBe("function");
    }
  });

  it("never offers a tool the role cannot run", () => {
    // A kitchen role must not be handed CRM or user tools, or the loop would
    // offer a call the capability check then rejects.
    const kitchen = specsForCapabilities(capabilitiesFor("kitchen")).map((s) => s.name);
    expect(kitchen).not.toContain("crm_summary");
    expect(kitchen).not.toContain("users_summary");
    expect(kitchen).not.toContain("crm_customers");

    // …and the filter is a real subset, not an empty list.
    expect(toolsForCapabilities(capabilitiesFor("kitchen")).length).toBeGreaterThan(0);
  });
});

describe("deliverable catalogue", () => {
  it("advertises every kind it can render", () => {
    const advertised = renderDeliverableCatalogue()
      .split("\n")
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).split(":")[0].trim());

    expect(advertised).toContain("sales_dashboard");
    expect(advertised).toContain("crm_summary");
    expect(advertised).toContain("users_report");
    expect(advertised).toContain("inventory_report");
    expect(advertised).toContain("slide_deck");
    expect(advertised).toContain("strategy_brief");

    for (const kind of advertised) {
      expect(isDeliverableKind(kind), `${kind} is a known kind`).toBe(true);
    }
  });

  it("marks the chart/slide kinds as HTML and the rest as markdown", () => {
    expect(isHtmlDeliverableKind("sales_dashboard")).toBe(true);
    expect(isHtmlDeliverableKind("slide_deck")).toBe(true);
    expect(isHtmlDeliverableKind("daily_sales")).toBe(false);
    expect(isHtmlDeliverableKind("stock_reorder")).toBe(false);
  });

  it("serves an HTML artifact as text/html, not markdown", () => {
    // A charted page filed with a markdown content type renders as source in
    // the browser and prints as gibberish.
    expect(deliverableContentType("html")).toContain("text/html");
    expect(deliverableContentType("md")).toContain("text/markdown");
    expect(deliverableContentType("csv")).toContain("text/csv");
    expect(deliverableContentType("json")).toContain("application/json");
  });
});
