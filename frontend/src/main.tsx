import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import { AppDataProvider } from "./context/AppDataContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <AppDataProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AppDataProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
