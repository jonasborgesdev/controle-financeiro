import { describe, expect, it } from "vitest";
import { parseStatement } from "@/lib/importer";
import { reconstructPdfTextFromItems } from "@/lib/pdf";

describe("PDF text reconstruction", () => {
  it("reconstroi uma linha tabular quando o PDF entrega textos pequenos posicionados", () => {
    const items = [
      textItem("03/08", 10, 100),
      textItem("PIX", 70, 100),
      textItem("ENVIADO", 92, 100),
      textItem("PARAISO", 145, 100),
      textItem("LUBRIFICANTES", 190, 100),
      textItem("LTD", 270, 100),
      textItem("43,42-", 360, 100),
      textItem("24,38", 430, 100),
      textItem("05/08", 10, 84),
      textItem("PIX", 70, 84),
      textItem("RECEBIDO", 92, 84),
      textItem("JONAS", 150, 84),
      textItem("BORGES", 190, 84),
      textItem("1.000,32", 360, 84),
    ];

    const text = reconstructPdfTextFromItems(items);

    expect(text).toContain("03/08 PIX ENVIADO PARAISO LUBRIFICANTES LTD 43,42- 24,38");
    expect(text).toContain("05/08 PIX RECEBIDO JONAS BORGES 1.000,32");
    expect(parseStatement(`agosto/2026\nMovimentação\n${text}`, "pdf", "automatic")).toEqual([
      expect.objectContaining({ date: "2026-08-03", description: "PIX ENVIADO PARAISO LUBRIFICANTES LTD", amount: 43.42, type: "expense" }),
      expect.objectContaining({ date: "2026-08-05", description: "PIX RECEBIDO JONAS BORGES", amount: 1000.32, type: "income" }),
    ]);
  });
});

function textItem(str: string, x: number, y: number) {
  return { str, transform: [1, 0, 0, 1, x, y], width: str.length * 5 };
}
