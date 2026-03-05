"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";

export default function NavTabs() {
  const router = useRouter();
  const pathname = usePathname();

  const isKort = pathname.startsWith("/kort");
  const isKunder = pathname.startsWith("/kunder");

  const btnBase: React.CSSProperties = {
    flex: 1,
    padding: "12px 10px",
    borderRadius: 14,
    border: "1px solid #333",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,

        padding: 12,
        paddingBottom: "calc(12px + env(safe-area-inset-bottom))",

        background: "rgba(10,10,10,0.92)",
        borderTop: "1px solid #222",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          maxWidth: 780,
          margin: "0 auto",
          display: "flex",
          gap: 10,
        }}
      >
        <button
          onClick={() => {
            if (!isKort) router.replace("/kort");
          }}
          style={{
            ...btnBase,
            background: isKort ? "#0f2a1b" : "#111",
            borderColor: isKort ? "#2ecc71" : "#333",
          }}
        >
          Kort
        </button>

        <button
          onClick={() => {
            if (!isKunder) router.replace("/kunder");
          }}
          style={{
            ...btnBase,
            background: isKunder ? "#0f2a1b" : "#111",
            borderColor: isKunder ? "#2ecc71" : "#333",
          }}
        >
          Kunder
        </button>
      </div>
    </div>
  );
}