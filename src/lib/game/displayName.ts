// Title-cases the known lowercase root label; leaves proper taxon names untouched.
export function displayName(name: string | undefined): string {
  if (!name) return "";
  return name === "dinosaur" ? "Dinosauria" : name;
}
