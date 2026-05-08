import { createContext, useContext, useState, useEffect } from "react";

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
  const [workspace, setWorkspace] = useState(undefined); // undefined = loading

  useEffect(() => {
    fetch("/api/workspace/current", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => setWorkspace(data))
      .catch(() => setWorkspace(null));
  }, []);

  function logout() {
    fetch("/api/workspace/logout", { method: "POST", credentials: "include" })
      .then(() => setWorkspace(null));
  }

  return (
    <WorkspaceContext.Provider value={{ workspace, setWorkspace, logout }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export const useWorkspace = () => useContext(WorkspaceContext);
