import Icon from "./Icon.jsx";

export default function SortTh({ label, col, sortBy, sortDir, onSort, className = "", style = {} }) {
  const active = sortBy === col;
  return (
    <th
      className={className}
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", ...style }}
      onClick={() => onSort(col)}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        {active && (
          <Icon name={sortDir === "asc" ? "chevUp" : "chevDown"} size={11} stroke={2} />
        )}
      </span>
    </th>
  );
}
