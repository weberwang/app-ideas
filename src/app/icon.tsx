import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** 生成产品雷达浏览器图标，避免额外静态资源。 */
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#1769e0",
        color: "white",
        display: "flex",
        fontSize: 19,
        fontWeight: 700,
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      雷
    </div>,
    size,
  );
}
