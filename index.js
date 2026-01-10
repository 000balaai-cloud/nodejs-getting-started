const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const WHATSAPP_API = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

/* ================= SESSION STORE ================= */
const sessions = {};

/* ================= WEBHOOK VERIFY ================= */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/* ================= WEBHOOK RECEIVE ================= */
app.post("/webhook", async (req, res) => {
  try {
    const message =
      req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;
    const btn = message.button?.payload;
    const text = message.text?.body?.toLowerCase();

    console.log("📩 Incoming:", btn || text);

    if (!sessions[from]) {
      sessions[from] = { step: "MENU" };
      await sendMainMenu(from);
      return res.sendStatus(200);
    }

    const s = sessions[from];

    /* ---------- BACK BUTTON ---------- */
    if (btn === "BACK") {
      s.step = "MENU";
      await sendMainMenu(from);
      return res.sendStatus(200);
    }

    /* ================= FLOW ================= */
    switch (s.step) {
      /* ---------- MENU ---------- */
      case "MENU":
        handleMenuSelection(btn, s);
        if (!s.product && btn !== "OWNER") {
          await sendMainMenu(from);
          break;
        }

        if (btn === "OWNER") {
          await sendText(from, "📞 Owner will contact you shortly.");
          delete sessions[from];
          break;
        }

        s.step = "QTY";
        await sendQuantity(from, s);
        break;

      /* ---------- QUANTITY ---------- */
      case "QTY":
        handleQuantity(btn, s);
        if (!s.qty) {
          await sendQuantity(from, s);
          break;
        }

        s.step = "SUMMARY";
        await sendSummary(from, s);
        break;

      /* ---------- SUMMARY ---------- */
      case "SUMMARY":
        await sendText(
          from,
          `✅ *Order received!*\n\n🛒 ${s.product}\n📦 ${s.qty}\n💰 ₹${s.total}\n\n🙏 Thank you for ordering from *Bala Milk Store* 🥛`
        );
        delete sessions[from];
        break;
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook Error:", err.response?.data || err.message);
    res.sendStatus(200);
  }
});

/* ================= HELPERS ================= */

function handleMenuSelection(btn, s) {
  const products = {
    BUFFALO: { name: "Buffalo Milk", price: 100 },
    COW: { name: "Cow Milk", price: 120 },
    PANEER: { name: "Paneer", price: 600 },
    GHEE: { name: "Ghee", price: 1000 },
    SUBS: { name: "Daily Milk Subscription", price: 0 },
  };

  if (products[btn]) {
    s.product = products[btn].name;
    s.price = products[btn].price;
  }
}

function handleQuantity(btn, s) {
  const map = {
    Q500: { qty: "500 ml", mul: 0.5 },
    Q1: { qty: "1 L", mul: 1 },
    Q2: { qty: "2 L", mul: 2 },
  };

  if (!map[btn]) return;

  s.qty = map[btn].qty;
  s.total = s.price * map[btn].mul;
}

/* ================= SENDERS ================= */

async function sendMainMenu(to) {
  await sendButtons(
    to,
    `🥛 *Welcome to Bala Milk Store*\n\nPlease choose an option:`,
    [
      { id: "BUFFALO", title: "Buffalo Milk ₹100/L" },
      { id: "COW", title: "Cow Milk ₹120/L" },
      { id: "PANEER", title: "Paneer ₹600/Kg" },
      { id: "GHEE", title: "Ghee ₹1000/Kg" },
      { id: "SUBS", title: "Daily Milk Subscription" },
      { id: "OWNER", title: "Talk to Owner" },
    ]
  );
}

async function sendQuantity(to, s) {
  await sendButtons(
    to,
    `🧾 *${s.product}*\nSelect quantity:`,
    [
      { id: "Q500", title: "500 ml" },
      { id: "Q1", title: "1 L" },
      { id: "Q2", title: "2 L" },
      { id: "BACK", title: "⬅ Back" },
    ]
  );
}

async function sendSummary(to, s) {
  await sendButtons(
    to,
    `🧾 *Order Summary*\n\n🛒 ${s.product}\n📦 ${s.qty}\n💰 ₹${s.total}\n\nConfirm order?`,
    [{ id: "CONFIRM", title: "Confirm ✅" }, { id: "BACK", title: "⬅ Back" }]
  );
}

async function sendText(to, text) {
  await axios.post(
    WHATSAPP_API,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

async function sendButtons(to, body, buttons) {
  await axios.post(
    WHATSAPP_API,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

/* ================= START ================= */
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
