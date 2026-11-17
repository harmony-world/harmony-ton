export function sanitizeIntegerInput(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function sanitizeDecimalInput(raw: string): string {
  const cleaned = raw.replace(/,/g, '.').replace(/[^\d.]/g, '')
  const [head = '', ...rest] = cleaned.split('.')
  return rest.length > 0 ? `${head}.${rest.join('')}` : head
}
