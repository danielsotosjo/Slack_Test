/**
 * Project Hub — SPA sin build step.
 * Persistencia: localStorage (clave PM_HUB_V1).
 */

const STORAGE_KEY = "PM_HUB_V1";

function uid() {
  return crypto.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function addDaysISO(iso, days) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function defaultUI() {
  return {
    view: "projects",
    selectedProjectId: null,
    ganttProjectId: null,
    ganttIncludeChildren: true,
  };
}

function defaultState() {
  const p1 = uid();
  const p2 = uid();
  const a1 = uid();
  return {
    version: 1,
    projects: [
      { id: p1, name: "Producto digital", notes: "Línea principal", parentId: null },
      { id: p2, name: "Módulo de informes", notes: "Subproyecto", parentId: p1 },
    ],
    tasks: [
      {
        id: uid(),
        projectId: p2,
        title: "Diseño de wireframes",
        start: todayISO(),
        end: addDaysISO(todayISO(), 5),
        assigneeId: null,
        status: "doing",
        progress: 40,
      },
      {
        id: uid(),
        projectId: p1,
        title: "Kickoff y alcance",
        start: addDaysISO(todayISO(), -3),
        end: addDaysISO(todayISO(), 2),
        assigneeId: a1,
        status: "done",
        progress: 100,
      },
    ],
    assignees: [{ id: a1, name: "María García", role: "PM", email: "maria@ejemplo.com" }],
    vendors: [{ id: uid(), name: "CloudHosting S.A.", contact: "Ventas", email: "ventas@cloud.example", notes: "Infraestructura" }],
    stakeholders: [
      {
        id: uid(),
        name: "Dirección general",
        role: "Sponsor",
        influence: "high",
        interest: "high",
        notes: "Aprobación de presupuesto",
      },
    ],
    ui: {
      ...defaultUI(),
      selectedProjectId: p1,
      ganttProjectId: p1,
    },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const data = JSON.parse(raw);
    if (!Array.isArray(data.projects) || !Array.isArray(data.tasks)) return defaultState();
    const merged = {
      version: data.version ?? 1,
      projects: data.projects,
      tasks: data.tasks,
      assignees: Array.isArray(data.assignees) ? data.assignees : [],
      vendors: Array.isArray(data.vendors) ? data.vendors : [],
      stakeholders: Array.isArray(data.stakeholders) ? data.stakeholders : [],
      ui: { ...defaultUI(), ...(data.ui || {}) },
    };
    return normalizeState(merged);
  } catch {
    return defaultState();
  }
}

function normalizeState(s) {
  const ids = new Set(s.projects.map((p) => p.id));
  const firstRoot = s.projects.find((p) => !p.parentId) || s.projects[0];
  if (!s.ui.selectedProjectId || !ids.has(s.ui.selectedProjectId)) {
    s.ui.selectedProjectId = firstRoot?.id ?? null;
  }
  if (!s.ui.ganttProjectId || !ids.has(s.ui.ganttProjectId)) {
    s.ui.ganttProjectId = s.ui.selectedProjectId || firstRoot?.id || null;
  }
  return s;
}

function saveState(state) {
  const { version, projects, tasks, assignees, vendors, stakeholders, ui } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version, projects, tasks, assignees, vendors, stakeholders, ui }));
}

let state = loadState();
let ganttInstance = null;
let chartInstance = null;

function getProjectById(id) {
  return state.projects.find((p) => p.id === id);
}

function childProjects(parentId) {
  return state.projects.filter((p) => p.parentId === parentId);
}

function projectDescendantIds(rootId) {
  const out = new Set([rootId]);
  const walk = (id) => {
    childProjects(id).forEach((c) => {
      out.add(c.id);
      walk(c.id);
    });
  };
  walk(rootId);
  return out;
}

function tasksForGantt(projectId, includeChildren) {
  let ids = new Set([projectId]);
  if (includeChildren) ids = projectDescendantIds(projectId);
  return state.tasks.filter((t) => ids.has(t.projectId));
}

function assigneeName(id) {
  if (!id) return "—";
  const a = state.assignees.find((x) => x.id === id);
  return a ? a.name : "—";
}

function projectPath(projectId) {
  const parts = [];
  let cur = getProjectById(projectId);
  while (cur) {
    parts.unshift(cur.name);
    cur = cur.parentId ? getProjectById(cur.parentId) : null;
  }
  return parts.join(" › ");
}

function destroyGantt() {
  const el = document.getElementById("gantt-chart");
  if (el) el.innerHTML = "";
  ganttInstance = null;
}

function destroyChart() {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
}

function renderProjectTree(parentId, level = 0) {
  const nodes = state.projects.filter((p) => p.parentId === parentId);
  if (!nodes.length) return "";
  const ulClass = level === 0 ? "project-tree" : "project-tree tree-children";
  return `<ul class="${ulClass}">
    ${nodes
      .map((p) => {
        const sel = state.ui.selectedProjectId === p.id ? "selected" : "";
        return `<li>
          <div class="tree-node ${sel}" data-project-id="${p.id}" role="button" tabindex="0">
            <span class="name">${escapeHtml(p.name)}</span>
          </div>
          ${renderProjectTree(p.id, level + 1)}
        </li>`;
      })
      .join("")}
  </ul>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setView(view) {
  state.ui.view = view;
  document.querySelectorAll("#main-nav button").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
  });
  const titles = {
    projects: "Proyectos",
    gantt: "Diagrama de Gantt",
    stats: "Estadísticas",
    people: "Responsables",
    vendors: "Vendors",
    stakeholders: "Stakeholders",
  };
  document.getElementById("view-title").textContent = titles[view] || view;
  saveState(state);
  render();
}

function renderProjects() {
  const p = state.ui.selectedProjectId;
  const proj = p ? getProjectById(p) : null;
  const tasks = proj ? state.tasks.filter((t) => t.projectId === p) : [];

  const assigneeOptions = state.assignees.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");

  return `
    <div class="toolbar">
      <button type="button" class="btn btn-primary" id="btn-new-root">Nuevo proyecto</button>
      ${proj ? `<button type="button" class="btn" id="btn-new-sub">Subproyecto aquí</button>` : ""}
      <span class="toolbar-spacer"></span>
      ${proj ? `<span class="muted">${escapeHtml(projectPath(proj.id))}</span>` : ""}
    </div>
    <div class="split-layout">
      <div class="card">
        <h3>Lista de proyectos</h3>
        ${state.projects.filter((x) => !x.parentId).length === 0 ? `<div class="empty-state"><strong>Sin proyectos</strong>Crea un proyecto raíz para empezar.</div>` : renderProjectTree(null)}
      </div>
      <div class="card">
        <h3>Tareas ${proj ? `· ${escapeHtml(proj.name)}` : ""}</h3>
        ${
          !proj
            ? `<div class="empty-state"><strong>Selecciona un proyecto</strong>Haz clic en el árbol para ver y crear tareas.</div>`
            : `
        <div class="toolbar" style="margin-top:0">
          <button type="button" class="btn btn-primary btn-sm" id="btn-new-task">Nueva tarea</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Título</th><th>Responsable</th><th>Inicio</th><th>Fin</th><th>Estado</th><th>%</th><th></th></tr></thead>
            <tbody>
              ${tasks.length === 0 ? `<tr><td colspan="7" class="muted">No hay tareas en este proyecto.</td></tr>` : ""}
              ${tasks
                .map(
                  (t) => `
                <tr data-task-id="${t.id}">
                  <td>${escapeHtml(t.title)}</td>
                  <td>${escapeHtml(assigneeName(t.assigneeId))}</td>
                  <td>${t.start}</td>
                  <td>${t.end}</td>
                  <td><span class="badge badge-${t.status}">${t.status}</span></td>
                  <td>${t.progress ?? 0}</td>
                  <td><button type="button" class="btn btn-ghost btn-sm btn-edit-task">Editar</button></td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>`
        }
      </div>
    </div>`;
}

function renderGantt() {
  const projectOptions = state.projects
    .map((p) => `<option value="${p.id}" ${state.ui.ganttProjectId === p.id ? "selected" : ""}>${escapeHtml(projectPath(p.id))}</option>`)
    .join("");
  return `
    <div class="card">
      <div class="form-inline" style="margin-bottom:1rem">
        <div class="form-row">
          <label for="gantt-project">Proyecto base</label>
          <select id="gantt-project">${projectOptions || `<option value="">Sin proyectos</option>`}</select>
        </div>
        <div class="form-row checkbox-row" style="align-self:center;padding-top:1.1rem">
          <input type="checkbox" id="gantt-children" ${state.ui.ganttIncludeChildren ? "checked" : ""} />
          <label for="gantt-children" style="margin:0;font-weight:500">Incluir subproyectos</label>
        </div>
      </div>
      <div id="gantt-chart" class="gantt-host"></div>
      <p class="muted" style="margin-top:0.75rem">Las barras usan fechas de inicio y fin de cada tarea. Arrastra o redimensiona en el gráfico para actualizar fechas.</p>
    </div>`;
}

function renderStats() {
  const totalProjects = state.projects.length;
  const totalTasks = state.tasks.length;
  const done = state.tasks.filter((t) => t.status === "done").length;
  const avgProgress = totalTasks ? Math.round(state.tasks.reduce((s, t) => s + (t.progress || 0), 0) / totalTasks) : 0;
  const overdue = state.tasks.filter((t) => t.status !== "done" && t.end < todayISO()).length;

  return `
    <div class="grid-3" style="margin-bottom:1rem">
      <div class="card">
        <p class="stats-kpi-label">Proyectos</p>
        <p class="stats-kpi">${totalProjects}</p>
      </div>
      <div class="card">
        <p class="stats-kpi-label">Tareas totales</p>
        <p class="stats-kpi">${totalTasks}</p>
      </div>
      <div class="card">
        <p class="stats-kpi-label">Completadas</p>
        <p class="stats-kpi">${done}</p>
      </div>
      <div class="card">
        <p class="stats-kpi-label">Progreso medio</p>
        <p class="stats-kpi">${avgProgress}%</p>
      </div>
      <div class="card">
        <p class="stats-kpi-label">Vencidas (no hechas)</p>
        <p class="stats-kpi" style="color:${overdue ? "var(--danger)" : "inherit"}">${overdue}</p>
      </div>
      <div class="card">
        <p class="stats-kpi-label">Responsables</p>
        <p class="stats-kpi">${state.assignees.length}</p>
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3>Tareas por estado</h3>
        <div class="chart-box"><canvas id="chart-status"></canvas></div>
      </div>
      <div class="card">
        <h3>Respaldo</h3>
        <p class="muted">Exporta un archivo JSON con todos los proyectos, tareas, responsables, vendors y stakeholders.</p>
        <div class="toolbar" style="margin-top:1rem">
          <button type="button" class="btn btn-primary" id="btn-download-backup">Descargar backup</button>
          <button type="button" class="btn" id="btn-import-backup">Importar backup</button>
        </div>
      </div>
    </div>`;
}

function renderTableList(title, emptyMsg, rows, columns, actions) {
  return `
    <div class="card">
      <div class="toolbar">
        <h3 style="margin:0">${title}</h3>
        <span class="toolbar-spacer"></span>
        ${actions}
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>${columns.map((c) => `<th>${c}</th>`).join("")}<th></th></tr></thead>
          <tbody>
            ${rows.length === 0 ? `<tr><td colspan="${columns.length + 1}" class="muted">${emptyMsg}</td></tr>` : rows.join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderPeople() {
  const rows = state.assignees.map(
    (a) => `
    <tr data-assignee-id="${a.id}">
      <td>${escapeHtml(a.name)}</td>
      <td>${escapeHtml(a.role || "—")}</td>
      <td>${escapeHtml(a.email || "—")}</td>
      <td><button type="button" class="btn btn-ghost btn-sm btn-edit-assignee">Editar</button>
          <button type="button" class="btn btn-danger btn-sm btn-del-assignee">Eliminar</button></td>
    </tr>`
  );
  return renderTableList("Responsables", "Añade personas para asignar tareas.", rows, ["Nombre", "Rol", "Email"], `<button type="button" class="btn btn-primary btn-sm" id="btn-new-assignee">Añadir</button>`);
}

function renderVendors() {
  const rows = state.vendors.map(
    (v) => `
    <tr data-vendor-id="${v.id}">
      <td>${escapeHtml(v.name)}</td>
      <td>${escapeHtml(v.contact || "—")}</td>
      <td>${escapeHtml(v.email || "—")}</td>
      <td><button type="button" class="btn btn-ghost btn-sm btn-edit-vendor">Editar</button>
          <button type="button" class="btn btn-danger btn-sm btn-del-vendor">Eliminar</button></td>
    </tr>`
  );
  return renderTableList("Vendors", "Registra proveedores externos.", rows, ["Nombre", "Contacto", "Email"], `<button type="button" class="btn btn-primary btn-sm" id="btn-new-vendor">Añadir</button>`);
}

function renderStakeholders() {
  const rows = state.stakeholders.map(
    (s) => `
    <tr data-stakeholder-id="${s.id}">
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.role || "—")}</td>
      <td>${escapeHtml(s.influence || "—")}</td>
      <td>${escapeHtml(s.interest || "—")}</td>
      <td><button type="button" class="btn btn-ghost btn-sm btn-edit-stakeholder">Editar</button>
          <button type="button" class="btn btn-danger btn-sm btn-del-stakeholder">Eliminar</button></td>
    </tr>`
  );
  return renderTableList(
    "Stakeholders",
    "Mapea interesados con influencia e interés.",
    rows,
    ["Nombre", "Rol", "Influencia", "Interés"],
    `<button type="button" class="btn btn-primary btn-sm" id="btn-new-stakeholder">Añadir</button>`
  );
}

function render() {
  destroyGantt();
  destroyChart();
  const root = document.getElementById("app-root");
  const v = state.ui.view;
  if (v === "projects") root.innerHTML = renderProjects();
  else if (v === "gantt") root.innerHTML = renderGantt();
  else if (v === "stats") root.innerHTML = renderStats();
  else if (v === "people") root.innerHTML = renderPeople();
  else if (v === "vendors") root.innerHTML = renderVendors();
  else if (v === "stakeholders") root.innerHTML = renderStakeholders();
  else root.innerHTML = "";

  bindViewHandlers();
  if (v === "gantt") initGanttAfterPaint();
  if (v === "stats") initChartAfterPaint();
}

function bindViewHandlers() {
  const v = state.ui.view;

  document.querySelectorAll("#main-nav button").forEach((btn) => {
    btn.onclick = () => setView(btn.dataset.view);
  });

  document.getElementById("btn-export").onclick = downloadBackup;

  if (v === "projects") {
    document.getElementById("btn-new-root")?.addEventListener("click", () => openProjectModal(null));
    document.getElementById("btn-new-sub")?.addEventListener("click", () => openProjectModal(state.ui.selectedProjectId));
    document.querySelectorAll(".tree-node").forEach((node) => {
      node.addEventListener("click", () => {
        state.ui.selectedProjectId = node.dataset.projectId;
        saveState(state);
        render();
      });
      node.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          state.ui.selectedProjectId = node.dataset.projectId;
          saveState(state);
          render();
        }
      });
    });
    document.getElementById("btn-new-task")?.addEventListener("click", () => openTaskModal(null));
    document.querySelectorAll(".btn-edit-task").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.target.closest("tr").dataset.taskId;
        openTaskModal(id);
      });
    });
  }

  if (v === "gantt") {
    document.getElementById("gantt-project")?.addEventListener("change", (e) => {
      state.ui.ganttProjectId = e.target.value;
      saveState(state);
      render();
    });
    document.getElementById("gantt-children")?.addEventListener("change", (e) => {
      state.ui.ganttIncludeChildren = e.target.checked;
      saveState(state);
      render();
    });
  }

  if (v === "stats") {
    document.getElementById("btn-download-backup")?.addEventListener("click", downloadBackup);
    document.getElementById("btn-import-backup")?.addEventListener("click", () => document.getElementById("import-file").click());
  }

  if (v === "people") {
    document.getElementById("btn-new-assignee")?.addEventListener("click", () => openAssigneeModal(null));
    document.querySelectorAll(".btn-edit-assignee").forEach((btn) => {
      btn.addEventListener("click", (e) => openAssigneeModal(e.target.closest("tr").dataset.assigneeId));
    });
    document.querySelectorAll(".btn-del-assignee").forEach((btn) => {
      btn.addEventListener("click", (e) => deleteAssignee(e.target.closest("tr").dataset.assigneeId));
    });
  }
  if (v === "vendors") {
    document.getElementById("btn-new-vendor")?.addEventListener("click", () => openVendorModal(null));
    document.querySelectorAll(".btn-edit-vendor").forEach((btn) => {
      btn.addEventListener("click", (e) => openVendorModal(e.target.closest("tr").dataset.vendorId));
    });
    document.querySelectorAll(".btn-del-vendor").forEach((btn) => {
      btn.addEventListener("click", (e) => deleteVendor(e.target.closest("tr").dataset.vendorId));
    });
  }
  if (v === "stakeholders") {
    document.getElementById("btn-new-stakeholder")?.addEventListener("click", () => openStakeholderModal(null));
    document.querySelectorAll(".btn-edit-stakeholder").forEach((btn) => {
      btn.addEventListener("click", (e) => openStakeholderModal(e.target.closest("tr").dataset.stakeholderId));
    });
    document.querySelectorAll(".btn-del-stakeholder").forEach((btn) => {
      btn.addEventListener("click", (e) => deleteStakeholder(e.target.closest("tr").dataset.stakeholderId));
    });
  }
}

function initGanttAfterPaint() {
  requestAnimationFrame(() => {
    const host = document.getElementById("gantt-chart");
    if (!host || !state.ui.ganttProjectId) return;
    const list = tasksForGantt(state.ui.ganttProjectId, state.ui.ganttIncludeChildren);
    const frappeTasks = list.map((t) => {
      let end = t.end;
      if (end <= t.start) end = addDaysISO(t.start, 1);
      return {
        id: t.id,
        name: assigneeName(t.assigneeId) !== "—" ? `${t.title} · ${assigneeName(t.assigneeId)}` : t.title,
        start: t.start,
        end,
        progress: Math.min(100, Math.max(0, t.progress ?? 0)),
      };
    });
    if (!frappeTasks.length) {
      host.innerHTML = `<div class="empty-state"><strong>Sin tareas en este alcance</strong>Crea tareas con fechas en el proyecto seleccionado.</div>`;
      return;
    }
    if (typeof Gantt === "undefined") {
      host.innerHTML = `<div class="empty-state">No se pudo cargar la librería Gantt. Comprueba la conexión.</div>`;
      return;
    }
    ganttInstance = new Gantt(host, frappeTasks, {
      view_mode: "Day",
      on_date_change: (task, start, end) => {
        const t = state.tasks.find((x) => x.id === task.id);
        if (!t) return;
        t.start = formatDate(start);
        t.end = formatDate(end);
        if (t.end <= t.start) t.end = addDaysISO(t.start, 1);
        saveState(state);
      },
      on_progress_change: (task, progress) => {
        const t = state.tasks.find((x) => x.id === task.id);
        if (!t) return;
        t.progress = Math.round(progress);
        saveState(state);
      },
    });
  });
}

function formatDate(d) {
  if (typeof d === "string") return d.slice(0, 10);
  const x = new Date(d);
  return x.toISOString().slice(0, 10);
}

function initChartAfterPaint() {
  requestAnimationFrame(() => {
    const canvas = document.getElementById("chart-status");
    if (!canvas || typeof Chart === "undefined") return;
    const counts = { todo: 0, doing: 0, done: 0, blocked: 0 };
    state.tasks.forEach((t) => {
      if (counts[t.status] !== undefined) counts[t.status]++;
      else counts.todo++;
    });
    chartInstance = new Chart(canvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: ["Por hacer", "En curso", "Hecho", "Bloqueado"],
        datasets: [
          {
            data: [counts.todo, counts.doing, counts.done, counts.blocked],
            backgroundColor: ["#8b95a8", "#3d9cf0", "#34d399", "#f87171"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        plugins: { legend: { position: "bottom", labels: { color: "#8b95a8", padding: 12 } } },
        cutout: "58%",
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  });
}

function openModal(html) {
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `<div class="modal" role="dialog">${html}</div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap) close();
  });
  return { wrap, close };
}

function openProjectModal(parentId) {
  const isSub = !!parentId;
  const { wrap, close } = openModal(`
    <h3>${isSub ? "Nuevo subproyecto" : "Nuevo proyecto"}</h3>
    <div class="form-row"><label>Nombre</label><input class="input" id="f-p-name" placeholder="Nombre del proyecto" /></div>
    <div class="form-row"><label>Notas</label><textarea id="f-p-notes" placeholder="Opcional"></textarea></div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
      <button type="button" class="btn btn-primary" data-save>Guardar</button>
    </div>`);
  wrap.querySelector("[data-close]").onclick = close;
  wrap.querySelector("[data-save]").onclick = () => {
    const name = wrap.querySelector("#f-p-name").value.trim();
    if (!name) return;
    const id = uid();
    state.projects.push({ id, name, notes: wrap.querySelector("#f-p-notes").value.trim(), parentId: isSub ? parentId : null });
    state.ui.selectedProjectId = id;
    saveState(state);
    close();
    render();
  };
}

function openTaskModal(taskId) {
  const projectId = state.ui.selectedProjectId;
  const existing = taskId ? state.tasks.find((t) => t.id === taskId) : null;
  const assigneeOptions =
    `<option value="">Sin asignar</option>` +
    state.assignees.map((a) => `<option value="${a.id}" ${existing?.assigneeId === a.id ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("");

  const { wrap, close } = openModal(`
    <h3>${existing ? "Editar tarea" : "Nueva tarea"}</h3>
    <div class="form-row"><label>Título</label><input class="input" id="f-t-title" value="${existing ? escapeHtml(existing.title) : ""}" /></div>
    <div class="form-row"><label>Responsable</label><select id="f-t-assignee">${assigneeOptions}</select></div>
    <div class="grid-2" style="display:grid;gap:0.75rem">
      <div class="form-row"><label>Inicio</label><input class="input" type="date" id="f-t-start" value="${existing?.start || todayISO()}" /></div>
      <div class="form-row"><label>Fin</label><input class="input" type="date" id="f-t-end" value="${existing?.end || addDaysISO(todayISO(), 7)}" /></div>
    </div>
    <div class="form-row"><label>Estado</label>
      <select id="f-t-status">
        ${["todo", "doing", "done", "blocked"].map((s) => `<option value="${s}" ${existing?.status === s ? "selected" : ""}>${s}</option>`).join("")}
      </select>
    </div>
    <div class="form-row"><label>Progreso (0–100)</label><input class="input" type="number" min="0" max="100" id="f-t-progress" value="${existing?.progress ?? 0}" /></div>
    <div class="modal-actions">
      ${existing ? `<button type="button" class="btn btn-danger" data-del>Eliminar</button>` : ""}
      <span class="toolbar-spacer"></span>
      <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
      <button type="button" class="btn btn-primary" data-save>Guardar</button>
    </div>`);
  wrap.querySelector("[data-close]").onclick = close;
  wrap.querySelector("[data-save]").onclick = () => {
    const title = wrap.querySelector("#f-t-title").value.trim();
    if (!title || !projectId) return;
    const row = {
      title,
      assigneeId: wrap.querySelector("#f-t-assignee").value || null,
      start: wrap.querySelector("#f-t-start").value,
      end: wrap.querySelector("#f-t-end").value,
      status: wrap.querySelector("#f-t-status").value,
      progress: Math.min(100, Math.max(0, Number(wrap.querySelector("#f-t-progress").value) || 0)),
    };
    if (row.end <= row.start) row.end = addDaysISO(row.start, 1);
    if (existing) {
      Object.assign(existing, row);
    } else {
      state.tasks.push({ id: uid(), projectId, ...row });
    }
    saveState(state);
    close();
    render();
  };
  wrap.querySelector("[data-del]")?.addEventListener("click", () => {
    if (!existing || !confirm("¿Eliminar esta tarea?")) return;
    state.tasks = state.tasks.filter((t) => t.id !== existing.id);
    saveState(state);
    close();
    render();
  });
}

function openAssigneeModal(id) {
  const ex = id ? state.assignees.find((a) => a.id === id) : null;
  const { wrap, close } = openModal(`
    <h3>${ex ? "Editar responsable" : "Nuevo responsable"}</h3>
    <div class="form-row"><label>Nombre</label><input class="input" id="f-a-name" value="${ex ? escapeHtml(ex.name) : ""}" /></div>
    <div class="form-row"><label>Rol</label><input class="input" id="f-a-role" value="${ex ? escapeHtml(ex.role || "") : ""}" placeholder="p. ej. Desarrollador" /></div>
    <div class="form-row"><label>Email</label><input class="input" type="email" id="f-a-email" value="${ex ? escapeHtml(ex.email || "") : ""}" /></div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
      <button type="button" class="btn btn-primary" data-save>Guardar</button>
    </div>`);
  wrap.querySelector("[data-close]").onclick = close;
  wrap.querySelector("[data-save]").onclick = () => {
    const name = wrap.querySelector("#f-a-name").value.trim();
    if (!name) return;
    const row = {
      name,
      role: wrap.querySelector("#f-a-role").value.trim(),
      email: wrap.querySelector("#f-a-email").value.trim(),
    };
    if (ex) Object.assign(ex, row);
    else state.assignees.push({ id: uid(), ...row });
    saveState(state);
    close();
    render();
  };
}

function deleteAssignee(id) {
  if (!confirm("¿Eliminar este responsable? Las tareas quedarán sin asignar si apuntaban a él.")) return;
  state.assignees = state.assignees.filter((a) => a.id !== id);
  state.tasks.forEach((t) => {
    if (t.assigneeId === id) t.assigneeId = null;
  });
  saveState(state);
  render();
}

function openVendorModal(id) {
  const ex = id ? state.vendors.find((v) => v.id === id) : null;
  const { wrap, close } = openModal(`
    <h3>${ex ? "Editar vendor" : "Nuevo vendor"}</h3>
    <div class="form-row"><label>Nombre</label><input class="input" id="f-v-name" value="${ex ? escapeHtml(ex.name) : ""}" /></div>
    <div class="form-row"><label>Contacto</label><input class="input" id="f-v-contact" value="${ex ? escapeHtml(ex.contact || "") : ""}" /></div>
    <div class="form-row"><label>Email</label><input class="input" type="email" id="f-v-email" value="${ex ? escapeHtml(ex.email || "") : ""}" /></div>
    <div class="form-row"><label>Notas</label><textarea id="f-v-notes">${ex ? escapeHtml(ex.notes || "") : ""}</textarea></div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
      <button type="button" class="btn btn-primary" data-save>Guardar</button>
    </div>`);
  wrap.querySelector("[data-close]").onclick = close;
  wrap.querySelector("[data-save]").onclick = () => {
    const name = wrap.querySelector("#f-v-name").value.trim();
    if (!name) return;
    const row = {
      name,
      contact: wrap.querySelector("#f-v-contact").value.trim(),
      email: wrap.querySelector("#f-v-email").value.trim(),
      notes: wrap.querySelector("#f-v-notes").value.trim(),
    };
    if (ex) Object.assign(ex, row);
    else state.vendors.push({ id: uid(), ...row });
    saveState(state);
    close();
    render();
  };
}

function deleteVendor(id) {
  if (!confirm("¿Eliminar este vendor?")) return;
  state.vendors = state.vendors.filter((v) => v.id !== id);
  saveState(state);
  render();
}

function openStakeholderModal(id) {
  const ex = id ? state.stakeholders.find((s) => s.id === id) : null;
  const opts = (field) =>
    ["low", "med", "high"]
      .map((v) => `<option value="${v}" ${ex?.[field] === v ? "selected" : ""}>${v}</option>`)
      .join("");
  const { wrap, close } = openModal(`
    <h3>${ex ? "Editar stakeholder" : "Nuevo stakeholder"}</h3>
    <div class="form-row"><label>Nombre</label><input class="input" id="f-s-name" value="${ex ? escapeHtml(ex.name) : ""}" /></div>
    <div class="form-row"><label>Rol / área</label><input class="input" id="f-s-role" value="${ex ? escapeHtml(ex.role || "") : ""}" /></div>
    <div class="grid-2" style="display:grid;gap:0.75rem">
      <div class="form-row"><label>Influencia</label><select id="f-s-inf">${opts("influence")}</select></div>
      <div class="form-row"><label>Interés</label><select id="f-s-int">${opts("interest")}</select></div>
    </div>
    <div class="form-row"><label>Notas</label><textarea id="f-s-notes">${ex ? escapeHtml(ex.notes || "") : ""}</textarea></div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
      <button type="button" class="btn btn-primary" data-save>Guardar</button>
    </div>`);
  wrap.querySelector("[data-close]").onclick = close;
  wrap.querySelector("[data-save]").onclick = () => {
    const name = wrap.querySelector("#f-s-name").value.trim();
    if (!name) return;
    const row = {
      name,
      role: wrap.querySelector("#f-s-role").value.trim(),
      influence: wrap.querySelector("#f-s-inf").value,
      interest: wrap.querySelector("#f-s-int").value,
      notes: wrap.querySelector("#f-s-notes").value.trim(),
    };
    if (ex) Object.assign(ex, row);
    else state.stakeholders.push({ id: uid(), ...row });
    saveState(state);
    close();
    render();
  };
}

function deleteStakeholder(id) {
  if (!confirm("¿Eliminar este stakeholder?")) return;
  state.stakeholders = state.stakeholders.filter((s) => s.id !== id);
  saveState(state);
  render();
}

function downloadBackup() {
  const payload = {
    version: state.version ?? 1,
    projects: state.projects,
    tasks: state.tasks,
    assignees: state.assignees,
    vendors: state.vendors,
    stakeholders: state.stakeholders,
    ui: state.ui,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `project-hub-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

document.getElementById("import-file").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.projects || !data.tasks) throw new Error("Formato inválido");
      if (!confirm("La importación reemplazará todos los datos actuales. ¿Continuar?")) return;
      state = normalizeState({
        version: data.version ?? 1,
        projects: data.projects,
        tasks: data.tasks,
        assignees: data.assignees || [],
        vendors: data.vendors || [],
        stakeholders: data.stakeholders || [],
        ui: { ...defaultUI(), ...(data.ui || {}) },
      });
      saveState(state);
      setView(state.ui.view || "projects");
    } catch {
      alert("No se pudo importar el archivo.");
    }
  };
  reader.readAsText(file);
});

render();
