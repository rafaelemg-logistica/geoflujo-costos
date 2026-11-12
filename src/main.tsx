import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "../app/globals.css";
import Home from "../app/page";
import AgroCalculator from "./AgroCalculator";

const isAgroCalculator = new URLSearchParams(window.location.search).has("calculadora");
createRoot(document.getElementById("root")!).render(
  <StrictMode>{isAgroCalculator ? <AgroCalculator /> : <Home />}</StrictMode>
);
