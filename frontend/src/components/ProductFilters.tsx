"use client";

import type { Department } from "@/lib/types";

const DEPARTMENTS: { value: "" | Department; label: string }[] = [
  { value: "", label: "All" },
  { value: "textbooks", label: "Textbooks" },
  { value: "stationery", label: "Stationery" },
  { value: "gifts", label: "Gifts" },
];

type ProductFiltersProps = {
  search: string;
  department: "" | Department;
  onSearchChange: (value: string) => void;
  onDepartmentChange: (value: "" | Department) => void;
};

export function ProductFilters({
  search,
  department,
  onSearchChange,
  onDepartmentChange,
}: ProductFiltersProps) {
  return (
    <aside className="filters-panel">
      <h2>Filter</h2>
      <div className="filters">
        <label className="search-field">
          <span className="filter-label">Search</span>
          <input
            type="search"
            placeholder="Title, author, publisher…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </label>
        <div className="dept-filters" role="group" aria-label="Department">
          <span className="filter-label">Department</span>
          {DEPARTMENTS.map((d) => (
            <button
              key={d.value || "all"}
              type="button"
              className={department === d.value ? "dept-btn active" : "dept-btn"}
              onClick={() => onDepartmentChange(d.value)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
