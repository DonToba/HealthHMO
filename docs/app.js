const state = {
  enrollees: [],
  providers: [],
  homeMatches: {},
  selected: null,
  radius: 200,
  mode: "home",
  alternate: null,
  types: new Set(),
};

const $ = (id) => document.getElementById(id);
const providerIcons = {
  Hospital: "🏥",
  Dental: "🦷",
  Optician: "👓",
  Pharmacy: "💊",
  Paediatrics: "👶",
  Physiotherapy: "🩺",
};

async function loadData() {
  const [enrollees, providers, homeMatches, metadata] = await Promise.all([
    fetch("../generated/enrollees.json").then(r => r.json()),
    fetch("../generated/providers.json").then(r => r.json()),
    fetch("../generated/home_matches.json").then(r => r.json()),
    fetch("../generated/metadata.json").then(r => r.json()),
  ]);

  state.enrollees = enrollees;
  state.providers = providers;
  state.homeMatches = homeMatches;
  state.selected = enrollees[0] || null;

  $("enrolleeCount").textContent = metadata.enrollee_count.toLocaleString();
  $("providerCount").textContent = metadata.provider_count.toLocaleString();
  $("indexStatus").textContent = `${metadata.provider_count} providers indexed`;

  buildCategories();
  renderSelected();
  runSearch();
}

function buildCategories() {
  const types = [...new Set(state.providers.map(p => p.type))].sort();
  state.types = new Set(types);

  $("categories").innerHTML = types.map(type => `
    <label class="category">
      <input type="checkbox" checked data-type="${escapeHtml(type)}">
      ${providerIcons[type] || "✚"} ${escapeHtml(type)}
    </label>
  `).join("");

  $("categories").querySelectorAll("input").forEach(input => {
    input.addEventListener("change", () => {
      if (input.checked) state.types.add(input.dataset.type);
      else state.types.delete(input.dataset.type);
      runSearch();
    });
  });
}

function renderSelected() {
  const e = state.selected;
  if (!e) {
    $("selectedEnrollee").innerHTML = `<small>No enrollee records found.</small>`;
    return;
  }

  $("selectedEnrollee").innerHTML = `
    <strong>${escapeHtml(e.name)}</strong>
    <small>${escapeHtml(e.enrollee_id)} · ${escapeHtml(e.address || "Address not available")}</small>
    <span class="plan">${escapeHtml(e.plan || "NO PLAN")}</span>
  `;

  $("mapMeta").textContent =
    `${e.name} · ${formatRadius(state.radius)} radius · ${e.plan || "No plan"} eligibility`;

  $("enrolleeSearch").value = e.name;
}

function getSearchPoint() {
  if (state.mode === "alternate" && state.alternate) {
    return state.alternate;
  }
  return state.selected ? { lon: state.selected.lon, lat: state.selected.lat } : null;
}

function runSearch() {
  const point = getSearchPoint();
  if (!point || !state.selected) return;

  const matches = state.providers
    .map(provider => {
      const distance = haversineM(
        point.lon,
        point.lat,
        provider.lon,
        provider.lat
      );

      const planEligible =
        normalize(state.selected.plan) !== "" &&
        normalize(state.selected.plan) === normalize(provider.plan);

      return {
        ...provider,
        distance_m: distance,
        plan_eligible: planEligible,
      };
    })
    .filter(p =>
      p.distance_m <= state.radius &&
      state.types.has(p.type)
    )
    .sort((a, b) => a.distance_m - b.distance_m);

  renderResults(matches);
  renderAudit(matches);
  renderMap(matches);
}

function renderResults(matches) {
  $("resultCount").textContent =
    `${matches.filter(p => p.plan_eligible).length} eligible provider${matches.filter(p => p.plan_eligible).length === 1 ? "" : "s"} found`;

  const eligible = matches.filter(p => p.plan_eligible);

  $("resultCards").innerHTML = eligible.map(provider => `
    <article class="card" onclick="showToast('${escapeJs(provider.name)} selected for details.')">
      <div class="card-top">
        <span class="card-icon">${providerIcons[provider.type] || "✚"}</span>
        <span class="distance">${Math.round(provider.distance_m)} m</span>
      </div>
      <h3>${escapeHtml(provider.name)}</h3>
      <p>${escapeHtml(provider.type)} · ${escapeHtml(provider.address || "Address unavailable")}</p>
      <div class="card-foot">✓ Plan eligible · View details →</div>
    </article>
  `).join("");

  $("emptyState").style.display = eligible.length ? "none" : "block";
}

function renderAudit(matches) {
  $("auditBody").innerHTML = matches.map(provider => `
    <tr>
      <td><strong>${escapeHtml(provider.name)}</strong></td>
      <td>${providerIcons[provider.type] || "✚"} ${escapeHtml(provider.type)}</td>
      <td>${Math.round(provider.distance_m)} m</td>
      <td><span class="badge ${provider.plan_eligible ? "yes" : "no"}">${provider.plan_eligible ? "✓ MATCH" : "✕ MISMATCH"}</span></td>
      <td>${provider.plan_eligible ? "Eligible network" : "Plan mismatch"}</td>
    </tr>
  `).join("");
}

function renderMap(matches) {
  const map = $("map");
  const markerContainer = $("providerMarkers");
  markerContainer.innerHTML = "";

  const eligible = matches.filter(p => p.plan_eligible);
  const max = Math.max(state.radius, 1);

  matches.slice(0, 80).forEach((provider, index) => {
    const x = 23 + ((index * 37) % 63);
    const y = 18 + ((index * 53) % 66);
    const marker = document.createElement("div");

    marker.className = `provider-marker ${provider.plan_eligible ? "" : "out"}`;
    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;
    marker.title = `${provider.name} · ${Math.round(provider.distance_m)} m`;
    marker.textContent = providerIcons[provider.type] || "✚";
    markerContainer.appendChild(marker);
  });

  const ring = $("radiusRing");
  const size = Math.min(360, Math.max(150, 150 + (state.radius / 1000) * 210));
  ring.style.width = `${size}px`;
  ring.style.height = `${size}px`;

  $("mapMeta").textContent =
    `${state.mode === "home" ? state.selected.name : "Alternate location"} · ${formatRadius(state.radius)} radius · ${state.selected.plan || "No plan"} eligibility`;
}

function selectEnrollee(enrollee) {
  state.selected = enrollee;
  state.mode = "home";
  state.alternate = null;
  document.querySelectorAll(".location").forEach(button => {
    button.classList.toggle("active", button.dataset.mode === "home");
  });
  $("alternateBox").classList.remove("show");
  renderSelected();
  runSearch();
}

function showSuggestions(value) {
  const query = normalize(value);

  if (!query) {
    $("suggestions").classList.remove("show");
    return;
  }

  const matches = state.enrollees.filter(e =>
    normalize(`${e.name} ${e.enrollee_id} ${e.address}`).includes(query)
  ).slice(0, 8);

  $("suggestions").innerHTML = matches.length
    ? matches.map(e => `
      <div class="suggestion" data-id="${escapeHtml(e.enrollee_id)}">
        <strong>${escapeHtml(e.name)}</strong>
        <small>${escapeHtml(e.enrollee_id)} · ${escapeHtml(e.address || "")}</small>
      </div>
    `).join("")
    : `<div class="suggestion"><small>No enrollee found</small></div>`;

  $("suggestions").classList.add("show");
}

async function useBrowserLocation() {
  if (!navigator.geolocation) {
    showToast("Browser geolocation is not available.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    position => {
      state.alternate = {
        lon: position.coords.longitude,
        lat: position.coords.latitude,
      };
      $("alternateAddress").value = "Current browser location";
      showToast("Current location selected.");
      runSearch();
    },
    () => showToast("Location permission was not granted.")
  );
}

function setupEvents() {
  $("enrolleeSearch").addEventListener("input", e => showSuggestions(e.target.value));

  $("suggestions").addEventListener("click", e => {
    const item = e.target.closest(".suggestion");
    if (!item?.dataset.id) return;

    const enrollee = state.enrollees.find(
      x => x.enrollee_id === item.dataset.id
    );

    if (enrollee) selectEnrollee(enrollee);
    $("suggestions").classList.remove("show");
  });

  document.querySelectorAll(".location").forEach(button => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      document.querySelectorAll(".location").forEach(x =>
        x.classList.toggle("active", x === button)
      );
      $("alternateBox").classList.toggle("show", state.mode === "alternate");

      if (state.mode === "home") {
        state.alternate = null;
        renderSelected();
        runSearch();
      } else {
        showToast("Alternate location search enabled.");
      }
    });
  });

  document.querySelectorAll(".radius-options button").forEach(button => {
    button.addEventListener("click", () => {
      state.radius = Number(button.dataset.radius);
      document.querySelectorAll(".radius-options button").forEach(x =>
        x.classList.toggle("active", x === button)
      );
      renderSelected();
      runSearch();
    });
  });

  $("geocodeBtn").addEventListener("click", async () => {
    const value = $("alternateAddress").value.trim();

    if (!value) {
      showToast("Enter an address or use browser location.");
      return;
    }

    if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(value)) {
      const [lat, lon] = value.split(",").map(Number);
      state.alternate = { lon, lat };
      showToast("Coordinate location selected.");
      runSearch();
      return;
    }

    showToast("For address geocoding, connect a protected geocoding service.");
  });

  $("searchBtn").addEventListener("click", runSearch);

  $("clearBtn").addEventListener("click", () => {
    $("enrolleeSearch").value = "";
    $("suggestions").classList.remove("show");
    showToast("Search input cleared.");
  });

  $("exportBtn").addEventListener("click", exportResults);
  $("csvBtn").addEventListener("click", exportResults);

  document.addEventListener("click", e => {
    if (!e.target.closest(".search-wrap") && !e.target.closest(".suggestions")) {
      $("suggestions").classList.remove("show");
    }
  });
}

function exportResults() {
  const point = getSearchPoint();
  if (!point || !state.selected) return;

  const rows = state.providers
    .map(p => ({
      ...p,
      distance_m: haversineM(point.lon, point.lat, p.lon, p.lat),
    }))
    .filter(p => p.distance_m <= state.radius && state.types.has(p.type))
    .sort((a, b) => a.distance_m - b.distance_m);

  const header = ["Provider", "Category", "Distance_m", "Plan", "Plan_Eligible", "Address"];
  const csv = [
    header,
    ...rows.map(p => [
      p.name,
      p.type,
      Math.round(p.distance_m),
      p.plan,
      normalize(p.plan) === normalize(state.selected.plan),
      p.address,
    ]),
  ].map(row => row.map(csvCell).join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hmo_provider_search_${state.selected.enrollee_id}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Provider results exported.");
}

function haversineM(lon1, lat1, lon2, lat2) {
  const R = 6371008.8;
  const toRad = value => value * Math.PI / 180;
  const dLon = toRad(lon2 - lon1);
  const dLat = toRad(lat2 - lat1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function formatRadius(value) {
  return value >= 1000 ? `${value / 1000} km` : `${value} m`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function escapeJs(value) {
  return String(value ?? "").replace(/'/g, "\\'");
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

loadData().catch(error => {
  console.error(error);
  $("indexStatus").textContent = "Data index unavailable";
  showToast("Could not load generated HMO data.");
});

setupEvents();
