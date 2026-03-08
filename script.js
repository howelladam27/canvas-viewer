const baseUrlInput = document.getElementById("baseUrl");
const tokenInput = document.getElementById("token");
const courseFilter = document.getElementById("courseFilter");
const loadBtn = document.getElementById("load");
const resultsDiv = document.getElementById("results");
const statusDiv = document.getElementById("status");
const themeToggle = document.getElementById("themeToggle");

document.addEventListener("DOMContentLoaded", init);
loadBtn.addEventListener("click", getAssignments);
themeToggle.addEventListener("click", toggleTheme);

function init() {
  const savedUrl = localStorage.getItem("canvasUrl");
  const savedToken = localStorage.getItem("canvasToken");
  const savedTheme = localStorage.getItem("canvasTheme");

  if (savedUrl) baseUrlInput.value = savedUrl;
  if (savedToken) tokenInput.value = savedToken;

  if (savedTheme === "light") {
    document.body.classList.add("light");
    themeToggle.classList.add("on");
    themeToggle.querySelector(".toggle-thumb").textContent = "☀️";
  }
}

function toggleTheme() {
  const isLight = document.body.classList.toggle("light");
  themeToggle.classList.toggle("on", isLight);
  themeToggle.querySelector(".toggle-thumb").textContent = isLight ? "☀️" : "🌙";
  localStorage.setItem("canvasTheme", isLight ? "light" : "dark");
}

async function getAssignments() {
  const baseUrlRaw = baseUrlInput.value.trim();
  const token = tokenInput.value.trim();

  if (!baseUrlRaw || !token) {
    statusDiv.innerHTML = "Enter your Canvas URL and API token.";
    return;
  }

  localStorage.setItem("canvasUrl", baseUrlRaw);
  localStorage.setItem("canvasToken", token);

  const baseUrl = baseUrlRaw.replace(/\/+$/, "") + "/api/v1";
  const headers = { Authorization: `Bearer ${token}` };

  statusDiv.innerHTML = "Loading courses…";
  resultsDiv.innerHTML = "";

  let courses;
  try {
    const res = await fetch(`${baseUrl}/courses?enrollment_state=active`, { headers });
    if (!res.ok) throw new Error("Failed to load courses");
    courses = await res.json();
  } catch (err) {
    console.error(err);
    statusDiv.innerHTML = "Error loading courses. Check URL/token.";
    return;
  }

  courses = courses.filter(c => c.enrollments && c.enrollments.length > 0);

  courseFilter.innerHTML = `<option value="all">All courses</option>`;
  courses.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    courseFilter.appendChild(opt);
  });

  const selectedCourse = courseFilter.value;
  const now = new Date();
  const THIRTY_DAYS_AGO = new Date(now.getTime() - 30 * 86400000);
  const THREE_WEEKS_FROM_NOW = new Date(now.getTime() + 21 * 86400000);

  let allAssignments = [];

  for (const course of courses) {
    if (selectedCourse !== "all" && String(course.id) !== String(selectedCourse)) continue;

    statusDiv.innerHTML = `Loading: ${course.name}…`;

    let assignments;
    try {
      const res = await fetch(
        `${baseUrl}/courses/${course.id}/assignments?include[]=submission`,
        { headers }
      );
      if (!res.ok) continue;
      assignments = await res.json();
    } catch (err) {
      console.warn("Error loading assignments for course:", course.name, err);
      continue;
    }

    assignments.forEach(a => {
      const submission = a.submission || {};
      const isSubmitted =
        submission.workflow_state === "submitted" ||
        !!submission.submitted_at ||
        !!submission.excused;

      const dueDate = a.due_at ? new Date(a.due_at) : null;
      if (!dueDate) return;

      const isMissing =
        !isSubmitted &&
        dueDate < now &&
        dueDate >= THIRTY_DAYS_AGO;

      const isUpcoming =
        !isSubmitted &&
        dueDate >= now &&
        dueDate <= THREE_WEEKS_FROM_NOW;

      if (isMissing || isUpcoming) {
        allAssignments.push({
          course: course.name,
          name: a.name,
          due: a.due_at,
          missing: isMissing,
          url: a.html_url
        });
      }
    });
  }

  statusDiv.innerHTML = "";

  if (allAssignments.length === 0) {
    resultsDiv.innerHTML = `<div class="empty">
      No missing (last 30 days) or upcoming (next 3 weeks) assignments found.
    </div>`;
    return;
  }

  allAssignments.sort((a, b) => new Date(a.due) - new Date(b.due));

  resultsDiv.innerHTML = "";
  allAssignments.forEach(a => {
    const card = document.createElement("div");
    card.className = "card " + (a.missing ? "missing" : "upcoming");

    const dueStr = new Date(a.due).toLocaleString();

    card.innerHTML = `
      <div class="card-title">${a.name}</div>
      <div class="card-course">${a.course}</div>
      <div class="card-meta">
        <div>${dueStr}</div>
        <div class="badge ${a.missing ? "missing" : "upcoming"}">
          ${a.missing ? "Missing" : "Upcoming"}
        </div>
      </div>
      <div style="margin-top:6px;">
        <a href="${a.url}" target="_blank" class="link">
          Open in Canvas ↗
        </a>
      </div>
    `;

    resultsDiv.appendChild(card);
  });
}
