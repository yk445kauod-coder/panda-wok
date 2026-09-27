import { describe, expect, it } from "vitest";
import {
  parseToolArguments,
  parseToolTurnOpenAiLike,
  toOpenAiTool,
  type ToolSpec,
} from "@/lib/ai/tool-protocol";

/**
 * The tool protocol is the contract between the model and the loop, so these
 * tests pin the parsing rules that a malformed model reply would otherwise
 * break silently.
 */

describe("toOpenAiTool", () => {
  it("maps a ToolSpec into an OpenAI function definition", () => {
    const spec: ToolSpec = {
      name: "set_menu_item_price",
      description: "Change a dish price",
      parameters: {
        slug: { type: "string", description: "Dish slug", required: true },
        price: { type: "number", description: "New price" },
        status: {
          type: "string",
          description: "Target",
          enum: ["a", "b"],
        },
      },
      write: true,
    };
    const tool = toOpenAiTool(spec);
    expect(tool.type).toBe("function");
    expect(tool.function.name).toBe("set_menu_item_price");
    expect(tool.function.parameters.required).toEqual(["slug"]);
    expect(tool.function.parameters.properties.price.type).toBe("number");
    expect(tool.function.parameters.properties.status.enum).toEqual(["a", "b"]);
    expect(tool.function.parameters.additionalProperties).toBe(false);
  });
});

describe("parseToolTurnOpenAiLike", () => {
  it("reads plain prose with no tool calls", () => {
    const turn = parseToolTurnOpenAiLike({
      choices: [{ message: { content: "  Hello  " } }],
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    });
    expect(turn.text).toBe("Hello");
    expect(turn.toolCalls).toEqual([]);
    expect(turn.promptTokens).toBe(10);
  });

  it("reads a single tool call", () => {
    const turn = parseToolTurnOpenAiLike({
      choices: [
        {
          message: {
            content: null as unknown as string,
            tool_calls: [
              { id: "call_1", function: { name: "menu_summary", arguments: "{}" } },
            ],
          },
        },
      ],
    });
    expect(turn.toolCalls).toHaveLength(1);
    expect(turn.toolCalls[0]).toEqual({ id: "call_1", name: "menu_summary", arguments: "{}" });
  });

  it("synthesises an id when the provider omits one", () => {
    const turn = parseToolTurnOpenAiLike({
      choices: [{ message: { tool_calls: [{ function: { name: "stock_status" } }] } }],
    });
    expect(turn.toolCalls[0].id).toBe("call_0");
    expect(turn.toolCalls[0].arguments).toBe("{}");
  });

  it("ignores a tool call with no function name", () => {
    const turn = parseToolTurnOpenAiLike({
      choices: [{ message: { tool_calls: [{ id: "x", function: {} }] } }],
    });
    expect(turn.toolCalls).toEqual([]);
  });

  it("survives an empty payload", () => {
    const turn = parseToolTurnOpenAiLike({});
    expect(turn.text).toBe("");
    expect(turn.toolCalls).toEqual([]);
  });
});

describe("parseToolArguments", () => {
  it("parses a JSON object", () => {
    expect(parseToolArguments('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns an empty object for malformed JSON rather than throwing", () => {
    expect(parseToolArguments("{not json")).toEqual({});
    expect(parseToolArguments("")).toEqual({});
  });

  it("returns an empty object for a non-object payload", () => {
    expect(parseToolArguments("[1,2]")).toEqual({});
    expect(parseToolArguments('"str"')).toEqual({});
  });
});
