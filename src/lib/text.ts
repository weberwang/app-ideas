/** 清理外部数据中的展示文本，统一破折号并去掉多余空白。 */
export function normalizePublicText(value: string): string {
  return value.replace(/[—–]/g, "-").replace(/\s+/g, " ").trim();
}

/** 仅接受外部数据中的 HTTP(S) 地址，避免把危险协议带到页面链接。 */
export function normalizePublicUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
