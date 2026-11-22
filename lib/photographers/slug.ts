export function photographerSlug(name: string, id: string): string {
  const slugPart = (input: string): string =>
    input.toLowerCase().normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

  return `${slugPart(name) || "photographer"}-${slugPart(id).slice(-10)}`;
}
