import { createRoot } from "react-dom/client";
// Tipografías servidas desde el propio sitio: el navegador no contacta a Google Fonts
import App from "./App.tsx";
import "@fontsource/gloock/400.css";
import "@fontsource/onest/300.css";
import "@fontsource/onest/400.css";
import "@fontsource/onest/500.css";
import "@fontsource/onest/600.css";
import "@fontsource/onest/700.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
