"use client";

import type { FormFillTemplate } from "@/lib/ledger/templates";

function fillField(field: Element, value: string): void {
  if (field instanceof HTMLInputElement && field.type === "checkbox") {
    field.checked = value === "yes" || value === "true";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    field instanceof HTMLSelectElement
  ) {
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

export function applyFormFill(formId: string, fields: Record<string, string>): void {
  const form = document.getElementById(formId);
  if (!(form instanceof HTMLFormElement)) {
    return;
  }
  for (const [name, value] of Object.entries(fields)) {
    const field = form.elements.namedItem(name);
    if (field instanceof RadioNodeList) {
      const first = field[0];
      if (first) {
        fillField(first, value);
      }
      continue;
    }
    if (field instanceof Element) {
      fillField(field, value);
    }
  }
}

export function FormFillTemplates({
  formId,
  templates,
  legend,
}: {
  formId: string;
  templates: FormFillTemplate[];
  legend: string;
}) {
  return (
    <div className="template-picks">
      <p className="template-legend">{legend}</p>
      <div className="template-row">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            className="btn btn-ghost template-chip"
            onClick={() => applyFormFill(formId, template.fields)}
          >
            {template.label}
          </button>
        ))}
      </div>
    </div>
  );
}
