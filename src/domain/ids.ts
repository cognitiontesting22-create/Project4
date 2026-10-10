export const uid = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`
