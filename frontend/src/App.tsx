import { useEffect, useState } from "react";
import { NavLink, Route, Routes, Link, useLocation } from "react-router-dom";
import {
  PanelsTopLeft,
  Inbox,
  NotebookPen,
  FlaskConical,
  Activity,
  Settings2,
  Menu,
  X,
} from "lucide-react";
import { Overview } from "./pages/Overview";
import { Cases } from "./pages/Cases";
import { CaseDetail } from "./pages/CaseDetail";
import { PromptStudio } from "./pages/PromptStudio";
import { Evaluations } from "./pages/Evaluations";
import { Operations } from "./pages/Operations";
import { Modal } from "./components/ui";
import { operatorToken } from "./api/client";
export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  const [settings, setSettings] = useState(false),
    [mobile, setMobile] = useState(false),
    [token, setToken] = useState(operatorToken());
  return (
    <div className="app-shell">
      <button
        className="mobile-menu icon-button"
        onClick={() => setMobile((m) => !m)}
        aria-label="Toggle navigation"
      >
        {mobile ? <X /> : <Menu />}
      </button>
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <Link to="/" className="brand">
          <div className="brand-symbol">
            e<span>·</span>
          </div>
          <div>
            <strong>Enterprise AI</strong>
            <small>Customer Operations</small>
          </div>
        </Link>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {[
            ["/", "Overview", PanelsTopLeft],
            ["/cases", "Cases", Inbox],
            ["/prompts", "Prompt Studio", NotebookPen],
            ["/evaluations", "Evaluations", FlaskConical],
            ["/operations", "Operations", Activity],
          ].map(([path, label, Icon]) => {
            const Component = Icon as typeof Activity;
            return (
              <NavLink
                key={String(path)}
                to={path as string}
                end={path === "/"}
                onClick={() => setMobile(false)}
              >
                <Component size={18} />
                {label as string}
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="workspace-chip">
            <span className="dot" />
            <div>
              <strong>Local workspace</strong>
              <small>Single-operator environment</small>
            </div>
          </div>
          <button className="settings-button" onClick={() => setSettings(true)}>
            <Settings2 size={17} />
            Operator access
          </button>
          <span className="small muted">Version 1 · Human oversight</span>
        </div>
      </aside>
      <main>
        <div className="topbar">
          <span>Customer operations platform</span>
          <span className="workspace-pill">Development workspace</span>
        </div>
        <div className="page-content">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/cases" element={<Cases />} />
            <Route path="/cases/:id" element={<CaseDetail />} />
            <Route path="/prompts" element={<PromptStudio />} />
            <Route path="/evaluations" element={<Evaluations />} />
            <Route path="/operations" element={<Operations />} />
            <Route
              path="*"
              element={
                <div className="state">
                  <p>
                    This page does not exist.{" "}
                    <Link to="/">Return to overview</Link>.
                  </p>
                </div>
              }
            />
          </Routes>
        </div>
        <footer>
          Enterprise AI Customer Operations{" "}
          <span>Draft recommendations. Human decisions.</span>
        </footer>
      </main>
      {settings && (
        <Modal title="Operator access" onClose={() => setSettings(false)}>
          <p className="muted">
            Enter the ADMIN_TOKEN from backend/.env to create cases, review
            recommendations and manage prompts/jobs. It stays in this browser
            tab’s session storage.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sessionStorage.setItem("operatorToken", token);
              setSettings(false);
              window.location.reload();
            }}
          >
            <label>
              Operator token
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
                minLength={16}
                autoComplete="off"
              />
            </label>
            <button className="primary">Save access token</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
