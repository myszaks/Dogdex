export type PolishForms = readonly [one: string, few: string, many: string]

export const POLISH_FORMS = {
  dog: ['pies', 'psy', 'psów'],
  field: ['pole', 'pola', 'pól'],
  registration: ['zapis', 'zapisy', 'zapisów'],
  event: ['wydarzenie', 'wydarzenia', 'wydarzeń'],
  participant: ['uczestnik', 'uczestnicy', 'uczestników'],
  day: ['dzień', 'dni', 'dni'],
  attempt: ['próba', 'próby', 'prób'],
  calculation: ['obliczenie', 'obliczenia', 'obliczeń'],
  view: ['widok', 'widoki', 'widoków'],
  section: ['sekcja', 'sekcje', 'sekcji'],
  criterion: ['kryterium', 'kryteria', 'kryteriów'],
  term: ['termin', 'terminy', 'terminów'],
  place: ['miejsce', 'miejsca', 'miejsc'],
} satisfies Record<string, PolishForms>

/**
 * Selects the Polish cardinal form without adding the number.
 *
 * In Polish only exactly 1 takes the singular form. Integers ending in 2–4
 * take the paucal form, except those ending in 12–14. All remaining values,
 * including 0, decimals and numbers such as 21, take the plural genitive.
 */
export function polishForm(
  count: number,
  [one, few, many]: PolishForms,
): string {
  const absolute = Math.abs(count)
  if (absolute === 1) return one
  if (!Number.isInteger(absolute)) return many

  const mod10 = absolute % 10
  const mod100 = absolute % 100
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few
  }
  return many
}

export function formatPolishCount(count: number, forms: PolishForms): string {
  return `${count} ${polishForm(count, forms)}`
}
