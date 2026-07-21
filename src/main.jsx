import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ControlApp from "./BarberQueueApp.jsx";
import QueueDisplay from "./QueueDisplay.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ControlApp />} />
        <Route path="/pantalla" element={<QueueDisplay />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
