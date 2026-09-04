/* =========================================
   IDEA VAULT
   ADHD-Friendly Idea Management System
   Vanilla JavaScript
   ========================================= */

"use strict";

/* =========================================
   1. CONFIGURATION
========================================= */

const STORAGE_KEY = "ideaVaultIdeas";
const SETTINGS_KEY = "ideaVaultSettings";

const DEFAULT_SETTINGS = {
  primaryId: null,
  secondaryId: null
};

const IDEA_TYPES = {
  uncategorized: "Uncategorized",
  screenplay: "Screenplay",
  story: "Story",
  character: "Character",
  scene: "Scene",
  plot: "Plot / Concept",
  worldbuilding: "Worldbuilding",
  website: "Website",
  app: "App",
  business: "Business",
  content: "Content",
  essay: "Essay",
  poetry: "Poetry",
  research: "Research",
  learning: "Learning",
  personal: "Personal",
  "random-thought": "Random Thought",
  other: "Other"
};

const IDEA_STATUSES = {
  inbox: "Inbox",
  clarifying: "Clarifying",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
  rejected: "Not for now"
};

const PROGRESS_STATES = {
  "just-an-idea": "Just an idea",
  exploring: "Exploring",
  developing: "Developing",
  drafting: "Drafting",
  revising: "Revising",
  "nearly-finished": "Nearly finished",
  completed: "Completed"
};


/* =========================================
   2. APPLICATION STATE
========================================= */

let ideas = loadIdeas();
let settings = loadSettings();

let currentEditingId = null;
let currentFocusChoice = null;
let pendingFocusId = null;
let currentReviewIdeas = [];
let currentReviewIndex = 0;
let toastTimeout = null;


/* =========================================
   3. DOM REFERENCES
========================================= */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const quickCaptureForm = $("#quick-capture-form");
const quickIdeaTitle = $("#quick-idea-title");
const quickIdeaDetails = $("#quick-idea-details");

const recentIdeasList = $("#recent-ideas-list");
const backupIdeasList = $("#backup-ideas-list");

const inboxCount = $("#inbox-count");
const backupCount = $("#backup-count");
const activeCount = $("#active-count");
const completedCount = $("#completed-count");

const searchModal = $("#search-modal");
const ideaDetailsModal = $("#idea-details-modal");
const brainDumpModal = $("#brain-dump-modal");
const focusSelectionModal = $("#focus-selection-modal");
const focusOverflowModal = $("#focus-overflow-modal");
const reviewModal = $("#review-modal");

const searchInput = $("#global-search-input");
const searchStatusFilter = $("#search-status-filter");
const searchTypeFilter = $("#search-type-filter");

const ideaDetailsForm = $("#idea-details-form");
const brainDumpForm = $("#brain-dump-form");


/* =========================================
   4. DATA STORAGE
========================================= */

function loadIdeas() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) return [];

    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(isValidIdea)
      .map(normalizeIdea);

  } catch (error) {
    console.error("Could not load ideas:", error);
    return [];
  }
}

function saveIdeas() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ideas));
}

function loadSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);

    if (!saved) return { ...DEFAULT_SETTINGS };

    const parsed = JSON.parse(saved);

    return {
      primaryId: parsed.primaryId || null,
      secondaryId: parsed.secondaryId || null
    };

  } catch (error) {
    console.error("Could not load settings:", error);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function isValidIdea(idea) {
  return (
    idea &&
    typeof idea === "object" &&
    typeof idea.id === "string" &&
    typeof idea.title === "string" &&
    idea.title.trim().length > 0
  );
}

function normalizeIdea(idea) {
  return {
    id: idea.id,
    title: idea.title.trim(),
    description: idea.description || "",
    type: idea.type || "uncategorized",
    status: idea.status || "inbox",
    collection: idea.collection || "",
    tags: Array.isArray(idea.tags) ? idea.tags : [],
    why: idea.why || "",
    nextAction: idea.nextAction || "",
    progress: idea.progress || "just-an-idea",
    notes: idea.notes || "",
    createdAt: idea.createdAt || new Date().toISOString(),
    updatedAt: idea.updatedAt || new Date().toISOString(),
    lastWorkedOn: idea.lastWorkedOn || null,
    favorite: Boolean(idea.favorite)
  };
}


/* =========================================
   5. UTILITY FUNCTIONS
========================================= */

function createId() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).substring(2, 9)
  );
}

function getIdeaById(id) {
  return ideas.find(idea => idea.id === id);
}

function getPrimaryIdea() {
  return getIdeaById(settings.primaryId);
}

function getSecondaryIdea() {
  return getIdeaById(settings.secondaryId);
}

function formatDate(dateString) {
  if (!dateString) return "";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatRelativeDate(dateString) {
  if (!dateString) return "Not yet";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) return "Not yet";

  const now = new Date();
  const diff = now - date;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return formatDate(dateString);
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getTypeLabel(type) {
  return IDEA_TYPES[type] || "Uncategorized";
}

function getStatusLabel(status) {
  return IDEA_STATUSES[status] || "Inbox";
}

function getProgressLabel(progress) {
  return PROGRESS_STATES[progress] || "Just an idea";
}

function showToast(message, type = "success") {
  const container = $("#toast-container");

  if (!container) return;

  const toast = document.createElement("div");

  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  clearTimeout(toastTimeout);

  toastTimeout = setTimeout(() => {
    toast.remove();
  }, 3000);
}

function updateIdea(id, changes) {
  const idea = getIdeaById(id);

  if (!idea) return;

  Object.assign(idea, changes, {
    updatedAt: new Date().toISOString()
  });

  saveIdeas();
  renderAll();
}

function closeModal(modal) {
  if (modal) {
    modal.hidden = true;
  }
}

function openModal(modal) {
  if (modal) {
    modal.hidden = false;
  }
}

function closeAllModals() {
  $$(".modal-overlay").forEach(modal => {
    modal.hidden = true;
  });
}

function getVisibleIdeas() {
  return ideas.filter(idea => idea.status !== "archived");
}


/* =========================================
   6. IDEA CREATION
========================================= */

function createIdea(title, details = "", extra = {}) {
  const now = new Date().toISOString();

  return {
    id: createId(),
    title: title.trim(),
    description: details.trim(),
    type: extra.type || "uncategorized",
    status: extra.status || "inbox",
    collection: extra.collection || "",
    tags: extra.tags || [],
    why: extra.why || "",
    nextAction: extra.nextAction || "",
    progress: extra.progress || "just-an-idea",
    notes: extra.notes || "",
    createdAt: now,
    updatedAt: now,
    lastWorkedOn: null,
    favorite: false
  };
}

function addIdea(title, details = "", extra = {}) {
  if (!title || !title.trim()) {
    showToast("Please enter an idea first.", "error");
    return null;
  }

  const idea = createIdea(title, details, extra);

  ideas.unshift(idea);
  saveIdeas();
  renderAll();

  return idea;
}

function handleQuickCapture(event) {
  event.preventDefault();

  const title = quickIdeaTitle.value.trim();
  const details = quickIdeaDetails.value.trim();

  if (!title) {
    showToast("Write an idea before saving.", "error");
    quickIdeaTitle.focus();
    return;
  }

  addIdea(title, details);

  quickIdeaTitle.value = "";
  quickIdeaDetails.value = "";

  showToast("Idea saved to Inbox.");

  quickIdeaTitle.focus();
}


/* =========================================
   7. RENDERING
========================================= */

function renderAll() {
  renderFocusCards();
  renderCounts();
  renderRecentIdeas();
  renderBackupIdeas();
}

function renderCounts() {
  const visibleIdeas = getVisibleIdeas();

  const inbox = visibleIdeas.filter(idea => idea.status === "inbox");
  const backup = visibleIdeas.filter(idea => isBackupIdea(idea));
  const active = visibleIdeas.filter(idea => idea.status === "active");
  const completed = ideas.filter(idea => idea.status === "completed");

  inboxCount.textContent = inbox.length;
  backupCount.textContent = backup.length;
  activeCount.textContent = active.length;
  completedCount.textContent = completed.length;
}

function isBackupIdea(idea) {
  return (
    idea.status === "paused" ||
    (
      idea.status === "active" &&
      idea.id !== settings.primaryId &&
      idea.id !== settings.secondaryId
    )
  );
}

function renderFocusCards() {
  renderFocusCard("primary", getPrimaryIdea());
  renderFocusCard("secondary", getSecondaryIdea());
}

function renderFocusCard(type, idea) {
  const emptyState = $(`#${type}-empty-state`);
  const ideaContent = $(`#${type}-idea-content`);

  if (!emptyState || !ideaContent) return;

  if (!idea) {
    emptyState.hidden = false;
    ideaContent.hidden = true;
    return;
  }

  emptyState.hidden = true;
  ideaContent.hidden = false;

  $(`#${type}-idea-title`).textContent = idea.title;

  $(`#${type}-idea-description`).textContent =
    idea.description || "No description yet.";

  $(`#${type}-next-action`).textContent =
    idea.nextAction || "No next action set yet.";

  $(`#${type}-progress`).textContent =
    getProgressLabel(idea.progress);
}

function renderRecentIdeas() {
  const recent = getVisibleIdeas()
    .sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    )
    .slice(0, 5);

  if (recent.length === 0) {
    recentIdeasList.innerHTML = `
      <div class="empty-list-state">
        <span class="empty-state-icon" aria-hidden="true">💡</span>
        <h3>Your ideas will appear here</h3>
        <p>
          Capture your first idea above. It does not need to be organized yet.
        </p>
      </div>
    `;
    return;
  }

  recentIdeasList.innerHTML = recent
    .map(createIdeaListItem)
    .join("");
}

function renderBackupIdeas() {
  const backups = getVisibleIdeas()
    .filter(isBackupIdea)
    .sort((a, b) =>
      new Date(b.updatedAt) - new Date(a.updatedAt)
    )
    .slice(0, 6);

  if (backups.length === 0) {
    backupIdeasList.innerHTML = `
      <div class="empty-list-state">
        <span class="empty-state-icon" aria-hidden="true">🌱</span>
        <h3>No backup ideas yet</h3>
        <p>
          Ideas you are keeping for later will appear here.
        </p>
      </div>
    `;
    return;
  }

  backupIdeasList.innerHTML = backups
    .map(createIdeaListItem)
    .join("");
}

function createIdeaListItem(idea) {
  return `
    <article class="idea-list-item" data-idea-id="${escapeHTML(idea.id)}">

      <div class="idea-list-item-content">

        <div class="idea-list-item-header">

          <h3 class="idea-list-item-title">
            ${escapeHTML(idea.title)}
          </h3>

          <span class="idea-type-badge">
            ${escapeHTML(getTypeLabel(idea.type))}
          </span>

          <span class="idea-status-badge">
            ${escapeHTML(getStatusLabel(idea.status))}
          </span>

        </div>

        <p class="idea-list-item-description">
          ${escapeHTML(
            idea.description || "No description yet."
          )}
        </p>

        <div class="idea-list-item-meta">

          <span>
            Updated ${escapeHTML(formatRelativeDate(idea.updatedAt))}
          </span>

          ${idea.nextAction ? `
            <span>•</span>
            <span>Next: ${escapeHTML(idea.nextAction)}</span>
          ` : ""}

        </div>

      </div>

      <div class="idea-list-item-actions">

        <button
          type="button"
          class="icon-button"
          data-action="favorite"
          data-id="${escapeHTML(idea.id)}"
          aria-label="${idea.favorite ? "Remove favorite" : "Favorite idea"}"
          title="${idea.favorite ? "Remove favorite" : "Favorite"}"
        >
          ${idea.favorite ? "★" : "☆"}
        </button>

        <button
          type="button"
          class="icon-button"
          data-action="edit"
          data-id="${escapeHTML(idea.id)}"
          aria-label="Edit idea"
          title="Edit idea"
        >
          ✎
        </button>

        <button
          type="button"
          class="icon-button"
          data-action="more"
          data-id="${escapeHTML(idea.id)}"
          aria-label="More options"
          title="More options"
        >
          ⋯
        </button>

      </div>

    </article>
  `;
}


/* =========================================
   8. IDEA DETAILS
========================================= */

function openIdeaDetails(id) {
  const idea = getIdeaById(id);

  if (!idea) return;

  currentEditingId = id;

  $("#edit-idea-id").value = idea.id;
  $("#edit-idea-title").value = idea.title;
  $("#edit-idea-description").value = idea.description;
  $("#edit-idea-type").value = idea.type;
  $("#edit-idea-status").value = idea.status;
  $("#edit-idea-collection").value = idea.collection;
  $("#edit-idea-tags").value = idea.tags.join(", ");
  $("#edit-idea-why").value = idea.why;
  $("#edit-idea-next-action").value = idea.nextAction;
  $("#edit-idea-progress").value = idea.progress;
  $("#edit-idea-notes").value = idea.notes;

  openModal(ideaDetailsModal);

  setTimeout(() => {
    $("#edit-idea-title").focus();
  }, 50);
}

function handleIdeaDetailsSubmit(event) {
  event.preventDefault();

  if (!currentEditingId) return;

  const idea = getIdeaById(currentEditingId);

  if (!idea) return;

  const title = $("#edit-idea-title").value.trim();

  if (!title) {
    showToast("An idea needs a title.", "error");
    return;
  }

  const status = $("#edit-idea-status").value;

  const tags = $("#edit-idea-tags").value
    .split(",")
    .map(tag => tag.trim())
    .filter(Boolean);

  updateIdea(currentEditingId, {
    title,
    description: $("#edit-idea-description").value.trim(),
    type: $("#edit-idea-type").value,
    status,
    collection: $("#edit-idea-collection").value,
    tags,
    why: $("#edit-idea-why").value.trim(),
    nextAction: $("#edit-idea-next-action").value.trim(),
    progress: $("#edit-idea-progress").value,
    notes: $("#edit-idea-notes").value.trim()
  });

  closeModal(ideaDetailsModal);
  showToast("Idea updated.");
  currentEditingId = null;
}

function deleteCurrentIdea() {
  if (!currentEditingId) return;

  const idea = getIdeaById(currentEditingId);

  if (!idea) return;

  const confirmed = confirm(
    `Delete "${idea.title}"?\n\nThis cannot be undone.`
  );

  if (!confirmed) return;

  if (settings.primaryId === currentEditingId) {
    settings.primaryId = null;
  }

  if (settings.secondaryId === currentEditingId) {
    settings.secondaryId = null;
  }

  ideas = ideas.filter(item => item.id !== currentEditingId);

  saveIdeas();
  saveSettings();
  renderAll();

  closeModal(ideaDetailsModal);
  showToast("Idea deleted.");
  currentEditingId = null;
}


/* =========================================
   9. FOCUS SYSTEM
========================================= */

function requestFocus(id, choice) {
  const idea = getIdeaById(id);

  if (!idea) return;

  if (choice === "primary" && settings.primaryId === id) {
    showToast("This is already your primary idea.");
    return;
  }

  if (choice === "secondary" && settings.secondaryId === id) {
    showToast("This is already your secondary idea.");
    return;
  }

  currentFocusChoice = choice;
  pendingFocusId = id;

  const existingId =
    choice === "primary"
      ? settings.primaryId
      : settings.secondaryId;

  if (existingId && existingId !== id) {
    openModal(focusOverflowModal);
    return;
  }

  assignFocus(id, choice);
}

function assignFocus(id, choice) {
  const idea = getIdeaById(id);

  if (!idea) return;

  if (choice === "primary") {
    if (settings.secondaryId === id) {
      settings.secondaryId = null;
    }

    settings.primaryId = id;

  } else if (choice === "secondary") {
    if (settings.primaryId === id) {
      settings.primaryId = null;
    }

    settings.secondaryId = id;
  }

  idea.status = "active";
  idea.updatedAt = new Date().toISOString();

  saveIdeas();
  saveSettings();
  renderAll();

  closeAllModals();

  showToast(
    choice === "primary"
      ? "Primary idea updated."
      : "Secondary idea updated."
  );
}

function removeFocus(choice) {
  if (choice === "primary") {
    settings.primaryId = null;
  } else if (choice === "secondary") {
    settings.secondaryId = null;
  }

  saveSettings();
  renderAll();
}

function handleFocusOverflow(choice) {
  if (!pendingFocusId) return;

  if (choice === "replace-primary") {
    assignFocus(pendingFocusId, "primary");

  } else if (choice === "replace-secondary") {
    assignFocus(pendingFocusId, "secondary");

  } else if (choice === "backup") {
    const idea = getIdeaById(pendingFocusId);

    if (idea) {
      idea.status = "paused";
      idea.updatedAt = new Date().toISOString();

      saveIdeas();
      renderAll();

      closeAllModals();
      showToast("Idea saved as backup.");
    }
  }

  pendingFocusId = null;
  currentFocusChoice = null;
}

function handleChooseFocus() {
  const activeIdeas = getVisibleIdeas()
    .filter(idea => idea.status === "active");

  if (activeIdeas.length === 0) {
    showToast("You have no active ideas yet. Choose one from your Inbox.");
    return;
  }

  currentReviewIdeas = activeIdeas;
  currentReviewIndex = 0;

  showFocusChooser();
}

function showFocusChooser() {
  const idea = currentReviewIdeas[currentReviewIndex];

  if (!idea) return;

  openIdeaDetails(idea.id);
}


/* =========================================
   10. SEARCH
========================================= */

function openSearch() {
  openModal(searchModal);

  setTimeout(() => {
    searchInput.focus();
    performSearch();
  }, 50);
}

function performSearch() {
  const query = searchInput.value.trim().toLowerCase();
  const status = searchStatusFilter.value;
  const type = searchTypeFilter.value;

  let results = getVisibleIdeas();

  if (query) {
    results = results.filter(idea => {
      const searchable = [
        idea.title,
        idea.description,
        idea.notes,
        idea.why,
        idea.nextAction,
        idea.collection,
        idea.tags.join(" "),
        getTypeLabel(idea.type),
        getStatusLabel(idea.status)
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }

  if (status !== "all") {
    results = results.filter(idea => idea.status === status);
  }

  if (type !== "all") {
    results = results.filter(idea => idea.type === type);
  }

  results.sort((a, b) =>
    new Date(b.updatedAt) - new Date(a.updatedAt)
  );

  const resultsContainer = $("#search-results");

  if (results.length === 0) {
    resultsContainer.innerHTML = `
      <div class="empty-list-state">
        <span class="empty-state-icon" aria-hidden="true">🔍</span>
        <h3>No ideas found</h3>
        <p>Try another search or filter.</p>
      </div>
    `;
    return;
  }

  resultsContainer.innerHTML = results
    .map(createIdeaListItem)
    .join("");
}


/* =========================================
   11. BRAIN DUMP
========================================= */

function openBrainDump() {
  openModal(brainDumpModal);

  setTimeout(() => {
    $("#brain-dump-content").focus();
  }, 50);
}

function handleBrainDumpSubmit(event) {
  event.preventDefault();

  const title =
    $("#brain-dump-title-input").value.trim() ||
    "Untitled Brain Dump";

  const content =
    $("#brain-dump-content").value.trim();

  if (!content) {
    showToast("Write something before saving.", "error");
    return;
  }

  addIdea(title, content, {
    type: "other",
    status: "inbox",
    notes: content
  });

  brainDumpForm.reset();

  closeModal(brainDumpModal);
  showToast("Brain dump saved to Inbox.");
}


/* =========================================
   12. REVIEW SYSTEM
========================================= */

function startReview() {
  currentReviewIdeas = getVisibleIdeas()
    .filter(idea => idea.status !== "completed")
    .sort((a, b) =>
      new Date(a.updatedAt) - new Date(b.updatedAt)
    );

  currentReviewIndex = 0;

  if (currentReviewIdeas.length === 0) {
    showToast("You have no ideas to review right now.");
    return;
  }

  showReviewIdea();
  openModal(reviewModal);
}

function showReviewIdea() {
  const idea = currentReviewIdeas[currentReviewIndex];

  if (!idea) return;

  $("#review-idea-type").textContent =
    getTypeLabel(idea.type);

  $("#review-idea-title").textContent =
    idea.title;

  $("#review-idea-description").textContent =
    idea.description || "No description yet.";
}

function handleReviewAction(action) {
  const idea = currentReviewIdeas[currentReviewIndex];

  if (!idea) return;

  if (action === "keep") {
    idea.status = "inbox";
    showToast("Idea kept in Inbox.");

  } else if (action === "develop") {
    idea.status = "clarifying";
    showToast("Idea moved to Clarifying.");

  } else if (action === "pause") {
    idea.status = "paused";
    showToast("Idea paused.");

  } else if (action === "archive") {
    idea.status = "archived";
    showToast("Idea archived.");
  }

  idea.updatedAt = new Date().toISOString();

  saveIdeas();
  renderAll();

  currentReviewIndex++;

  if (currentReviewIndex >= currentReviewIdeas.length) {
    closeModal(reviewModal);
    showToast("Review complete.");
  } else {
    showReviewIdea();
  }
}


/* =========================================
   13. FAVORITES & QUICK ACTIONS
========================================= */

function toggleFavorite(id) {
  const idea = getIdeaById(id);

  if (!idea) return;

  idea.favorite = !idea.favorite;
  idea.updatedAt = new Date().toISOString();

  saveIdeas();
  renderAll();

  showToast(
    idea.favorite
      ? "Added to favorites."
      : "Removed from favorites."
  );
}

function handleIdeaAction(action, id) {
  const idea = getIdeaById(id);

  if (!idea) return;

  if (action === "edit") {
    openIdeaDetails(id);

  } else if (action === "favorite") {
    toggleFavorite(id);

  } else if (action === "more") {
    openIdeaDetails(id);
  }
}


/* =========================================
   14. DATA EXPORT / IMPORT
========================================= */

function exportData() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    ideas,
    settings
  };

  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "idea-vault-backup.json";
  link.click();

  URL.revokeObjectURL(url);

  showToast("Backup exported.");
}

function importData() {
  const input = document.createElement("input");

  input.type = "file";
  input.accept = ".json,application/json";

  input.addEventListener("change", event => {
    const file = event.target.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);

        const importedIdeas = Array.isArray(parsed)
          ? parsed
          : parsed.ideas;

        if (!Array.isArray(importedIdeas)) {
          throw new Error("Invalid backup format.");
        }

        const validIdeas = importedIdeas
          .filter(isValidIdea)
          .map(normalizeIdea);

        if (validIdeas.length === 0) {
          showToast("No valid ideas found in backup.", "error");
          return;
        }

        const confirmed = confirm(
          `Import ${validIdeas.length} ideas?\n\n` +
          "This will replace your current ideas."
        );

        if (!confirmed) return;

        ideas = validIdeas;

        if (parsed.settings) {
          settings = {
            primaryId: parsed.settings.primaryId || null,
            secondaryId: parsed.settings.secondaryId || null
          };
        } else {
          settings = { ...DEFAULT_SETTINGS };
        }

        saveIdeas();
        saveSettings();
        renderAll();

        showToast("Backup imported successfully.");

      } catch (error) {
        console.error("Import failed:", error);
        showToast("Could not import this backup.", "error");
      }
    };

    reader.readAsText(file);
  });

  input.click();
}


/* =========================================
   15. VOICE CAPTURE
========================================= */

function startVoiceCapture() {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    showToast(
      "Voice capture is not supported in this browser.",
      "error"
    );
    return;
  }

  const recognition = new SpeechRecognition();

  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onstart = () => {
    showToast("Listening...");
  };

  recognition.onresult = event => {
    const transcript =
      event.results[0][0].transcript;

    quickIdeaTitle.value = transcript;
    quickIdeaTitle.focus();

    showToast("Voice captured. Review and save.");
  };

  recognition.onerror = () => {
    showToast("Voice capture could not be completed.", "error");
  };

  recognition.start();
}


/* =========================================
   16. EVENT LISTENERS
========================================= */

function initializeEventListeners() {

  /* Quick capture */

  quickCaptureForm.addEventListener(
    "submit",
    handleQuickCapture
  );

  $("#quick-capture-header").addEventListener(
    "click",
    () => quickIdeaTitle.focus()
  );

  $("#voice-capture-button").addEventListener(
    "click",
    startVoiceCapture
  );


  /* Search */

  $("#search-toggle").addEventListener(
    "click",
    openSearch
  );

  searchInput.addEventListener(
    "input",
    performSearch
  );

  searchStatusFilter.addEventListener(
    "change",
    performSearch
  );

  searchTypeFilter.addEventListener(
    "change",
    performSearch
  );


  /* Focus */

  $("#choose-focus-button").addEventListener(
    "click",
    handleChooseFocus
  );

  $("#choose-primary-button").addEventListener(
    "click",
    () => {
      const idea = getVisibleIdeas()[0];

      if (idea) {
        requestFocus(idea.id, "primary");
      } else {
        showToast("Capture an idea first.");
      }
    }
  );

  $("#choose-secondary-button").addEventListener(
    "click",
    () => {
      const idea = getVisibleIdeas()[0];

      if (idea) {
        requestFocus(idea.id, "secondary");
      } else {
        showToast("Capture an idea first.");
      }
    }
  );

  $("#continue-primary-button").addEventListener(
    "click",
    () => {
      const idea = getPrimaryIdea();

      if (idea) {
        idea.lastWorkedOn = new Date().toISOString();
        saveIdeas();
        openIdeaDetails(idea.id);
      }
    }
  );

  $("#continue-secondary-button").addEventListener(
    "click",
    () => {
      const idea = getSecondaryIdea();

      if (idea) {
        idea.lastWorkedOn = new Date().toISOString();
        saveIdeas();
        openIdeaDetails(idea.id);
      }
    }
  );


  /* Focus overflow */

  $("#replace-primary-button").addEventListener(
    "click",
    () => handleFocusOverflow("replace-primary")
  );

  $("#replace-secondary-button").addEventListener(
    "click",
    () => handleFocusOverflow("replace-secondary")
  );

  $("#keep-backup-button").addEventListener(
    "click",
    () => handleFocusOverflow("backup")
  );


  /* Idea details */

  ideaDetailsForm.addEventListener(
    "submit",
    handleIdeaDetailsSubmit
  );

  $("#delete-idea-button").addEventListener(
    "click",
    deleteCurrentIdea
  );


  /* Brain Dump */

  brainDumpForm.addEventListener(
    "submit",
    handleBrainDumpSubmit
  );


  /* Review */

  $("#start-review-button").addEventListener(
    "click",
    startReview
  );

  $("#review-keep-button").addEventListener(
    "click",
    () => handleReviewAction("keep")
  );

  $("#review-develop-button").addEventListener(
    "click",
    () => handleReviewAction("develop")
  );

  $("#review-pause-button").addEventListener(
    "click",
    () => handleReviewAction("pause")
  );

  $("#review-archive-button").addEventListener(
    "click",
    () => handleReviewAction("archive")
  );

  $("#review-next-button").addEventListener(
    "click",
    () => {
      currentReviewIndex++;

      if (currentReviewIndex >= currentReviewIdeas.length) {
        currentReviewIndex = 0;
      }

      showReviewIdea();
    }
  );


  /* Overview */

  $("#open-inbox-button").addEventListener(
    "click",
    openSearch
  );

  $("#open-backup-button").addEventListener(
    "click",
    openSearch
  );

  $("#open-active-button").addEventListener(
    "click",
    openSearch
  );

  $("#open-completed-button").addEventListener(
    "click",
    openSearch
  );

  $("#view-all-recent-button").addEventListener(
    "click",
    openSearch
  );

  $("#view-all-backup-button").addEventListener(
    "click",
    openSearch
  );


  /* Close modals */

  $$("[data-close-modal]").forEach(button => {
    button.addEventListener("click", () => {
      const modalId = button.dataset.closeModal;
      closeModal($(`#${modalId}`));
    });
  });

  $$(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", event => {
      if (event.target === overlay) {
        closeModal(overlay);
      }
    });
  });


  /* Idea list actions */

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");

    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    handleIdeaAction(action, id);
  });


  /* Focus menus */

  $$("[data-focus-menu]").forEach(button => {
    button.addEventListener("click", () => {
      const type = button.dataset.focusMenu;
      const idea = type === "primary"
        ? getPrimaryIdea()
        : getSecondaryIdea();

      if (!idea) return;

      openIdeaDetails(idea.id);
    });
  });


  /* Keyboard shortcuts */

  document.addEventListener("keydown", event => {

    const isTyping =
      event.target.tagName === "INPUT" ||
      event.target.tagName === "TEXTAREA" ||
      event.target.tagName === "SELECT";

    if ((event.ctrlKey || event.metaKey) && event.key === "k") {
      event.preventDefault();
      openSearch();
    }

    if ((event.ctrlKey || event.metaKey) && event.key === "n") {
      event.preventDefault();
      quickIdeaTitle.focus();
    }

    if (event.key === "Escape") {
      closeAllModals();
    }

    if (event.key === "b" && !isTyping) {
      openBrainDump();
    }

  });

}


/* =========================================
   17. INITIALIZE
========================================= */

function initializeApp() {
  initializeEventListeners();
  renderAll();
}

initializeApp();
