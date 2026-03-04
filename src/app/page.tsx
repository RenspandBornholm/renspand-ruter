"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/kort");
  }, [router]);

  return <div style={{ padding: 24, color: "#ddd" }}>Indlæser…</div>;
}