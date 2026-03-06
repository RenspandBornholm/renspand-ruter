"use client";

import React from "react";

type Props = {
  title?: string;
  subtitle?: string;
};

function formatTodayDa() {
  try {
    return new Intl.DateTimeFormat("da-DK", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date());
  } catch {
    return new Date().toLocaleDateString("da-DK");
  }
}

export default function AppHeader({
  title = "RenSpand Ruter",
  subtitle,
}: Props) {
  const today = formatTodayDa();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "14px 16px",
        marginBottom: 14,
        border: "1px solid #222",
        borderRadius: 18,
        background: "linear-gradient(180deg, rgba(20,20,20,0.95), rgba(12,12,12,0.95))",
        boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <img
          src="/apple-touch-icon.png"
          alt="RenSpand logo"
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            objectFit: "cover",
            border: "1px solid #2a2a2a",
            background: "#111",
            flexShrink: 0,
          }}
        />

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: 0.2,
              color: "#fff",
              lineHeight: 1.1,
            }}
          >
            {title}
          </div>

          <div
            style={{
              marginTop: 4,
              fontSize: 13,
              opacity: 0.78,
              color: "#ddd",
              textTransform: "capitalize",
            }}
          >
            {subtitle ? subtitle : today}
          </div>
        </div>
      </div>

      <div
        style={{
          padding: "8px 10px",
          borderRadius: 999,
          border: "1px solid #2a2a2a",
          background: "#111",
          fontSize: 12,
          fontWeight: 900,
          color: "#dff7e8",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        RenSpand
      </div>
    </div>
  );
}