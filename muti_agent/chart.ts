import { DynamicStructuredTool } from "@langchain/core/tools";
import { createCanvas } from "canvas";
import * as d3 from "d3";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

export const chartTool = new DynamicStructuredTool({
  name: "generate_bar_chart",
  description: "根据数据点生成柱状图并保存为图片。",
  schema: z.object({
    data: z.object({ label: z.string(), value: z.number() }).array(),
  }),
  func: async ({ data }) => {
    const width = 500, height = 500;
    const margin = { top: 20, right: 30, bottom: 30, left: 40 };
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // D3 比例尺逻辑
    const x = d3.scaleBand()
      .domain(data.map((d) => d.label))
      .range([margin.left, width - margin.right])
      .padding(0.1);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, (d) => d.value) ?? 0])
      .nice()
      .range([height - margin.bottom, margin.top]);

    // 绘图颜色
    const colorPalette = ["#e6194B", "#3cb44b", "#ffe119", "#4363d8", "#f58231"];

    data.forEach((d, idx) => {
      ctx.fillStyle = colorPalette[idx % colorPalette.length];
      ctx.fillRect(x(d.label) ?? 0, y(d.value), x.bandwidth(), height - margin.bottom - y(d.value));
    });

    // 保存图片
    const buffer = canvas.toBuffer("image/png");
    const filePath = path.join(process.cwd(), "chart.png");
    fs.writeFileSync(filePath, buffer);

    return `图表已生成：${filePath}`;
  },
});