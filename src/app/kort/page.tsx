import { Suspense } from "react";
import KortClient from "./KortClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 16, color: "#ddd" }}>Indlæser…</div>}>
      <KortClient />
    </Suspense>
  );
}