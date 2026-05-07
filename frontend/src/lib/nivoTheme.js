// MoneyWies — Nivo chart theme
// Derived from @moneywies design system spec (Design System.html § 06)

export const nivoTheme = {
  background: "transparent",
  text: {
    fontFamily: '"Geist Mono", ui-monospace, monospace',
    fontSize: 11,
    fill: "#5B625B",
  },
  axis: {
    domain: {
      line: { stroke: "#E4E0D4", strokeWidth: 1 },
    },
    ticks: {
      line: { stroke: "#E4E0D4", strokeWidth: 1 },
      text: { fill: "#8A908A", fontSize: 11, fontFamily: '"Geist Mono", monospace' },
    },
    legend: {
      text: { fill: "#5B625B", fontSize: 12, fontFamily: '"Geist", sans-serif', fontWeight: 500 },
    },
  },
  grid: {
    line: { stroke: "#EFECE3", strokeDasharray: "2 4", strokeWidth: 1 },
  },
  legends: {
    text: { fill: "#5B625B", fontSize: 12, fontFamily: '"Geist", sans-serif' },
  },
  tooltip: {
    container: {
      background: "#FBFAF5",
      border: "1px solid #E4E0D4",
      borderRadius: 10,
      boxShadow: "0 4px 14px -4px rgba(16,21,16,0.10), 0 1px 2px rgba(16,21,16,0.04)",
      padding: "8px 12px",
      fontSize: 12,
      fontFamily: '"Geist", sans-serif',
      color: "#101510",
    },
  },
  crosshair: {
    line: { stroke: "#CFCABA", strokeWidth: 1 },
  },
};

// Cashflow palette — income (forest) + spend (terracotta)
export const cashflowColors = ["#1F3A2E", "#B7402A"];

// Category palette — matches CAT_COLORS in Transactions.jsx
export const categoryColors = [
  "#1F3A2E", "#4C6B59", "#B7402A", "#6A8C78",
  "#B8892A", "#2C4A3B", "#5B625B", "#CFCABA",
];
