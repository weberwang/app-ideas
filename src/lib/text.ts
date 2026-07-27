/** 清理外部数据中的展示文本，统一破折号并去掉多余空白。 */
export function normalizePublicText(value: string): string {
  return value.replace(/[—–]/g, "-").replace(/\s+/g, " ").trim();
}
