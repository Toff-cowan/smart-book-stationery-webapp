/** Render a quote table to a PNG download (screenshot-style). */

export type QuoteRow = {
  quantity: number;
  name: string;
  cost: number;
};

function money(value: number) {
  return `$${value.toFixed(2)}`;
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const next = `${current} ${words[i]}`;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

export async function downloadQuoteTableImage(
  rows: QuoteRow[],
  filename = "bookstore-quote.png",
) {
  if (rows.length === 0) return;

  const padX = 36;
  const padY = 32;
  const width = 920;
  const colQty = 90;
  const colCost = 110;
  const colTotal = 120;
  const colName = width - padX * 2 - colQty - colCost - colTotal;
  const rowPad = 12;
  const lineHeight = 20;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.font = "600 14px Georgia, 'Times New Roman', serif";

  type MeasuredRow = {
    quantity: string;
    nameLines: string[];
    cost: string;
    total: string;
    height: number;
  };

  const measured: MeasuredRow[] = rows.map((row) => {
    const nameLines = wrapLines(ctx, row.name, colName - 16);
    const height = Math.max(44, nameLines.length * lineHeight + rowPad * 2);
    return {
      quantity: String(row.quantity),
      nameLines,
      cost: money(row.cost),
      total: money(row.quantity * row.cost),
      height,
    };
  });

  const grand = rows.reduce((sum, row) => sum + row.quantity * row.cost, 0);
  const headerBlock = 108;
  const tableHead = 42;
  const footerBlock = 72;
  const bodyHeight = measured.reduce((sum, row) => sum + row.height, 0);
  const height = headerBlock + tableHead + bodyHeight + footerBlock;

  canvas.width = width;
  canvas.height = height;

  // Background
  ctx.fillStyle = "#f7faf8";
  ctx.fillRect(0, 0, width, height);

  // Card
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#d5ddd8";
  ctx.lineWidth = 1;
  roundRect(ctx, 16, 16, width - 32, height - 32, 10);
  ctx.fill();
  ctx.stroke();

  // Brand header
  ctx.fillStyle = "#0b3d2e";
  ctx.font = "700 22px Georgia, 'Times New Roman', serif";
  ctx.fillText("Smart Books Stationery", padX, 52);
  ctx.fillStyle = "#51665d";
  ctx.font = "500 13px system-ui, sans-serif";
  ctx.fillText("Quote / estimate", padX, 74);
  ctx.fillText(
    new Date().toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    width - padX - 180,
    74,
  );

  // Table header bar
  const tableTop = headerBlock;
  ctx.fillStyle = "#0b3d2e";
  ctx.fillRect(padX, tableTop, width - padX * 2, tableHead);
  ctx.fillStyle = "#f6c344";
  ctx.font = "700 13px system-ui, sans-serif";
  const headY = tableTop + 26;
  ctx.fillText("QTY", padX + 14, headY);
  ctx.fillText("NAME", padX + colQty + 14, headY);
  ctx.fillText("COST", padX + colQty + colName + 14, headY);
  ctx.fillText("TOTAL", padX + colQty + colName + colCost + 14, headY);

  // Rows
  let y = tableTop + tableHead;
  measured.forEach((row, index) => {
    ctx.fillStyle = index % 2 === 0 ? "#ffffff" : "#f3f7f5";
    ctx.fillRect(padX, y, width - padX * 2, row.height);

    ctx.strokeStyle = "#e4ebe7";
    ctx.beginPath();
    ctx.moveTo(padX, y + row.height);
    ctx.lineTo(width - padX, y + row.height);
    ctx.stroke();

    ctx.fillStyle = "#16352b";
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.fillText(row.quantity, padX + 14, y + 28);

    ctx.font = "500 14px Georgia, 'Times New Roman', serif";
    row.nameLines.forEach((line, i) => {
      ctx.fillText(line, padX + colQty + 14, y + 28 + i * lineHeight);
    });

    ctx.font = "600 14px system-ui, sans-serif";
    ctx.fillText(row.cost, padX + colQty + colName + 14, y + 28);
    ctx.fillText(row.total, padX + colQty + colName + colCost + 14, y + 28);

    y += row.height;
  });

  // Grand total
  ctx.fillStyle = "#0b3d2e";
  ctx.font = "700 16px system-ui, sans-serif";
  ctx.fillText("Grand total", padX + colQty + colName + 14, y + 36);
  ctx.fillStyle = "#c45c26";
  ctx.fillText(money(grand), padX + colQty + colName + colCost + 14, y + 36);

  ctx.fillStyle = "#7a8f86";
  ctx.font = "500 11px system-ui, sans-serif";
  ctx.fillText(
    "Prices are estimates. Confirm with the bookstore before payment.",
    padX,
    y + 58,
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
