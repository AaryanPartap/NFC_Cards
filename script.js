const STORAGE_NAMESPACE = "nfcBusinessProfile.v2";
const PROFILE_API_BASE = "/api/profile";
const RUNTIME_API = "/api/runtime";
const IMAGE_ACCEPT = "image/*,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.heic,.heif,.avif,.tif,.tiff";
const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "heic",
  "heif",
  "avif",
  "tif",
  "tiff"
];

const defaultProfile = {
  name: "",
  company: "",
  jobTitle: "",
  bio: "",
  tags: "",
  email: "",
  phone: "",
  website: "",
  address: "",
  linkedin: "",
  twitter: "",
  instagram: "",
  youtube: "",
  profilePhoto: "",
  projects: []
};

const activeCardId = resolveCardId();

const state = {
  card: {
    id: activeCardId,
    storageKey: `${STORAGE_NAMESPACE}.${activeCardId}`,
    url: buildProfileUrl(activeCardId)
  },
  sync: {
    serverAvailable: true,
    lanBaseUrl: ""
  },
  profile: { ...defaultProfile }
};

const elements = {
  editBtn: document.getElementById("editBtn"),
  closeEditorBtn: document.getElementById("closeEditorBtn"),
  editorPanel: document.getElementById("editorPanel"),
  profileForm: document.getElementById("profileForm"),
  emptyState: document.getElementById("emptyState"),
  profileContent: document.getElementById("profileContent"),
  displayName: document.getElementById("displayName"),
  displayTitle: document.getElementById("displayTitle"),
  displayBio: document.getElementById("displayBio"),
  displayTags: document.getElementById("displayTags"),
  displayEmail: document.getElementById("displayEmail"),
  displayPhone: document.getElementById("displayPhone"),
  displayWebsite: document.getElementById("displayWebsite"),
  displayAddress: document.getElementById("displayAddress"),
  displayLinkedIn: document.getElementById("displayLinkedIn"),
  displayTwitter: document.getElementById("displayTwitter"),
  displayInstagram: document.getElementById("displayInstagram"),
  displayYouTube: document.getElementById("displayYouTube"),
  displayProjects: document.getElementById("displayProjects"),
  profilePhotoInput: document.getElementById("profilePhotoInput"),
  displayProfilePhoto: document.getElementById("displayProfilePhoto"),
  profilePhotoContainer: document.getElementById("profilePhotoContainer"),
  projectsList: document.getElementById("projectsList"),
  addProjectBtn: document.getElementById("addProjectBtn"),
  cardBadge: document.getElementById("cardBadge"),
  profileLinkHint: document.getElementById("profileLinkHint"),
  syncBadge: document.getElementById("syncBadge"),
  syncHint: document.getElementById("syncHint")
};

initialize();

async function initialize() {
  await hydrateRuntimeInfo();
  state.profile = await loadProfile(state.card.storageKey, state.card.id);

  elements.cardBadge.textContent = `Card: ${state.card.id}`;
  updateLinkHints();
  updateSyncUi();

  bindFormValues(state.profile);
  render(state.profile);

  elements.editBtn.addEventListener("click", openEditor);
  elements.closeEditorBtn.addEventListener("click", closeEditor);

  elements.profileForm.addEventListener("input", () => {
    const next = readFormValues();
    state.profile = next;
    persistProfile(next, state.card.storageKey, state.card.id);
    render(next);
  });

  elements.profilePhotoInput.addEventListener("change", handlePhotoUpload);
  elements.addProjectBtn.addEventListener("click", addProjectField);
}

function openEditor() {
  elements.editorPanel.classList.remove("hidden");
  requestAnimationFrame(() => elements.editorPanel.classList.add("open"));
  renderProjectsEditor();
}

function closeEditor() {
  elements.editorPanel.classList.remove("open");
  setTimeout(() => elements.editorPanel.classList.add("hidden"), 240);
}

function handlePhotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!isSupportedImage(file)) {
    alert("Please select a valid image file.");
    e.target.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const next = { ...state.profile, profilePhoto: event.target.result };
    state.profile = next;
    persistProfile(next, state.card.storageKey, state.card.id);
    render(next);
  };
  reader.readAsDataURL(file);
}

function bindFormValues(profile) {
  for (const [key, value] of Object.entries(profile)) {
    if (key === "profilePhoto" || key === "projects") continue;
    const field = elements.profileForm.elements.namedItem(key);
    if (field) {
      field.value = value;
    }
  }
}

function readFormValues() {
  const formData = new FormData(elements.profileForm);
  const profile = { ...defaultProfile };
  for (const key of Object.keys(defaultProfile)) {
    if (key === "profilePhoto" || key === "projects") continue;
    profile[key] = String(formData.get(key) || "").trim();
  }
  profile.profilePhoto = state.profile.profilePhoto;
  profile.projects = state.profile.projects || [];
  return profile;
}

function render(profile) {
  const hasData = Object.values(profile).some((value) => {
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return false;
  });

  elements.emptyState.classList.toggle("hidden", hasData);
  elements.profileContent.classList.toggle("hidden", !hasData);

  elements.displayName.textContent = profile.name || "Your Name";
  elements.displayTitle.textContent = [profile.jobTitle, profile.company]
    .filter(Boolean)
    .join(" at ") || "Job Title at Company";
  elements.displayBio.textContent = profile.bio || "Add your business summary in the editor.";

  renderProfilePhoto(profile);
  renderTags(profile.tags);
  renderContactLinks(profile);
  renderSocialLinks(profile);
  renderProjects(profile.projects);
}

function renderProfilePhoto(profile) {
  if (profile.profilePhoto) {
    elements.displayProfilePhoto.src = profile.profilePhoto;
    elements.profilePhotoContainer.classList.remove("hidden");
  } else {
    elements.profilePhotoContainer.classList.add("hidden");
  }
}

function renderTags(tagsValue) {
  const tags = tagsValue
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  elements.displayTags.innerHTML = "";
  if (tags.length === 0) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = "No tags added";
    elements.displayTags.appendChild(chip);
    return;
  }

  for (const tag of tags) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = tag;
    elements.displayTags.appendChild(chip);
  }
}

function renderContactLinks(profile) {
  setLink(elements.displayEmail, profile.email, `mailto:${profile.email}`);
  setLink(
    elements.displayPhone,
    profile.phone,
    `tel:${profile.phone.replace(/\s+/g, "")}`
  );
  setLink(elements.displayWebsite, profile.website, normalizeUrl(profile.website));
  elements.displayAddress.textContent = profile.address || "Not added";
}

function renderSocialLinks(profile) {
  setLink(elements.displayLinkedIn, profile.linkedin, normalizeUrl(profile.linkedin));
  setLink(elements.displayTwitter, profile.twitter, normalizeUrl(profile.twitter));
  setLink(elements.displayInstagram, profile.instagram, normalizeUrl(profile.instagram));
  setLink(elements.displayYouTube, profile.youtube, normalizeUrl(profile.youtube));
}

function renderProjects(projects) {
  elements.displayProjects.innerHTML = "";
  
  if (!projects || projects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-projects";
    empty.textContent = "No projects added yet";
    elements.displayProjects.appendChild(empty);
    return;
  }

  for (const project of projects) {
    const card = document.createElement("div");
    card.className = "project-card";

    if (project.photo) {
      const img = document.createElement("img");
      img.src = project.photo;
      img.alt = project.name;
      card.appendChild(img);
    }

    const content = document.createElement("div");
    content.className = "project-content";

    const title = document.createElement("h4");
    title.textContent = project.name;
    content.appendChild(title);

    if (project.description) {
      const desc = document.createElement("p");
      desc.textContent = project.description;
      content.appendChild(desc);
    }

    if (project.link) {
      const link = document.createElement("a");
      link.href = normalizeUrl(project.link);
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = project.link.includes("github") ? "View on GitHub" : "View Project";
      content.appendChild(link);
    }

    card.appendChild(content);
    elements.displayProjects.appendChild(card);
  }
}

function renderProjectsEditor() {
  const projects = state.profile.projects || [];
  elements.projectsList.innerHTML = "";

  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    const projectDiv = document.createElement("div");
    projectDiv.className = "project-editor-item";
    projectDiv.innerHTML = `
      <div class="project-editor-fields">
        <input type="text" placeholder="Project name" value="${escapeHtml(project.name)}" data-project-index="${i}" data-field="name" class="project-input">
        <textarea placeholder="Description" rows="2" data-project-index="${i}" data-field="description" class="project-input">${escapeHtml(project.description || "")}</textarea>
        <input type="url" placeholder="GitHub or project link" value="${escapeHtml(project.link)}" data-project-index="${i}" data-field="link" class="project-input">
        <label>Project Photo (optional)
          <input type="file" accept="${IMAGE_ACCEPT}" data-project-index="${i}" data-field="photo" class="project-photo-input">
        </label>
      </div>
      <button type="button" class="remove-project-btn" data-project-index="${i}">Remove Project</button>
    `;
    elements.projectsList.appendChild(projectDiv);

    const inputs = projectDiv.querySelectorAll(".project-input");
    inputs.forEach((input) => {
      input.addEventListener("input", handleProjectFieldChange);
    });

    const photoInput = projectDiv.querySelector(".project-photo-input");
    photoInput.addEventListener("change", handleProjectPhotoUpload);

    const removeBtn = projectDiv.querySelector(".remove-project-btn");
    removeBtn.addEventListener("click", removeProject);
  }
}

function handleProjectFieldChange(e) {
  const index = parseInt(e.target.dataset.projectIndex);
  const field = e.target.dataset.field;
  const value = e.target.value;

  state.profile.projects[index][field] = value;
  persistProfile(state.profile, state.card.storageKey, state.card.id);
  render(state.profile);
}

function handleProjectPhotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!isSupportedImage(file)) {
    alert("Please select a valid image file.");
    e.target.value = "";
    return;
  }

  const index = parseInt(e.target.dataset.projectIndex);
  const reader = new FileReader();
  reader.onload = (event) => {
    state.profile.projects[index].photo = event.target.result;
    persistProfile(state.profile, state.card.storageKey, state.card.id);
    render(state.profile);
  };
  reader.readAsDataURL(file);
}

function addProjectField() {
  if (!state.profile.projects) {
    state.profile.projects = [];
  }
  state.profile.projects.push({
    name: "",
    description: "",
    link: "",
    photo: ""
  });
  persistProfile(state.profile, state.card.storageKey, state.card.id);
  renderProjectsEditor();
}

function removeProject(e) {
  const index = parseInt(e.target.dataset.projectIndex);
  state.profile.projects.splice(index, 1);
  persistProfile(state.profile, state.card.storageKey, state.card.id);
  render(state.profile);
  renderProjectsEditor();
}

async function loadProfile(storageKey, cardId) {
  try {
    const response = await fetch(`${PROFILE_API_BASE}/${encodeURIComponent(cardId)}`);
    if (response.ok) {
      state.sync.serverAvailable = true;
      const profile = { ...defaultProfile, ...(await response.json()) };
      localStorage.setItem(storageKey, JSON.stringify(profile));
      return profile;
    }
  } catch {
    state.sync.serverAvailable = false;
  }

  return loadLocalProfile(storageKey);
}

function persistProfile(profile, storageKey, cardId) {
  localStorage.setItem(storageKey, JSON.stringify(profile));

  fetch(`${PROFILE_API_BASE}/${encodeURIComponent(cardId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile)
  }).catch(() => {
    state.sync.serverAvailable = false;
    updateSyncUi();
  });
}

async function hydrateRuntimeInfo() {
  try {
    const response = await fetch(RUNTIME_API);
    if (!response.ok) {
      return;
    }
    const runtime = await response.json();
    if (runtime && runtime.lanBaseUrl) {
      state.sync.lanBaseUrl = runtime.lanBaseUrl;
    }
  } catch {
    // Runtime info is optional.
  }
}

function updateLinkHints() {
  const lanLink = state.sync.lanBaseUrl
    ? `${state.sync.lanBaseUrl}/nfc${encodeURIComponent(state.card.id)}`
    : "";

  if (isLocalHost() && lanLink) {
    elements.profileLinkHint.textContent = `Write this NFC URL for other devices: ${lanLink}`;
    elements.syncHint.textContent = "You are on localhost. Other devices must use the LAN URL above, not localhost.";
    return;
  }

  elements.profileLinkHint.textContent = `Profile link for this card: ${state.card.url}`;
  elements.syncHint.textContent = "";
}

function updateSyncUi() {
  if (state.sync.serverAvailable) {
    elements.syncBadge.textContent = "Server sync: active";
    return;
  }

  elements.syncBadge.textContent = "Server sync: offline";
  elements.syncHint.textContent = "Server sync is offline. Changes may stay only in this browser until server connectivity is restored.";
}

function isLocalHost() {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

function resolveCardId() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = sanitizeCardId(params.get("card"));
  if (fromQuery) {
    return fromQuery;
  }

  const pathSegments = window.location.pathname.split("/").filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1] || "";
  const fromPath = parseCardIdFromPath(lastSegment);
  return fromPath || "default";
}

function parseCardIdFromPath(segment) {
  if (!segment || segment.includes(".")) {
    return "";
  }

  if (segment.toLowerCase().startsWith("nfc")) {
    return sanitizeCardId(segment.slice(3));
  }

  return sanitizeCardId(segment);
}

function sanitizeCardId(value) {
  if (!value) {
    return "";
  }
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 60);
}

function buildProfileUrl(cardId) {
  const url = new URL(window.location.href);
  url.pathname = `/nfc${cardId}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function setLink(el, label, href) {
  const safeLabel = label || "Not added";
  el.textContent = safeLabel;

  if (!label || !href) {
    el.removeAttribute("href");
    return;
  }

  el.href = href;
}

function normalizeUrl(url) {
  if (!url) {
    return "";
  }
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

function isSupportedImage(file) {
  if (file.type && file.type.toLowerCase().startsWith("image/")) {
    return true;
  }

  const name = file.name || "";
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return IMAGE_EXTENSIONS.includes(ext);
}

function loadLocalProfile(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return { ...defaultProfile };
    }
    const parsed = JSON.parse(raw);
    return { ...defaultProfile, ...parsed };
  } catch {
    return { ...defaultProfile };
  }
}