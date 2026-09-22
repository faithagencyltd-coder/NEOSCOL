/** Extrait les champs texte d'un FormData (chaînes vides → undefined). */
export function readFields<K extends string>(formData: FormData, keys: readonly K[], prefix = ""): Record<K, string | undefined> {
  const result = {} as Record<K, string | undefined>;
  for (const key of keys) {
    const value = formData.get(`${prefix}${key}`);
    result[key] = typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
  }
  return result;
}

export function readBoolean(formData: FormData, key: string): boolean {
  return formData.get(key) === "on" || formData.get(key) === "true";
}
