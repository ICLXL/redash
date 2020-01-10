import React, { useState, useEffect } from "react";

import routes from "@/pages";

import Router from "./Router";
import DefaultAuthenticated from "./layout/DefaultAuthenticated";
import DefaultSignedOut from "./layout/DefaultSignedOut";
import handleNavigationIntent from "./handleNavigationIntent";

export const Layout = {
  DefaultAuthenticated,
  DefaultSignedOut,
};

export default function ApplicationArea() {
  const [currentRoute, setCurrentRoute] = useState(null);

  useEffect(() => {
    if (currentRoute && currentRoute.title) {
      document.title = currentRoute.title;
    }
  }, [currentRoute]);

  useEffect(() => {
    document.body.addEventListener("click", handleNavigationIntent, false);

    return () => {
      document.body.removeEventListener("click", handleNavigationIntent, false);
    };
  });

  return <Router routes={routes} onRouteChange={setCurrentRoute} />;
}
