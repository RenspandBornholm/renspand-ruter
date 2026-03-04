import { Suspense } from "react";
import NaesteClient from "./NaesteClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "#ddd" }}>Indlæser…</div>}>
      <NaesteClient />
    </Suspense>
  );
}