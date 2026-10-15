"use client";

import { getSessionId } from "@/lib/api";

/**
 * Streams the visitor's Expo project (session overlay included) as a .zip.
 * Downloads go through navigation, so the session id rides on the query
 * param instead of a request header.
 */
export default function ExportButton() {
  return (
    <a
      className="ghost-btn"
      href="/api/export"
      title="Download your generated Expo project as a .zip — unpack and run npx expo start"
      onClick={(e) => {
        e.preventDefault();
        const id = getSessionId();
        window.location.href = id
          ? `/api/export?session=${encodeURIComponent(id)}`
          : "/api/export";
      }}
    >
      ⬇ export project
    </a>
  );
}
