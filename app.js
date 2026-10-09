import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getDatabase, onValue, push, ref } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import { createIcons, icons } from "https://cdn.jsdelivr.net/npm/lucide@0.468.0/+esm";
import { currencyCode, firebaseConfig } from "./firebase-config.js";

const COMMUNITY_CODE = "GodiaHouse";
const firebaseConfigured = !Object.values(firebaseConfig).some((value) => typeof value === "string" && value.startsWith("YOUR_"));
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
const money = new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode });
const elements = Object.fromEntries([
  "authView", "registerView", "authFooter", "signoutButton", "connectionLabel", "authForm", "authTitle", "authSubtitle", "authSubmit", "authMessage", "nameField", "displayName", "email", "password", "accessCode", "signinTab", "signupTab", "googleButton", "welcomeName", "currentDate", "paymentName", "paymentDate", "paymentForm", "amount", "confirmPayment", "paymentMessage", "paymentDialog", "dialogName", "dialogAmount", "dialogDate", "confirmSubmit", "cancelPayment", "monthAsideLabel", "monthTotal", "memberCount", "ledgerCount", "paymentPage", "ledgerPage", "ledgerRows", "ledgerEmpty", "ledgerLoading", "ledgerTotal", "ledgerMonthTitle", "ledgerMonthInline", "previousMonth", "nextMonth", "currencyPrefix", "year",
].map((key) => [key, document.getElementById(key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`))]));

let isSignUp = false;
let currentUser = null;
let selectedMonth = monthKey(new Date());
let stopListening = null;
let pendingPayment = null;

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthDate(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function monthLabel(key, options = { month: "long", year: "numeric" }) {
  return new Intl.DateTimeFormat(undefined, options).format(monthDate(key));
}

function announce(element, message, isError = true) {
  element.textContent = message;
  element.classList.toggle("error", isError && Boolean(message));
  element.classList.toggle("success", !isError && Boolean(message));
}

function refreshIcons() {
  createIcons({ icons });
}

function setAuthMode(signUp) {
  isSignUp = signUp;
  elements.authTitle.textContent = signUp ? "Join your community" : "Welcome back";
  elements.authSubtitle.textContent = signUp
    ? "Create an account to verify token payments."
    : "Sign in to continue to your register.";
  elements.nameField.classList.toggle("hidden", !signUp);
  elements.displayName.required = signUp;
  elements.password.autocomplete = signUp ? "new-password" : "current-password";
  elements.authSubmit.querySelector("span").textContent = signUp ? "Create account" : "Sign in securely";
  elements.signinTab.classList.toggle("active", !signUp);
  elements.signupTab.classList.toggle("active", signUp);
  elements.signinTab.setAttribute("aria-selected", String(!signUp));
  elements.signupTab.setAttribute("aria-selected", String(signUp));
  announce(elements.authMessage, "");
}

function validateCommunityCode() {
  if (elements.accessCode.value.trim() !== COMMUNITY_CODE) {
    announce(elements.authMessage, "That community access code is not recognized.");
    elements.accessCode.focus();
    return false;
  }
  sessionStorage.setItem("communityAccessGranted", "yes");
  return true;
}

function getMemberName(user = currentUser) {
  return user?.displayName?.trim() || user?.email?.split("@")[0] || "Community member";
}

function enterRegister(user) {
  currentUser = user;
  sessionStorage.setItem("currentAccessUid", user.uid);
  elements.authView.classList.add("hidden");
  elements.authFooter.classList.add("hidden");
  elements.registerView.classList.remove("hidden");
  elements.signoutButton.classList.remove("hidden");
  elements.welcomeName.textContent = `${getMemberName(user)}.`;
  elements.paymentName.textContent = getMemberName(user);
  const today = new Date();
  elements.currentDate.textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(today);
  elements.paymentDate.textContent = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(today);
  elements.connectionLabel.textContent = "Connected";
  selectedMonth = monthKey(today);
  listenToMonth(selectedMonth);
  refreshIcons();
}

function leaveRegister() {
  currentUser = null;
  if (stopListening) stopListening();
  stopListening = null;
  sessionStorage.removeItem("currentAccessUid");
  sessionStorage.removeItem("communityAccessGranted");
  elements.registerView.classList.add("hidden");
  elements.authFooter.classList.remove("hidden");
  elements.authView.classList.remove("hidden");
  elements.signoutButton.classList.add("hidden");
  elements.connectionLabel.textContent = "Connected";
  refreshIcons();
}

function renderLedger(payments) {
  const byMember = new Map();
  for (const [id, payment] of Object.entries(payments || {})) {
    if (payment.confirmed !== true || !Number.isFinite(Number(payment.amount)) || Number(payment.amount) <= 0) continue;
    const uid = payment.uid || `legacy-${id}`;
    const prior = byMember.get(uid);
    if (prior) {
      prior.amount += Number(payment.amount);
      prior.paidAt = Math.max(prior.paidAt, Number(payment.paidAt) || 0);
      if (payment.name) prior.name = payment.name;
    } else {
      byMember.set(uid, { ...payment, uid, amount: Number(payment.amount), paidAt: Number(payment.paidAt) || 0 });
    }
  }
  const rows = [...byMember.values()].sort((a, b) => b.paidAt - a.paidAt);
  const totalAmount = rows.reduce((total, payment) => total + payment.amount, 0);
  elements.ledgerRows.replaceChildren();
  elements.ledgerCount.textContent = String(rows.length);
  elements.ledgerTotal.textContent = `${rows.length} ${rows.length === 1 ? "MEMBER" : "MEMBERS"} VERIFIED`;
  elements.monthTotal.textContent = String(rows.length);
  document.getElementById("ledger-month-amount").textContent = money.format(totalAmount);
  elements.memberCount.textContent = `${rows.length} ${rows.length === 1 ? "member verified" : "members verified"}`;
  elements.ledgerEmpty.classList.toggle("hidden", rows.length > 0);

  for (const payment of rows) {
    const row = document.createElement("tr");
    if (payment.amount >= 500) {
      row.classList.add("ledger-row--milestone");
    } else if (payment.amount > 400) {
      row.classList.add("ledger-row--progress");
    } else if (payment.amount >= 400) {
      row.classList.add("ledger-row--safe");
    }
    const member = document.createElement("td");
    const memberWrap = document.createElement("div");
    memberWrap.className = "member-cell";
    const avatar = document.createElement("span");
    avatar.className = "member-avatar";
    avatar.textContent = (payment.name || "?").trim().slice(0, 1).toUpperCase();
    const memberName = document.createElement("span");
    memberName.className = "member-name";
    memberName.textContent = payment.name || "Community member";
    memberWrap.append(avatar, memberName);
    if (payment.amount >= 500) {
      const rewardBadge = document.createElement("span");
      rewardBadge.className = "member-reward";
      rewardBadge.setAttribute("role", "img");
      rewardBadge.setAttribute("aria-label", `${money.format(500)} payment milestone`);
      rewardBadge.title = `${money.format(500)} payment milestone`;
      rewardBadge.innerHTML = '<i data-lucide="award"></i>';
      memberWrap.append(rewardBadge);
    }
    member.append(memberWrap);

    const dateCell = document.createElement("td");
    const date = new Date(Number(payment.paidAt));
    dateCell.textContent = Number.isNaN(date.valueOf()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
    const amountCell = document.createElement("td");
    amountCell.className = "amount-cell";
    amountCell.textContent = money.format(Number(payment.amount));
    const statusCell = document.createElement("td");
    statusCell.innerHTML = '<span class="verified-badge"><span class="status-dot"></span>Verified</span>';
    row.append(member, dateCell, amountCell, statusCell);
    elements.ledgerRows.append(row);
  }
  refreshIcons();
}

function listenToMonth(month) {
  selectedMonth = month;
  if (stopListening) stopListening();
  const formattedMonth = monthLabel(month);
  elements.monthAsideLabel.textContent = formattedMonth;
  elements.ledgerMonthTitle.textContent = formattedMonth;
  elements.ledgerMonthInline.textContent = formattedMonth;
  elements.ledgerLoading.classList.remove("hidden");
  elements.ledgerEmpty.classList.add("hidden");
  elements.ledgerRows.replaceChildren();
  const current = monthKey(new Date());
  elements.nextMonth.disabled = month >= current;
  stopListening = onValue(ref(database, `payments/${month}`), (snapshot) => {
    elements.ledgerLoading.classList.add("hidden");
    renderLedger(snapshot.val());
  }, (error) => {
    elements.ledgerLoading.classList.add("hidden");
    elements.connectionLabel.textContent = "Check database rules";
    announce(elements.paymentMessage, `Could not load the register: ${error.message}`);
  });
}

async function submitPayment() {
  const amount = Number(elements.amount.value);
  if (!Number.isFinite(amount) || amount <= 0 || !elements.confirmPayment.checked) return;
  const paidAt = Date.now();
  const month = monthKey(new Date(paidAt));
  elements.confirmSubmit.disabled = true;
  elements.confirmSubmit.innerHTML = '<span class="loading-spinner"></span> Saving...';
  try {
    await push(ref(database, `payments/${month}`), {
      uid: currentUser.uid,
      name: getMemberName(),
      amount,
      paidAt,
      confirmed: true,
    });
    elements.paymentDialog.close();
    elements.paymentForm.reset();
    announce(elements.paymentMessage, "Payment confirmed and added to your monthly total.", false);
    listenToMonth(month);
  } catch (error) {
    elements.paymentDialog.close();
    announce(elements.paymentMessage, `Payment could not be saved: ${error.message}`);
  } finally {
    elements.confirmSubmit.disabled = false;
    elements.confirmSubmit.innerHTML = 'Confirm payment <i data-lucide="check"></i>';
    refreshIcons();
  }
}

elements.signinTab.addEventListener("click", () => setAuthMode(false));
elements.signupTab.addEventListener("click", () => setAuthMode(true));
elements.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  announce(elements.authMessage, "");
  if (!firebaseConfigured) {
    announce(elements.authMessage, "Add your Firebase project settings in firebase-config.js before signing in.");
    return;
  }
  if (!elements.authForm.reportValidity() || !validateCommunityCode()) return;
  elements.authSubmit.disabled = true;
  try {
    if (isSignUp) {
      const credential = await createUserWithEmailAndPassword(auth, elements.email.value.trim(), elements.password.value);
      await updateProfile(credential.user, { displayName: elements.displayName.value.trim() });
      enterRegister(credential.user);
    } else {
      const credential = await signInWithEmailAndPassword(auth, elements.email.value.trim(), elements.password.value);
      enterRegister(credential.user);
    }
  } catch (error) {
    const friendly = {
      "auth/email-already-in-use": "An account already exists for that email. Try signing in.",
      "auth/invalid-credential": "Email or password is incorrect.",
      "auth/operation-not-allowed": "Email and password sign-in is disabled. In Firebase Console, open Authentication > Sign-in method and enable Email/Password.",
      "auth/weak-password": "Choose a password with at least 6 characters.",
      "auth/invalid-email": "Enter a valid email address.",
      "auth/popup-closed-by-user": "The sign-in window was closed before finishing.",
      "auth/account-exists-with-different-credential": "An account already uses this email with another sign-in method.",
    };
    announce(elements.authMessage, friendly[error.code] || error.message);
  } finally {
    elements.authSubmit.disabled = false;
  }
});

async function signInWithProvider(provider) {
  if (!firebaseConfigured) {
    announce(elements.authMessage, "Add your Firebase project settings in firebase-config.js before signing in.");
    return;
  }
  if (!validateCommunityCode()) return;
  try {
    const result = await signInWithPopup(auth, provider);
    enterRegister(result.user);
  } catch (error) {
    announce(elements.authMessage, error.code === "auth/popup-closed-by-user" ? "The sign-in window was closed before finishing." : error.message);
  }
}

elements.googleButton.addEventListener("click", () => signInWithProvider(new GoogleAuthProvider()));
elements.signoutButton.addEventListener("click", () => signOut(auth));

elements.paymentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  announce(elements.paymentMessage, "");
  if (!elements.paymentForm.reportValidity()) return;
  if (!elements.confirmPayment.checked) {
    announce(elements.paymentMessage, "Check the confirmation box before continuing.");
    return;
  }
  pendingPayment = Number(elements.amount.value);
  elements.dialogName.textContent = getMemberName();
  elements.dialogAmount.textContent = money.format(pendingPayment);
  elements.dialogDate.textContent = new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date());
  elements.paymentDialog.showModal();
});
elements.confirmSubmit.addEventListener("click", submitPayment);
elements.cancelPayment.addEventListener("click", () => elements.paymentDialog.close());
document.querySelector(".dialog-close-form").addEventListener("submit", () => elements.paymentDialog.close());

document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => {
  const showLedger = button.dataset.page === "ledger";
  elements.paymentPage.classList.toggle("hidden", showLedger);
  elements.ledgerPage.classList.toggle("hidden", !showLedger);
  document.querySelectorAll(".workspace-tab").forEach((tab) => {
    const selected = tab.dataset.page === (showLedger ? "ledger" : "payment");
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-current", selected ? "page" : "false");
  });
  refreshIcons();
}));

elements.previousMonth.addEventListener("click", () => {
  const date = monthDate(selectedMonth);
  date.setMonth(date.getMonth() - 1);
  listenToMonth(monthKey(date));
});
elements.nextMonth.addEventListener("click", () => {
  const date = monthDate(selectedMonth);
  date.setMonth(date.getMonth() + 1);
  if (monthKey(date) <= monthKey(new Date())) listenToMonth(monthKey(date));
});

if (firebaseConfigured) {
  onAuthStateChanged(auth, async (user) => {
    if (user && sessionStorage.getItem("communityAccessGranted") === "yes") {
      enterRegister(user);
    } else {
      if (user) await signOut(auth);
      leaveRegister();
    }
  });
} else {
  elements.connectionLabel.textContent = "Setup required";
  elements.googleButton.disabled = true;
  elements.authSubmit.disabled = true;
  announce(elements.authMessage, "Connect a Firebase project in firebase-config.js to enable sign in and payment records.");
}

elements.year.textContent = String(new Date().getFullYear());
elements.currencyPrefix.textContent = currencyCode;
refreshIcons();
