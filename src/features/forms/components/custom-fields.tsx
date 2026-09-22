import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { inputName, type CustomValues, type FieldDefinition } from "@/features/forms/fields";

/** Rendu des champs personnalisés d'un formulaire (valeurs initiales facultatives). */
export function CustomFields({
  fields,
  values = {},
  errors = {},
}: {
  fields: FieldDefinition[];
  values?: CustomValues;
  errors?: Record<string, string[] | undefined>;
}) {
  return (
    <>
      {fields.map((field) => {
        const name = inputName(field.key);
        const id = `field-${field.key}`;
        const value = values[field.key];
        const fieldErrors = errors[name];
        const described = fieldErrors ? `${id}-error` : field.help ? `${id}-hint` : undefined;

        if (field.type === "checkbox" || field.type === "file") {
          return (
            <div key={field.key} className="grid gap-1 sm:col-span-2">
              <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 text-sm">
                <input id={id} name={name} type="checkbox" defaultChecked={value === true} className="size-4.5 accent-[var(--primary)]" />
                <span className="flex-1">
                  {field.label}
                  {field.type === "file" ? <span className="text-muted-foreground"> — pièce reçue</span> : null}
                </span>
                {field.required ? <span className="text-xs text-muted-foreground">requis</span> : null}
              </label>
              {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
            </div>
          );
        }

        const label = field.required ? `${field.label} *` : field.label;
        const common = {
          id,
          name,
          required: field.required,
          "aria-invalid": Boolean(fieldErrors),
          "aria-describedby": described,
        };
        return (
          <div key={field.key} className={field.type === "textarea" ? "sm:col-span-2" : undefined}>
            <FormField id={id} label={label} hint={field.help} errors={fieldErrors}>
              {field.type === "textarea" ? (
                <Textarea {...common} defaultValue={typeof value === "string" ? value : ""} maxLength={2000} />
              ) : field.type === "select" ? (
                <Select {...common} defaultValue={typeof value === "string" ? value : ""}>
                  <option value="">Choisir…</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  {...common}
                  type={field.type === "phone" ? "tel" : field.type === "text" ? "text" : field.type}
                  defaultValue={value === undefined ? "" : String(value)}
                  maxLength={200}
                />
              )}
            </FormField>
          </div>
        );
      })}
    </>
  );
}
