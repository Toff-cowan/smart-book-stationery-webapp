"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

import { fetchGrades } from "@/lib/api";
import type { Department, GradeFilter } from "@/lib/types";

const DEPARTMENTS: { value: "" | Department; label: string }[] = [
  { value: "", label: "All" },
  { value: "textbooks", label: "Textbooks" },
  { value: "stationery", label: "Stationery" },
  { value: "gifts", label: "Gifts" },
];

type ProductFiltersProps = {
  department: "" | Department;
  grade: string;
  onDepartmentChange: (value: "" | Department) => void;
  onGradeChange: (value: string) => void;
};

type FilterDropdownProps = {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

function FilterDropdown({
  title,
  summary,
  open,
  onToggle,
  children,
}: FilterDropdownProps) {
  const panelId = useId();

  return (
    <div className={`filter-dropdown${open ? " open" : ""}`}>
      <button
        type="button"
        className="filter-dropdown-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="filter-dropdown-text">
          <span className="filter-label">{title}</span>
          <span className="filter-dropdown-summary">{summary}</span>
        </span>
        <span className="filter-dropdown-chevron" aria-hidden="true" />
      </button>
      <div
        id={panelId}
        className="filter-dropdown-panel"
        role="group"
        aria-label={title}
        hidden={!open}
      >
        {children}
      </div>
    </div>
  );
}

export function ProductFilters({
  department,
  grade,
  onDepartmentChange,
  onGradeChange,
}: ProductFiltersProps) {
  const [grades, setGrades] = useState<GradeFilter[]>([]);
  const [openSection, setOpenSection] = useState<"department" | "grade" | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    fetchGrades()
      .then((gradeRes) => {
        if (cancelled) return;
        setGrades(gradeRes.data);
      })
      .catch(() => {
        if (cancelled) return;
        setGrades([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const departmentLabel =
    DEPARTMENTS.find((d) => d.value === department)?.label ?? "All";
  const gradeLabel = grade || "All grades";

  function toggle(section: "department" | "grade") {
    setOpenSection((current) => (current === section ? null : section));
  }

  return (
    <aside className="filters-panel">
      <h2>Filter</h2>
      <div className="filters">
        <FilterDropdown
          title="Items"
          summary={departmentLabel}
          open={openSection === "department"}
          onToggle={() => toggle("department")}
        >
          <div className="dept-filters">
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
        </FilterDropdown>

        <FilterDropdown
          title="Grades"
          summary={gradeLabel}
          open={openSection === "grade"}
          onToggle={() => toggle("grade")}
        >
          <div className="school-filters">
            <button
              type="button"
              className={grade === "" ? "school-link active" : "school-link"}
              onClick={() => onGradeChange("")}
            >
              All grades
            </button>
            {grades.map((g) => (
              <button
                key={g.name}
                type="button"
                className={grade === g.name ? "school-link active" : "school-link"}
                onClick={() => onGradeChange(g.name)}
              >
                <span>{g.name}</span>
                <span className="school-count">({g.count})</span>
              </button>
            ))}
            {grades.length === 0 ? (
              <p className="filter-empty">No grade tags yet.</p>
            ) : null}
          </div>
        </FilterDropdown>
      </div>
    </aside>
  );
}
