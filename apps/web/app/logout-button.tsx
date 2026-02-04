"use client";

import { useState } from "react";

import { getCsrfToken } from "../src/client/csrf";

export const LogoutButton = () => {
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    if (loading) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "x-csrf-token": getCsrfToken() ?? "",
        },
      });
      if (response.redirected) {
        window.location.assign(response.url);
      } else {
        window.location.assign("/");
      }
    } catch {
      window.location.assign("/");
    }
  };

  return (
    <button type="button" onClick={handleLogout} disabled={loading}>
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
};
