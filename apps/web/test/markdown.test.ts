import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "../src/ui/Markdown";

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

describe("Markdown", () => {
  it("renders the assistant's headings, emphasis, lists, rules and tables", () => {
    const out = html("### Verdict\n\n**Stated total:** $820\n\n---\n\n| Date | Billed |\n|---|---|\n| Sep 1 | $150 |\n\n- one\n- *two*");
    expect(out).toContain("<h4>Verdict</h4>"); // headings step down inside a chat bubble
    expect(out).toContain("<strong>Stated total:</strong> $820");
    expect(out).toContain("<hr/>");
    expect(out).toContain("<th>Date</th>");
    expect(out).toContain("<td>$150</td>");
    expect(out).toContain("<li><em>two</em></li>");
  });

  it("leaves underscores inside words alone, but still reads _emphasis_", () => {
    expect(html("The ADD_EARLIER_TERM card and a _note_")).toContain("The ADD_EARLIER_TERM card and a <em>note</em>");
  });

  it("never passes markup through", () => {
    expect(html("<img src=x onerror=alert(1)>")).toContain("&lt;img");
  });
});
