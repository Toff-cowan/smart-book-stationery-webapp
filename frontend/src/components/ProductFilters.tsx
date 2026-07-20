"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

import { fetchGrades, fetchSchools } from "@/lib/api";
import type { Department, GradeFilter, SchoolFilter } from "@/lib/types";

const DEPARTMENTS: { value: "" | Department; label: string }[] = [
  { value: "", label: "All" },
  { value: "textbooks", label: "Textbooks" },
  { value: "stationery", label: "Stationery" },
  { value: "gifts", label: "Gifts" },
];

type ProductFiltersProps = {
  department: "" | Department;
  school: string;
  grade: string;
  onDepartmentChange: (value: "" | Department) => void;
  onSchoolChange: (value: string) => void;
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
  school,
  grade,
  onDepartmentChange,
  onSchoolChange,
  onGradeChange,
}: ProductFiltersProps) {
  const [schools, setSchools] = useState<SchoolFilter[]>([]);
  const [grades, setGrades] = useState<GradeFilter[]>([]);
  const [openSection, setOpenSection] = useState<
    "department" | "school" | "grade" | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchSchools(), fetchGrades()])
      .then(([schoolRes, gradeRes]) => {
        if (cancelled) return;
        setSchools(schoolRes.data);
        setGrades(gradeRes.data);
      })
      .catch(() => {
        if (cancelled) return;
        setSchools([]);
        setGrades([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const departmentLabel =
    DEPARTMENTS.find((d) => d.value === department)?.label ?? "All";
  const schoolLabel = school || "All schools";
  const gradeLabel = grade || "All grades";

  function toggle(section: "department" | "school" | "grade") {
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
          title="Schools"
          summary={schoolLabel}
          open={openSection === "school"}
          onToggle={() => toggle("school")}
        >
          <div className="school-filters">
            <button
              type="button"
              className={school === "" ? "school-link active" : "school-link"}
              onClick={() => onSchoolChange("")}
            >
              All schools
            </button>
            {schools.map((s) => (
              <button
                key={s.name}
                type="button"
                className={school === s.name ? "school-link active" : "school-link"}
                onClick={() => onSchoolChange(s.name)}
              >
                <span>{s.name}</span>
                <span className="school-count">({s.count})</span>
              </button>
            ))}
            {schools.length === 0 ? (
              <p className="filter-empty">No schools listed yet.</p>
            ) : null}
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
