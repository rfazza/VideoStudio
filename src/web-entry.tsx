import React from "react";
import { createRoot } from "react-dom/client";
import { Studio } from "./Studio";
import "./index.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <Studio />
    </React.StrictMode>
  );
}
